import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttributesService } from './attributes.service';
import { PrismaService } from '../prisma.service';
import { AttributeType } from './dto/create-attribute.dto';

describe('AttributesService', () => {
  let service: AttributesService;
  let prisma: PrismaService;

  const mockPrismaClient = {
    attribute: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    categoryAttribute: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttributesService,
        {
          provide: PrismaService,
          useValue: {
            client: mockPrismaClient,
          },
        },
      ],
    }).compile();

    service = module.get<AttributesService>(AttributesService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an attribute successfully', async () => {
      const createDto = {
        name: 'Brand',
        slug: 'brand',
        description: 'Product brand',
        type: AttributeType.TEXT,
      };

      mockPrismaClient.attribute.findUnique.mockResolvedValue(null);
      mockPrismaClient.attribute.create.mockResolvedValue({
        id: 'attr-1',
        ...createDto,
        _count: { categoryAttributes: 0, productValues: 0 },
      });

      const result = await service.create(createDto);

      expect(result.id).toBe('attr-1');
      expect(result.name).toBe('Brand');
      expect(result.type).toBe(AttributeType.TEXT);
      expect(mockPrismaClient.attribute.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Brand',
            slug: 'brand',
            type: AttributeType.TEXT,
          }),
        }),
      );
    });

    it('should throw error if name is not unique', async () => {
      const createDto = {
        name: 'Brand',
        slug: 'brand',
        type: AttributeType.TEXT,
      };

      mockPrismaClient.attribute.findUnique.mockResolvedValueOnce({
        id: 'existing',
      });

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw error if slug is not unique', async () => {
      const createDto = {
        name: 'Brand',
        slug: 'brand',
        type: AttributeType.TEXT,
      };

      mockPrismaClient.attribute.findUnique.mockResolvedValueOnce(null);
      mockPrismaClient.attribute.findUnique.mockResolvedValueOnce({
        id: 'existing',
      });

      await expect(service.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return all attributes', async () => {
      const mockAttributes = [
        {
          id: 'attr-1',
          name: 'Brand',
          slug: 'brand',
          type: AttributeType.TEXT,
          _count: { categoryAttributes: 2, productValues: 10 },
        },
      ];

      mockPrismaClient.attribute.findMany.mockResolvedValue(mockAttributes);

      const result = await service.findAll();

      expect(result).toEqual(mockAttributes);
      expect(mockPrismaClient.attribute.findMany).toHaveBeenCalledWith({
        orderBy: { name: 'asc' },
        include: { _count: expect.any(Object) },
      });
    });
  });

  describe('findOne', () => {
    it('should return attribute with usage details', async () => {
      const mockAttribute = {
        id: 'attr-1',
        name: 'Brand',
        slug: 'brand',
        categoryAttributes: [
          {
            id: 'ca-1',
            category: { id: 'cat-1', name: 'Electronics' },
          },
        ],
        _count: { categoryAttributes: 1, productValues: 5 },
      };

      mockPrismaClient.attribute.findUnique.mockResolvedValue(mockAttribute);

      const result = await service.findOne('attr-1');

      expect(result).toEqual(mockAttribute);
      expect(result.categoryAttributes).toHaveLength(1);
    });

    it('should throw error if attribute not found', async () => {
      mockPrismaClient.attribute.findUnique.mockResolvedValue(null);

      await expect(service.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findBySlug', () => {
    it('should return attribute by slug', async () => {
      const mockAttribute = {
        id: 'attr-1',
        name: 'Brand',
        slug: 'brand',
      };

      mockPrismaClient.attribute.findUnique.mockResolvedValue(mockAttribute);

      const result = await service.findBySlug('brand');

      expect(result).toEqual(mockAttribute);
    });

    it('should throw error if not found', async () => {
      mockPrismaClient.attribute.findUnique.mockResolvedValue(null);

      await expect(service.findBySlug('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByType', () => {
    it('should return attributes of specific type', async () => {
      const mockAttributes = [
        {
          id: 'attr-1',
          name: 'Brand',
          type: AttributeType.TEXT,
        },
        {
          id: 'attr-2',
          name: 'Description',
          type: AttributeType.TEXT,
        },
      ];

      mockPrismaClient.attribute.findMany.mockResolvedValue(mockAttributes);

      const result = await service.findByType(AttributeType.TEXT);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe(AttributeType.TEXT);
    });

    it('should throw error for invalid type', async () => {
      await expect(service.findByType('invalid-type')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('update', () => {
    it('should update attribute successfully', async () => {
      const mockAttribute = {
        id: 'attr-1',
        name: 'Brand',
        slug: 'brand',
        type: AttributeType.TEXT,
      };

      mockPrismaClient.attribute.findUnique.mockResolvedValueOnce(
        mockAttribute,
      );
      mockPrismaClient.attribute.update.mockResolvedValue({
        ...mockAttribute,
        name: 'Product Brand',
      });

      const result = await service.update('attr-1', { name: 'Product Brand' });

      expect(result.name).toBe('Product Brand');
    });

    it('should throw error if updating to non-unique name', async () => {
      const mockAttribute = { id: 'attr-1', name: 'Brand' };

      mockPrismaClient.attribute.findUnique.mockResolvedValueOnce(
        mockAttribute,
      );
      mockPrismaClient.attribute.findUnique.mockResolvedValueOnce({
        id: 'attr-2',
      });

      await expect(
        service.update('attr-1', { name: 'Color' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should delete unused attribute', async () => {
      const mockAttribute = { id: 'attr-1', name: 'Brand' };

      mockPrismaClient.attribute.findUnique.mockResolvedValue(mockAttribute);
      mockPrismaClient.categoryAttribute.count.mockResolvedValue(0);
      mockPrismaClient.attribute.delete.mockResolvedValue(mockAttribute);

      const result = await service.remove('attr-1');

      expect(result).toHaveProperty('id');
    });

    it('should throw error if attribute is in use', async () => {
      const mockAttribute = { id: 'attr-1', name: 'Brand' };

      mockPrismaClient.attribute.findUnique.mockResolvedValue(mockAttribute);
      mockPrismaClient.categoryAttribute.count.mockResolvedValue(3);

      await expect(service.remove('attr-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getCategoryUsage', () => {
    it('should return categories using the attribute', async () => {
      const mockUsage = [
        {
          id: 'ca-1',
          category: {
            id: 'cat-1',
            name: 'Electronics',
            level: 1,
            isActive: true,
          },
        },
      ];

      mockPrismaClient.attribute.findUnique.mockResolvedValue({
        id: 'attr-1',
      });
      mockPrismaClient.categoryAttribute.findMany.mockResolvedValue(
        mockUsage,
      );

      const result = await service.getCategoryUsage('attr-1');

      expect(result).toEqual(mockUsage);
    });

    it('should throw error if attribute not found', async () => {
      mockPrismaClient.attribute.findUnique.mockResolvedValue(null);

      await expect(service.getCategoryUsage('invalid')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
