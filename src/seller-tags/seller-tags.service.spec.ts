import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SellerTagsService } from './seller-tags.service';
import { PrismaService } from '../prisma.service';

describe('SellerTagsService', () => {
  let service: SellerTagsService;
  let prisma: PrismaService;

  const mockPrismaClient = {
    shop: {
      findUnique: jest.fn(),
    },
    sellerTag: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
    productTag: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const sellerId = 'seller-1';
  const tagId = 'tag-1';
  const productId = 'prod-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SellerTagsService,
        {
          provide: PrismaService,
          useValue: {
            client: mockPrismaClient,
          },
        },
      ],
    }).compile();

    service = module.get<SellerTagsService>(SellerTagsService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a seller tag successfully', async () => {
      const createDto = {
        name: 'Featured',
        slug: 'featured',
        color: '#FF0000',
      };

      mockPrismaClient.shop.findUnique.mockResolvedValue({ id: sellerId });
      mockPrismaClient.sellerTag.findUnique.mockResolvedValue(null);
      mockPrismaClient.sellerTag.create.mockResolvedValue({
        id: tagId,
        sellerId,
        ...createDto,
        _count: { products: 0 },
      });

      const result = await service.create(createDto, sellerId);

      expect(result.id).toBe(tagId);
      expect(result.sellerId).toBe(sellerId);
      expect(mockPrismaClient.sellerTag.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sellerId,
            name: 'Featured',
            slug: 'featured',
          }),
        }),
      );
    });

    it('should throw error if seller does not exist', async () => {
      const createDto = {
        name: 'Featured',
        slug: 'featured',
      };

      mockPrismaClient.shop.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto, 'invalid-seller')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw error if slug is not unique within seller', async () => {
      const createDto = {
        name: 'Featured',
        slug: 'featured',
      };

      mockPrismaClient.shop.findUnique.mockResolvedValue({ id: sellerId });
      mockPrismaClient.sellerTag.findUnique.mockResolvedValue({
        id: 'existing-tag',
      });

      await expect(service.create(createDto, sellerId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAllBySeller', () => {
    it('should return all tags for seller', async () => {
      const mockTags = [
        {
          id: tagId,
          sellerId,
          name: 'Featured',
          slug: 'featured',
          _count: { products: 3 },
        },
      ];

      mockPrismaClient.sellerTag.findMany.mockResolvedValue(mockTags);

      const result = await service.findAllBySeller(sellerId);

      expect(result).toEqual(mockTags);
      expect(mockPrismaClient.sellerTag.findMany).toHaveBeenCalledWith({
        where: { sellerId },
        orderBy: { name: 'asc' },
        include: { _count: { select: { products: true } } },
      });
    });
  });

  describe('addToProduct', () => {
    it('should add tag to product successfully', async () => {
      const mockTag = { id: tagId, sellerId };
      const mockProduct = { id: productId, shopId: sellerId };

      mockPrismaClient.sellerTag.findUnique.mockResolvedValue(mockTag);
      mockPrismaClient.product.findUnique.mockResolvedValue(mockProduct);
      mockPrismaClient.productTag.findUnique.mockResolvedValue(null);
      mockPrismaClient.productTag.create.mockResolvedValue({
        id: 'pt-1',
        productId,
        tagId,
        tag: mockTag,
      });

      const result = await service.addToProduct(tagId, productId, sellerId);

      expect(result).toHaveProperty('id');
      expect(mockPrismaClient.productTag.create).toHaveBeenCalledWith({
        data: { productId, tagId },
        include: { tag: true, product: { select: expect.any(Object) } },
      });
    });

    it('should throw error if product does not belong to seller', async () => {
      const mockTag = { id: tagId, sellerId };
      const mockProduct = { id: productId, shopId: 'other-seller' };

      mockPrismaClient.sellerTag.findUnique.mockResolvedValue(mockTag);
      mockPrismaClient.product.findUnique.mockResolvedValue(mockProduct);

      await expect(
        service.addToProduct(tagId, productId, sellerId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw error if product already has tag', async () => {
      const mockTag = { id: tagId, sellerId };
      const mockProduct = { id: productId, shopId: sellerId };

      mockPrismaClient.sellerTag.findUnique.mockResolvedValue(mockTag);
      mockPrismaClient.product.findUnique.mockResolvedValue(mockProduct);
      mockPrismaClient.productTag.findUnique.mockResolvedValue({
        id: 'pt-1',
      });

      await expect(
        service.addToProduct(tagId, productId, sellerId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeFromProduct', () => {
    it('should remove tag from product', async () => {
      const mockTag = { id: tagId, sellerId };
      const mockProductTag = { id: 'pt-1', productId, tagId };

      mockPrismaClient.sellerTag.findUnique.mockResolvedValue(mockTag);
      mockPrismaClient.productTag.findUnique.mockResolvedValue(mockProductTag);
      mockPrismaClient.productTag.delete.mockResolvedValue(mockProductTag);

      const result = await service.removeFromProduct(tagId, productId, sellerId);

      expect(result).toHaveProperty('id');
      expect(mockPrismaClient.productTag.delete).toHaveBeenCalledWith({
        where: { productId_tagId: { productId, tagId } },
      });
    });

    it('should throw error if tag not on product', async () => {
      const mockTag = { id: tagId, sellerId };

      mockPrismaClient.sellerTag.findUnique.mockResolvedValue(mockTag);
      mockPrismaClient.productTag.findUnique.mockResolvedValue(null);

      await expect(
        service.removeFromProduct(tagId, productId, sellerId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update tag successfully', async () => {
      const mockTag = {
        id: tagId,
        sellerId,
        name: 'Old Name',
        slug: 'old-slug',
      };

      mockPrismaClient.sellerTag.findUnique.mockResolvedValue(mockTag);
      mockPrismaClient.sellerTag.update.mockResolvedValue({
        ...mockTag,
        name: 'New Name',
      });

      const result = await service.update(tagId, { name: 'New Name' }, sellerId);

      expect(result.name).toBe('New Name');
    });

    it('should throw error if updating slug to non-unique value', async () => {
      const mockTag = {
        id: tagId,
        sellerId,
        slug: 'old-slug',
      };

      mockPrismaClient.sellerTag.findUnique.mockResolvedValueOnce(mockTag);
      mockPrismaClient.sellerTag.findUnique.mockResolvedValueOnce({
        id: 'other-tag',
      });

      await expect(
        service.update(tagId, { slug: 'new-slug' }, sellerId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should delete tag with no products', async () => {
      const mockTag = { id: tagId, sellerId };

      mockPrismaClient.sellerTag.findUnique.mockResolvedValue(mockTag);
      mockPrismaClient.productTag.count.mockResolvedValue(0);
      mockPrismaClient.sellerTag.delete.mockResolvedValue(mockTag);

      const result = await service.remove(tagId, sellerId);

      expect(result).toHaveProperty('id');
    });

    it('should throw error if tag has products', async () => {
      const mockTag = { id: tagId, sellerId };

      mockPrismaClient.sellerTag.findUnique.mockResolvedValue(mockTag);
      mockPrismaClient.productTag.count.mockResolvedValue(5);

      await expect(service.remove(tagId, sellerId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getProductTags', () => {
    it('should return all tags for a product', async () => {
      const mockTags = [
        { id: 'pt-1', tag: { id: tagId, name: 'Featured' } },
      ];

      mockPrismaClient.product.findUnique.mockResolvedValue({
        id: productId,
        shopId: sellerId,
      });
      mockPrismaClient.productTag.findMany.mockResolvedValue(mockTags);

      const result = await service.getProductTags(productId, sellerId);

      expect(result).toEqual(mockTags);
    });

    it('should throw error if product does not belong to seller', async () => {
      mockPrismaClient.product.findUnique.mockResolvedValue({
        id: productId,
        shopId: 'other-seller',
      });

      await expect(
        service.getProductTags(productId, sellerId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('searchTags', () => {
    it('should search tags by name', async () => {
      const mockTags = [
        {
          id: tagId,
          sellerId,
          name: 'Featured',
          _count: { products: 3 },
        },
      ];

      mockPrismaClient.sellerTag.findMany.mockResolvedValue(mockTags);

      const result = await service.searchTags(sellerId, 'feat');

      expect(result).toEqual(mockTags);
      expect(mockPrismaClient.sellerTag.findMany).toHaveBeenCalledWith({
        where: {
          sellerId,
          name: { contains: 'feat', mode: 'insensitive' },
        },
        orderBy: { name: 'asc' },
        take: 20,
        include: { _count: { select: { products: true } } },
      });
    });
  });

  describe('access control', () => {
    it('should throw ForbiddenException if accessing another sellers tag', async () => {
      const mockTag = {
        id: tagId,
        sellerId: 'other-seller',
      };

      mockPrismaClient.sellerTag.findUnique.mockResolvedValue(mockTag);

      await expect(
        service.findOne(tagId, sellerId),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addTagsToProduct', () => {
    it('should bulk add tags to product', async () => {
      const tagIds = [tagId, 'tag-2'];
      mockPrismaClient.product.findUnique.mockResolvedValue({
        id: productId,
        shopId: sellerId,
      });
      mockPrismaClient.sellerTag.findUnique.mockResolvedValue({
        id: tagId,
        sellerId,
      });
      mockPrismaClient.productTag.deleteMany.mockResolvedValue({});
      mockPrismaClient.$transaction.mockResolvedValue([{}, {}]);

      await service.addTagsToProduct(productId, tagIds, sellerId);

      expect(mockPrismaClient.productTag.deleteMany).toHaveBeenCalled();
      expect(mockPrismaClient.$transaction).toHaveBeenCalled();
    });
  });
});
