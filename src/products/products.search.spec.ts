import { BadRequestException } from '@nestjs/common';
import {
  normalizeProductSearchQuery,
  ProductsService,
} from './products.service';

describe('product search', () => {
  const queryRaw = jest.fn();
  const service = new ProductsService({
    client: { $queryRaw: queryRaw },
  } as any);

  beforeEach(() => queryRaw.mockReset());

  it.each([
    ['  Samsung   Galaxy S24 ', 'samsung galaxy s24'],
    ['iPhone-16 Pro!', 'iphone 16 pro'],
    ['SAMSUNG\tS24', 'samsung s24'],
  ])('normalizes %p', (input, expected) => {
    expect(normalizeProductSearchQuery(input)).toBe(expected);
  });

  it('rejects a query that becomes empty after normalization', async () => {
    await expect(
      service.search({ q: '---', page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns exact matches with buyer-safe fields and pagination', async () => {
    queryRaw.mockResolvedValueOnce([
      {
        id: 'product-1',
        name: 'Samsung Galaxy S24',
        price: 800,
        thumbnailUrl: null,
        stockQuantity: 4,
        marketplaceCategoryId: 'phones',
        marketplaceCategoryName: 'Phones',
        shopId: 'shop-1',
        shopName: 'Acme',
        shopSlug: 'acme',
        matchType: 'exact',
        nameSimilarity: 1,
        total: BigInt(1),
      },
    ]);

    await expect(
      service.search({ q: ' Samsung Galaxy S24 ', page: 1, limit: 20 }),
    ).resolves.toMatchObject({
      normalizedQuery: 'samsung galaxy s24',
      exactMatch: true,
      results: [{ id: 'product-1', inStock: true, matchType: 'exact' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
  });

  it('reports a high-confidence close product as a possible correction', async () => {
    queryRaw.mockResolvedValueOnce([
      {
        id: 'product-1',
        name: 'iPhone 16 Pro',
        price: 900,
        thumbnailUrl: null,
        stockQuantity: 0,
        marketplaceCategoryId: 'phones',
        marketplaceCategoryName: 'Phones',
        shopId: 'shop-1',
        shopName: 'Acme',
        shopSlug: 'acme',
        matchType: 'close',
        nameSimilarity: 0.7,
        total: BigInt(1),
      },
    ]);

    await expect(
      service.search({ q: 'iphon 16 pro', page: 1, limit: 20 }),
    ).resolves.toMatchObject({
      exactMatch: false,
      correctedQuery: 'iPhone 16 Pro',
      suggestions: ['iPhone 16 Pro'],
      results: [{ inStock: false, matchType: 'close' }],
    });
  });

  it('returns a stable empty response for no results', async () => {
    queryRaw.mockResolvedValueOnce([]);

    await expect(
      service.search({ q: 'unfindable item', page: 2, limit: 10 }),
    ).resolves.toEqual(
      expect.objectContaining({
        exactMatch: false,
        suggestions: [],
        results: [],
        pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
      }),
    );
  });

  it('passes an injection-shaped query to Prisma as a bound SQL value', async () => {
    queryRaw.mockResolvedValueOnce([]);

    await service.search({
      q: "s24'; DROP TABLE products; --",
      page: 1,
      limit: 20,
    });

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0][0].values).toContain(
      's24 drop table products',
    );
  });

  it('uses a lightweight query and product-only suggestion response', async () => {
    queryRaw.mockResolvedValueOnce([{ text: 'Samsung Galaxy S24' }]);

    await expect(service.suggestions({ q: 'Sams', limit: 5 })).resolves.toEqual(
      {
        query: 'Sams',
        normalizedQuery: 'sams',
        suggestions: [{ text: 'Samsung Galaxy S24', type: 'product' }],
      },
    );
  });
});
