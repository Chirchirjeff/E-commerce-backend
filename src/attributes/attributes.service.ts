import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';

@Injectable()
export class AttributesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Create a new attribute
   */
  async create(createAttributeDto: CreateAttributeDto): Promise<any> {
    // Check name uniqueness
    const existingName = await this.prisma.client.attribute.findUnique({
      where: { name: createAttributeDto.name },
      select: { id: true },
    });

    if (existingName) {
      throw new BadRequestException('Attribute name must be unique');
    }

    // Check slug uniqueness
    const existingSlug = await this.prisma.client.attribute.findUnique({
      where: { slug: createAttributeDto.slug },
      select: { id: true },
    });

    if (existingSlug) {
      throw new BadRequestException('Attribute slug must be unique');
    }

    return this.prisma.client.attribute.create({
      data: {
        name: createAttributeDto.name,
        slug: createAttributeDto.slug,
        description: createAttributeDto.description,
        type: createAttributeDto.type,
      },
      include: {
        _count: {
          select: { categoryAttributes: true, productValues: true },
        },
      },
    });
  }

  /**
   * Get all attributes
   */
  async findAll(): Promise<any[]> {
    return this.prisma.client.attribute.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { categoryAttributes: true, productValues: true },
        },
      },
    });
  }

  /**
   * Get a single attribute
   */
  async findOne(id: string): Promise<any> {
    const attribute = await this.prisma.client.attribute.findUnique({
      where: { id },
      include: {
        categoryAttributes: {
          include: {
            category: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        _count: {
          select: { categoryAttributes: true, productValues: true },
        },
      },
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    return attribute;
  }

  /**
   * Get attribute by slug
   */
  async findBySlug(slug: string): Promise<any> {
    const attribute = await this.prisma.client.attribute.findUnique({
      where: { slug },
      include: {
        categoryAttributes: {
          include: {
            category: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        _count: {
          select: { categoryAttributes: true, productValues: true },
        },
      },
    });

    if (!attribute) {
      throw new NotFoundException('Attribute not found');
    }

    return attribute;
  }

  /**
   * Update an attribute
   */
  async update(
    id: string,
    updateAttributeDto: UpdateAttributeDto,
  ): Promise<any> {
    const attribute = await this.findOne(id);

    // Check name uniqueness if updating name
    if (
      updateAttributeDto.name &&
      updateAttributeDto.name !== attribute.name
    ) {
      const existingName = await this.prisma.client.attribute.findUnique({
        where: { name: updateAttributeDto.name },
        select: { id: true },
      });

      if (existingName) {
        throw new BadRequestException('Attribute name must be unique');
      }
    }

    // Check slug uniqueness if updating slug
    if (
      updateAttributeDto.slug &&
      updateAttributeDto.slug !== attribute.slug
    ) {
      const existingSlug = await this.prisma.client.attribute.findUnique({
        where: { slug: updateAttributeDto.slug },
        select: { id: true },
      });

      if (existingSlug) {
        throw new BadRequestException('Attribute slug must be unique');
      }
    }

    const updateData: any = {};
    if (updateAttributeDto.name) updateData.name = updateAttributeDto.name;
    if (updateAttributeDto.slug) updateData.slug = updateAttributeDto.slug;
    if (updateAttributeDto.description !== undefined) {
      updateData.description = updateAttributeDto.description;
    }
    if (updateAttributeDto.type) updateData.type = updateAttributeDto.type;

    return this.prisma.client.attribute.update({
      where: { id },
      data: updateData,
      include: {
        categoryAttributes: {
          include: {
            category: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        _count: {
          select: { categoryAttributes: true, productValues: true },
        },
      },
    });
  }

  /**
   * Delete an attribute (only if not in use)
   */
  async remove(id: string): Promise<any> {
    const attribute = await this.findOne(id);

    // Check if attribute is in use
    const usageCount = await this.prisma.client.categoryAttribute.count({
      where: { attributeId: id },
    });

    if (usageCount > 0) {
      throw new BadRequestException(
        `Cannot delete attribute that is assigned to ${usageCount} categor(ies). Remove from categories first.`,
      );
    }

    return this.prisma.client.attribute.delete({
      where: { id },
    });
  }

  /**
   * Get attributes by type
   */
  async findByType(type: string): Promise<any[]> {
    const validTypes = [
      'text',
      'number',
      'boolean',
      'select',
      'multiselect',
      'date',
    ];

    if (!validTypes.includes(type)) {
      throw new BadRequestException(
        `Invalid attribute type. Must be one of: ${validTypes.join(', ')}`,
      );
    }

    return this.prisma.client.attribute.findMany({
      where: { type },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { categoryAttributes: true, productValues: true },
        },
      },
    });
  }

  /**
   * Get categories using this attribute
   */
  async getCategoryUsage(id: string): Promise<any[]> {
    await this.findOne(id);

    return this.prisma.client.categoryAttribute.findMany({
      where: { attributeId: id },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            level: true,
            isActive: true,
          },
        },
      },
      orderBy: {
        category: { level: 'asc' },
      },
    });
  }
}
