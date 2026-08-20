import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateMarketplaceCategoryDto } from './dto/create-marketplace-category.dto';
import { UpdateMarketplaceCategoryDto } from './dto/update-marketplace-category.dto';
import { CreateCategoryAttributeDto } from './dto/create-category-attribute.dto';

@Injectable()
export class MarketplaceCategoriesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new marketplace category
   */
  async create(
    createCategoryDto: CreateMarketplaceCategoryDto,
  ): Promise<any> {
    // Validate parent category if provided
    let parentLevel = 0;
    if (createCategoryDto.parentId) {
      const parent = await this.prisma.client.marketplaceCategory.findUnique({
        where: { id: createCategoryDto.parentId },
        select: { id: true, isActive: true, level: true },
      });

      if (!parent) {
        throw new NotFoundException('Parent category not found');
      }

      if (!parent.isActive) {
        throw new BadRequestException(
          'Cannot create category under an inactive parent',
        );
      }

      parentLevel = parent.level;
    }

    // Check slug uniqueness
    const existingSlug = await this.prisma.client.marketplaceCategory.findUnique(
      {
        where: { slug: createCategoryDto.slug },
        select: { id: true },
      },
    );

    if (existingSlug) {
      throw new BadRequestException('Category slug must be unique');
    }

    return this.prisma.client.marketplaceCategory.create({
      data: {
        name: createCategoryDto.name,
        slug: createCategoryDto.slug,
        description: createCategoryDto.description,
        parentId: createCategoryDto.parentId || null,
        level: createCategoryDto.parentId ? parentLevel + 1 : 0,
        sortOrder: createCategoryDto.sortOrder ?? 0,
        isActive: true,
      },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  /**
   * Get all root categories (level 0) with hierarchical structure
   */
  async findAllWithHierarchy(includeInactive: boolean = false): Promise<any[]> {
    const roots = await this.prisma.client.marketplaceCategory.findMany({
      where: {
        parentId: null,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { sortOrder: 'asc' },
      include: {
        children: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: { sortOrder: 'asc' },
          include: {
            children: {
              where: includeInactive ? {} : { isActive: true },
              orderBy: { sortOrder: 'asc' },
              include: {
                children: {
                  where: includeInactive ? {} : { isActive: true },
                  orderBy: { sortOrder: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    return roots;
  }

  /**
   * Get a flattened list of all categories
   */
  async findAll(includeInactive: boolean = false): Promise<any[]> {
    return this.prisma.client.marketplaceCategory.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
      include: {
        parent: {
          select: { id: true, name: true, slug: true },
        },
        attributes: {
          include: {
            attribute: {
              select: { id: true, name: true, type: true },
            },
          },
        },
        _count: {
          select: { products: true, children: true },
        },
      },
    });
  }

  /**
   * Get a single category with full details
   */
  async findOne(id: string): Promise<any> {
    const category = await this.prisma.client.marketplaceCategory.findUnique({
      where: { id },
      include: {
        parent: {
          select: { id: true, name: true, slug: true },
        },
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        attributes: {
          include: {
            attribute: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
        products: {
          select: {
            id: true,
            name: true,
          },
          take: 5, // Show first 5 products
        },
        _count: {
          select: { products: true, children: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  /**
   * Get category by slug
   */
  async findBySlug(slug: string): Promise<any> {
    const category = await this.prisma.client.marketplaceCategory.findUnique({
      where: { slug },
      include: {
        parent: {
          select: { id: true, name: true, slug: true },
        },
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
        attributes: {
          include: {
            attribute: true,
          },
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { products: true, children: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  /**
   * Get the full breadcrumb path for a category
   */
  async getCategoryBreadcrumb(id: string): Promise<any[]> {
    const category = await this.findOne(id);
    const breadcrumb = [category];

    let current = category;
    while (current.parentId) {
      current = await this.prisma.client.marketplaceCategory.findUnique({
        where: { id: current.parentId },
      });
      if (current) {
        breadcrumb.unshift(current);
      }
    }

    return breadcrumb;
  }

  /**
   * Update a category
   */
  async update(
    id: string,
    updateCategoryDto: UpdateMarketplaceCategoryDto,
  ): Promise<any> {
    const category = await this.findOne(id);

    // Validate new parent if provided
    if (
      updateCategoryDto.parentId !== undefined &&
      updateCategoryDto.parentId !== category.parentId
    ) {
      if (updateCategoryDto.parentId) {
        // Prevent circular hierarchy
        if (updateCategoryDto.parentId === id) {
          throw new BadRequestException(
            'Category cannot be its own parent',
          );
        }

        // Check if new parent is a descendant (would create cycle)
        const isDescendant = await this.isDescendant(
          id,
          updateCategoryDto.parentId,
        );
        if (isDescendant) {
          throw new BadRequestException(
            'Cannot move category under its own descendant',
          );
        }

        const parent =
          await this.prisma.client.marketplaceCategory.findUnique({
            where: { id: updateCategoryDto.parentId },
            select: { id: true, isActive: true, level: true },
          });

        if (!parent) {
          throw new NotFoundException('Parent category not found');
        }

        if (!parent.isActive) {
          throw new BadRequestException(
            'Cannot move category under an inactive parent',
          );
        }
      }
    }

    // Check slug uniqueness if slug is being updated
    if (updateCategoryDto.slug && updateCategoryDto.slug !== category.slug) {
      const existingSlug =
        await this.prisma.client.marketplaceCategory.findUnique({
          where: { slug: updateCategoryDto.slug },
          select: { id: true },
        });

      if (existingSlug) {
        throw new BadRequestException('Category slug must be unique');
      }
    }

    const updateData: any = {};

    if (updateCategoryDto.name) updateData.name = updateCategoryDto.name;
    if (updateCategoryDto.slug) updateData.slug = updateCategoryDto.slug;
    if (updateCategoryDto.description !== undefined) {
      updateData.description = updateCategoryDto.description;
    }
    if (updateCategoryDto.parentId !== undefined) {
      updateData.parentId = updateCategoryDto.parentId;
      // Recalculate level based on parent
      if (updateCategoryDto.parentId) {
        const parent =
          await this.prisma.client.marketplaceCategory.findUnique({
            where: { id: updateCategoryDto.parentId },
            select: { level: true },
          });
        updateData.level = parent!.level + 1;
      } else {
        updateData.level = 0;
      }
    }
    if (updateCategoryDto.sortOrder !== undefined) {
      updateData.sortOrder = updateCategoryDto.sortOrder;
    }

    return this.prisma.client.marketplaceCategory.update({
      where: { id },
      data: updateData,
      include: {
        children: {
          orderBy: { sortOrder: 'asc' },
        },
        attributes: {
          include: {
            attribute: true,
          },
        },
      },
    });
  }

  /**
   * Deactivate a category (soft delete)
   */
  async deactivate(id: string): Promise<any> {
    const category = await this.findOne(id);

    if (!category.isActive) {
      throw new BadRequestException('Category is already inactive');
    }

    // Check if category has active products
    const activeProducts = await this.prisma.client.product.count({
      where: { marketplaceCategoryId: id },
    });

    if (activeProducts > 0) {
      throw new BadRequestException(
        `Cannot deactivate category with ${activeProducts} active product(s). Please reassign products first.`,
      );
    }

    return this.prisma.client.marketplaceCategory.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Reactivate a category
   */
  async activate(id: string): Promise<any> {
    const category = await this.findOne(id);

    if (category.isActive) {
      throw new BadRequestException('Category is already active');
    }

    // Ensure parent is active if it exists
    if (category.parentId) {
      const parent = await this.prisma.client.marketplaceCategory.findUnique({
        where: { id: category.parentId },
        select: { isActive: true },
      });

      if (parent && !parent.isActive) {
        throw new BadRequestException(
          'Cannot activate category with inactive parent',
        );
      }
    }

    return this.prisma.client.marketplaceCategory.update({
      where: { id },
      data: { isActive: true },
    });
  }

  /**
   * Add an attribute to a category
   */
  async addAttribute(
    categoryId: string,
    createCategoryAttributeDto: CreateCategoryAttributeDto,
  ): Promise<any> {
    // Verify category exists
    await this.findOne(categoryId);

    // Verify attribute exists
    const attribute = await this.prisma.client.attribute.findUnique({
      where: { id: createCategoryAttributeDto.attributeId },
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    // Check if attribute is already assigned
    const existing =
      await this.prisma.client.categoryAttribute.findUnique({
        where: {
          categoryId_attributeId: {
            categoryId,
            attributeId: createCategoryAttributeDto.attributeId,
          },
        },
      });

    if (existing) {
      throw new BadRequestException(
        'Attribute is already assigned to this category',
      );
    }

    return this.prisma.client.categoryAttribute.create({
      data: {
        categoryId,
        attributeId: createCategoryAttributeDto.attributeId,
        required: createCategoryAttributeDto.required ?? false,
        filterable: createCategoryAttributeDto.filterable ?? false,
        variantAllowed: createCategoryAttributeDto.variantAllowed ?? false,
        searchable: createCategoryAttributeDto.searchable ?? false,
        sortOrder: createCategoryAttributeDto.sortOrder ?? 0,
        options: createCategoryAttributeDto.options,
      },
      include: {
        attribute: true,
      },
    });
  }

  /**
   * Remove an attribute from a category
   */
  async removeAttribute(categoryId: string, attributeId: string): Promise<any> {
    const categoryAttribute =
      await this.prisma.client.categoryAttribute.findUnique({
        where: {
          categoryId_attributeId: {
            categoryId,
            attributeId,
          },
        },
      });

    if (!categoryAttribute) {
      throw new NotFoundException('Attribute not assigned to this category');
    }

    return this.prisma.client.categoryAttribute.delete({
      where: {
        categoryId_attributeId: {
          categoryId,
          attributeId,
        },
      },
    });
  }

  /**
   * Update category attribute settings
   */
  async updateCategoryAttribute(
    categoryId: string,
    attributeId: string,
    updateData: Partial<CreateCategoryAttributeDto>,
  ): Promise<any> {
    const existing =
      await this.prisma.client.categoryAttribute.findUnique({
        where: {
          categoryId_attributeId: {
            categoryId,
            attributeId,
          },
        },
      });

    if (!existing) {
      throw new NotFoundException('Attribute not assigned to this category');
    }

    return this.prisma.client.categoryAttribute.update({
      where: {
        categoryId_attributeId: {
          categoryId,
          attributeId,
        },
      },
      data: updateData,
      include: {
        attribute: true,
      },
    });
  }

  /**
   * Get all products in a category (including descendants)
   */
  async getCategoryProducts(categoryId: string, includeChildren: boolean = true): Promise<any[]> {
    const category = await this.findOne(categoryId);

    // Get all descendant category IDs if including children
    const categoryIds = [categoryId];
    if (includeChildren) {
      const descendants = await this.getAllDescendants(categoryId);
      categoryIds.push(...descendants.map((d) => d.id));
    }

    return this.prisma.client.product.findMany({
      where: {
        marketplaceCategoryId: {
          in: categoryIds,
        },
      },
      include: {
        shop: {
          select: { id: true, name: true, slug: true },
        },
        marketplaceCategory: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Helper: Check if a category is a descendant of another
   */
  private async isDescendant(
    ancestorId: string,
    potentialDescendantId: string,
  ): Promise<boolean> {
    let current = await this.prisma.client.marketplaceCategory.findUnique({
      where: { id: potentialDescendantId },
      select: { parentId: true },
    });

    while (current && current.parentId) {
      if (current.parentId === ancestorId) {
        return true;
      }
      current = await this.prisma.client.marketplaceCategory.findUnique({
        where: { id: current.parentId },
        select: { parentId: true },
      });
    }

    return false;
  }

  /**
   * Helper: Get all descendants of a category
   */
  private async getAllDescendants(categoryId: string): Promise<any[]> {
    const descendants: any[] = [];

    const children = await this.prisma.client.marketplaceCategory.findMany({
      where: { parentId: categoryId },
      select: { id: true },
    });

    for (const child of children) {
      descendants.push(child);
      const grandDescendants = await this.getAllDescendants(child.id);
      descendants.push(...grandDescendants);
    }

    return descendants;
  }

  /**
   * Reorder categories within the same level
   */
  async reorderCategories(
    categoryIds: string[],
  ): Promise<any> {
    // Validate all categories exist
    for (const id of categoryIds) {
      const exists = await this.prisma.client.marketplaceCategory.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!exists) {
        throw new NotFoundException(`Category ${id} not found`);
      }
    }

    // Update sort order for each
    const updates = categoryIds.map((id, index) =>
      this.prisma.client.marketplaceCategory.update({
        where: { id },
        data: { sortOrder: index },
      }),
    );

    return this.prisma.client.$transaction(updates);
  }
}
