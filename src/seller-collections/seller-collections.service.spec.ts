import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SellerCollectionsService } from './seller-collections.service';
import { PrismaService } from '../prisma.service';

describe('SellerCollectionsService', () => {
  let service: SellerCollectionsService;
  let prisma: PrismaService;

  const mockPrismaClient = {
    shop: {
      findUnique: jest.fn(),
    },
    sellerCollection: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
    productCollection: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const sellerId = 'seller-1';
  const collectionId = 'col-1';
  const productId = 'prod-1';
  const userId = 'user-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SellerCollectionsService,
        {
          provide: PrismaService,
          useValue: {
            client: mockPrismaClient,
          },
        },
      ],
    }).compile();

    service = module.get<SellerCollectionsService>(
      SellerCollectionsService,
    );
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a seller collection successfully', async () => {
      const createDto = {
        name: 'New Arrivals',
        slug: 'new-arrivals',
        description: 'Latest products',
      };

      mockPrismaClient.shop.findUnique.mockResolvedValue({ id: sellerId });
      mockPrismaClient.sellerCollection.findUnique.mockResolvedValue(null);
      mockPrismaClient.sellerCollection.create.mockResolvedValue({
        id: collectionId,
        sellerId,
        ...createDto,
        isActive: true,
        products: [],
        _count: { products: 0 },
      });

      const result = await service.create(createDto, sellerId);

      expect(result.id).toBe(collectionId);
      expect(result.sellerId).toBe(sellerId);
      expect(mockPrismaClient.sellerCollection.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sellerId,
            name: 'New Arrivals',
            slug: 'new-arrivals',
            isActive: true,
          }),
        }),
      );
    });

    it('should throw error if seller does not exist', async () => {
      const createDto = {
        name: 'New Arrivals',
        slug: 'new-arrivals',
      };

      mockPrismaClient.shop.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto, 'invalid-seller')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw error if slug is not unique within seller', async () => {
      const createDto = {
        name: 'New Arrivals',
        slug: 'new-arrivals',
      };

      mockPrismaClient.shop.findUnique.mockResolvedValue({ id: sellerId });
      mockPrismaClient.sellerCollection.findUnique.mockResolvedValue({
        id: 'existing-col',
      });

      await expect(service.create(createDto, sellerId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAllBySellerAdmin', () => {
    it('should return all active collections for seller', async () => {
      const mockCollections = [
        {
          id: collectionId,
          sellerId,
          name: 'New Arrivals',
          isActive: true,
          _count: { products: 5 },
        },
      ];

      mockPrismaClient.sellerCollection.findMany.mockResolvedValue(
        mockCollections,
      );

      const result = await service.findAllBySellerAdmin(sellerId);

      expect(result).toEqual(mockCollections);
      expect(
        mockPrismaClient.sellerCollection.findMany,
      ).toHaveBeenCalledWith({
        where: { sellerId, isActive: true },
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { products: true } } },
      });
    });

    it('should include inactive collections when requested', async () => {
      mockPrismaClient.sellerCollection.findMany.mockResolvedValue([]);

      await service.findAllBySellerAdmin(sellerId, true);

      expect(
        mockPrismaClient.sellerCollection.findMany,
      ).toHaveBeenCalledWith({
        where: { sellerId },
        orderBy: { sortOrder: 'asc' },
        include: { _count: { select: { products: true } } },
      });
    });
  });

  describe('addProduct', () => {
    it('should add product to collection', async () => {
      const mockCollection = { id: collectionId, sellerId };
      const mockProduct = { id: productId, shopId: sellerId };

      mockPrismaClient.sellerCollection.findUnique.mockResolvedValue(
        mockCollection,
      );
      mockPrismaClient.product.findUnique.mockResolvedValue(mockProduct);
      mockPrismaClient.productCollection.findUnique.mockResolvedValue(null);
      mockPrismaClient.productCollection.create.mockResolvedValue({
        id: 'pc-1',
        productId,
        collectionId,
      });

      const result = await service.addProduct(collectionId, productId, sellerId);

      expect(result).toHaveProperty('id');
      expect(
        mockPrismaClient.productCollection.create,
      ).toHaveBeenCalledWith({
        data: { productId, collectionId },
        include: { product: { select: expect.any(Object) } },
      });
    });

    it('should throw error if product does not belong to seller', async () => {
      const mockCollection = { id: collectionId, sellerId };
      const mockProduct = { id: productId, shopId: 'other-seller' };

      mockPrismaClient.sellerCollection.findUnique.mockResolvedValue(
        mockCollection,
      );
      mockPrismaClient.product.findUnique.mockResolvedValue(mockProduct);

      await expect(
        service.addProduct(collectionId, productId, sellerId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw error if product is already in collection', async () => {
      const mockCollection = { id: collectionId, sellerId };
      const mockProduct = { id: productId, shopId: sellerId };

      mockPrismaClient.sellerCollection.findUnique.mockResolvedValue(
        mockCollection,
      );
      mockPrismaClient.product.findUnique.mockResolvedValue(mockProduct);
      mockPrismaClient.productCollection.findUnique.mockResolvedValue({
        id: 'pc-1',
      });

      await expect(
        service.addProduct(collectionId, productId, sellerId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeProduct', () => {
    it('should remove product from collection', async () => {
      const mockCollection = { id: collectionId, sellerId };
      const mockProductCollection = { id: 'pc-1', productId, collectionId };

      mockPrismaClient.sellerCollection.findUnique.mockResolvedValue(
        mockCollection,
      );
      mockPrismaClient.productCollection.findUnique.mockResolvedValue(
        mockProductCollection,
      );
      mockPrismaClient.productCollection.delete.mockResolvedValue(
        mockProductCollection,
      );

      const result = await service.removeProduct(collectionId, productId, sellerId);

      expect(result).toHaveProperty('id');
      expect(
        mockPrismaClient.productCollection.delete,
      ).toHaveBeenCalledWith({
        where: {
          productId_collectionId: { productId, collectionId },
        },
      });
    });

    it('should throw error if product not in collection', async () => {
      const mockCollection = { id: collectionId, sellerId };

      mockPrismaClient.sellerCollection.findUnique.mockResolvedValue(
        mockCollection,
      );
      mockPrismaClient.productCollection.findUnique.mockResolvedValue(null);

      await expect(
        service.removeProduct(collectionId, productId, sellerId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update collection successfully', async () => {
      const mockCollection = {
        id: collectionId,
        sellerId,
        name: 'Old Name',
        slug: 'old-slug',
      };

      mockPrismaClient.sellerCollection.findUnique.mockResolvedValue(
        mockCollection,
      );
      mockPrismaClient.sellerCollection.update.mockResolvedValue({
        ...mockCollection,
        name: 'New Name',
      });

      const result = await service.update(
        collectionId,
        { name: 'New Name' },
        sellerId,
      );

      expect(result.name).toBe('New Name');
    });

    it('should throw error if updating slug to non-unique value', async () => {
      const mockCollection = {
        id: collectionId,
        sellerId,
        slug: 'old-slug',
      };

      mockPrismaClient.sellerCollection.findUnique.mockResolvedValueOnce(
        mockCollection,
      );
      mockPrismaClient.sellerCollection.findUnique.mockResolvedValueOnce({
        id: 'other-col',
      });

      await expect(
        service.update(collectionId, { slug: 'new-slug' }, sellerId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('deactivate', () => {
    it('should deactivate an active collection', async () => {
      const mockCollection = {
        id: collectionId,
        sellerId,
        isActive: true,
      };

      mockPrismaClient.sellerCollection.findUnique.mockResolvedValue(
        mockCollection,
      );
      mockPrismaClient.sellerCollection.update.mockResolvedValue({
        ...mockCollection,
        isActive: false,
      });

      const result = await service.deactivate(collectionId, sellerId);

      expect(result.isActive).toBe(false);
    });

    it('should throw error if collection already inactive', async () => {
      const mockCollection = {
        id: collectionId,
        sellerId,
        isActive: false,
      };

      mockPrismaClient.sellerCollection.findUnique.mockResolvedValue(
        mockCollection,
      );

      await expect(
        service.deactivate(collectionId, sellerId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reorderCollections', () => {
    it('should reorder collections by sortOrder', async () => {
      const collectionIds = [collectionId, 'col-2', 'col-3'];

      mockPrismaClient.sellerCollection.findUnique.mockResolvedValue({
        id: collectionId,
        sellerId,
      });

      mockPrismaClient.$transaction.mockResolvedValue([{}, {}, {}]);

      await service.reorderCollections(collectionIds, sellerId);

      expect(mockPrismaClient.$transaction).toHaveBeenCalled();
    });
  });

  describe('access control', () => {
    it('should throw ForbiddenException if accessing another sellers collection', async () => {
      const mockCollection = {
        id: collectionId,
        sellerId: 'other-seller',
      };

      mockPrismaClient.sellerCollection.findUnique.mockResolvedValue(
        mockCollection,
      );

      await expect(
        service.findOne(collectionId, sellerId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
