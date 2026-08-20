import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MarketplaceCategoriesService } from './marketplace-categories.service';
import { PrismaService } from '../prisma.service';

describe('MarketplaceCategoriesService', () => {
  let service: MarketplaceCategoriesService;
  let prisma: PrismaService;

  const mockPrismaClient = {
    marketplaceCategory: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    categoryAttribute: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    attribute: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketplaceCategoriesService,
        {
          provide: PrismaService,
          useValue: {
            client: mockPrismaClient,
          },
        },
      ],
    }).compile();

    service = module.get<MarketplaceCategoriesService>(
      MarketplaceCategoriesService,
    );
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a root category successfully', async () => {
      const createDto = {
        name: 'Electronics',
        slug: 'electronics',
        description: 'Electronic devices',
      };

      const mockCategory = {
        id: 'cat-1',
        ...createDto,
        parentId: null,
        level: 0,
        sortOrder: 0,
        isActive: true,
        children: [],
      };

      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValue(null);
      mockPrismaClient.marketplaceCategory.create.mockResolvedValue(
        mockCategory,
      );

      const result = await service.create(createDto);

      expect(result).toEqual(mockCategory);
      expect(mockPrismaClient.marketplaceCategory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Electronics',
          slug: 'electronics',
          level: 0,
          parentId: null,
        }),
        include: {
          children: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });

    it('should create a subcategory with valid parent', async () => {
      const createDto = {
        name: 'Smartphones',
        slug: 'smartphones',
        parentId: 'cat-1',
      };

      const mockParent = { id: 'cat-1', isActive: true, level: 1 };
      const mockCategory = {
        id: 'cat-2',
        ...createDto,
        level: 2,
        sortOrder: 0,
        isActive: true,
      };

      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValue(
        mockParent,
      );
      mockPrismaClient.marketplaceCategory.create.mockResolvedValue(
        mockCategory,
      );

      const result = await service.create(createDto);

      expect(result).toEqual(mockCategory);
      expect(
        mockPrismaClient.marketplaceCategory.create,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          level: 2,
          parentId: 'cat-1',
        }),
        include: expect.any(Object),
      });
    });

    it('should throw error if parent category does not exist', async () => {
      const createDto = {
        name: 'Smartphones',
        slug: 'smartphones',
        parentId: 'invalid-id',
      };

      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw error if parent is inactive', async () => {
      const createDto = {
        name: 'Smartphones',
        slug: 'smartphones',
        parentId: 'cat-1',
      };

      const mockInactiveParent = { id: 'cat-1', isActive: false, level: 1 };

      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValue(
        mockInactiveParent,
      );

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error if slug is not unique', async () => {
      const createDto = {
        name: 'Electronics',
        slug: 'electronics',
      };

      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValueOnce(
        null,
      );
      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValueOnce({
        id: 'existing',
      });

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAllWithHierarchy', () => {
    it('should return categories with hierarchical structure', async () => {
      const mockCategories = [
        {
          id: 'cat-1',
          name: 'Electronics',
          slug: 'electronics',
          parentId: null,
          isActive: true,
          children: [
            {
              id: 'cat-2',
              name: 'Phones',
              slug: 'phones',
              children: [],
            },
          ],
        },
      ];

      mockPrismaClient.marketplaceCategory.findMany.mockResolvedValue(
        mockCategories,
      );

      const result = await service.findAllWithHierarchy();

      expect(result).toEqual(mockCategories);
      expect(
        mockPrismaClient.marketplaceCategory.findMany,
      ).toHaveBeenCalledWith({
        where: { parentId: null, isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: expect.any(Object),
      });
    });

    it('should include inactive categories when requested', async () => {
      mockPrismaClient.marketplaceCategory.findMany.mockResolvedValue([]);

      await service.findAllWithHierarchy(true);

      expect(
        mockPrismaClient.marketplaceCategory.findMany,
      ).toHaveBeenCalledWith({
        where: { parentId: null },
        orderBy: { sortOrder: 'asc' },
        include: expect.any(Object),
      });
    });
  });

  describe('deactivate', () => {
    it('should deactivate a category with no products', async () => {
      const categoryId = 'cat-1';
      const mockCategory = {
        id: categoryId,
        isActive: true,
        name: 'Electronics',
      };

      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValue(
        mockCategory,
      );
      mockPrismaClient.product.count.mockResolvedValue(0);
      mockPrismaClient.marketplaceCategory.update.mockResolvedValue({
        ...mockCategory,
        isActive: false,
      });

      const result = await service.deactivate(categoryId);

      expect(result.isActive).toBe(false);
      expect(
        mockPrismaClient.marketplaceCategory.update,
      ).toHaveBeenCalledWith({
        where: { id: categoryId },
        data: { isActive: false },
      });
    });

    it('should throw error if category has active products', async () => {
      const categoryId = 'cat-1';
      const mockCategory = {
        id: categoryId,
        isActive: true,
      };

      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValue(
        mockCategory,
      );
      mockPrismaClient.product.count.mockResolvedValue(5);

      await expect(service.deactivate(categoryId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error if category is already inactive', async () => {
      const categoryId = 'cat-1';
      const mockCategory = {
        id: categoryId,
        isActive: false,
      };

      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValue(
        mockCategory,
      );

      await expect(service.deactivate(categoryId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('addAttribute', () => {
    it('should add attribute to category', async () => {
      const categoryId = 'cat-1';
      const attributeId = 'attr-1';

      const mockCategory = { id: categoryId };
      const mockAttribute = { id: attributeId };

      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValue(
        mockCategory,
      );
      mockPrismaClient.attribute.findUnique.mockResolvedValue(mockAttribute);
      mockPrismaClient.categoryAttribute.findUnique.mockResolvedValue(null);
      mockPrismaClient.categoryAttribute.create.mockResolvedValue({
        id: 'ca-1',
        categoryId,
        attributeId,
        attribute: mockAttribute,
      });

      const createDto = {
        attributeId,
        required: true,
        filterable: true,
      };

      const result = await service.addAttribute(categoryId, createDto);

      expect(result).toHaveProperty('id');
      expect(
        mockPrismaClient.categoryAttribute.create,
      ).toHaveBeenCalledWith({
        data: expect.objectContaining({
          categoryId,
          attributeId,
          required: true,
          filterable: true,
        }),
        include: { attribute: true },
      });
    });

    it('should throw error if attribute is already assigned', async () => {
      const categoryId = 'cat-1';
      const attributeId = 'attr-1';

      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValue({
        id: categoryId,
      });
      mockPrismaClient.attribute.findUnique.mockResolvedValue({
        id: attributeId,
      });
      mockPrismaClient.categoryAttribute.findUnique.mockResolvedValue({
        id: 'ca-1',
      });

      await expect(
        service.addAttribute(categoryId, { attributeId }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reorderCategories', () => {
    it('should reorder categories by sortOrder', async () => {
      const categoryIds = ['cat-1', 'cat-2', 'cat-3'];

      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValue({
        id: 'cat-1',
      });

      mockPrismaClient.marketplaceCategory.update.mockResolvedValue({});

      mockPrismaClient.$transaction = jest
        .fn()
        .mockResolvedValue([{}, {}, {}]);

      await service.reorderCategories(categoryIds);

      expect(mockPrismaClient.$transaction).toHaveBeenCalled();
    });

    it('should throw error if category does not exist', async () => {
      const categoryIds = ['cat-1', 'invalid-id'];

      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValueOnce({
        id: 'cat-1',
      });
      mockPrismaClient.marketplaceCategory.findUnique.mockResolvedValueOnce(
        null,
      );

      await expect(
        service.reorderCategories(categoryIds),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
