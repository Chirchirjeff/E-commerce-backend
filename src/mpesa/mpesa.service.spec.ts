import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MpesaService } from './mpesa.service';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';

describe('MpesaService', () => {
  let service: MpesaService;
  let config: { get: jest.Mock };
  let prisma: { client: Record<string, any> };
  let emailService: { sendPaymentReceivedEmail: jest.Mock };

  beforeEach(async () => {
    config = { get: jest.fn() };
    prisma = { client: {} };
    emailService = { sendPaymentReceivedEmail: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MpesaService,
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<MpesaService>(MpesaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('emails the buyer a private tracking link after a successful payment', async () => {
    const transaction = {
      status: 'PENDING',
      amount: 1500,
      orderNumber: 'QZ0000000001',
      callbackMetadata: {
        buyerId: 'buyer-1',
        shopId: 'shop-1',
        customerName: 'Buyer',
        customerPhone: '254700000000',
        customerEmail: 'buyer@example.com',
        deliveryAddress: '123 Main Street',
        deliveryCity: 'Nairobi',
        items: [{ productId: 'product-1', quantity: 1, price: 1500 }],
      },
    };
    const transactionalClient = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'buyer-1', name: 'Buyer', email: 'buyer@example.com' }) },
      order: { create: jest.fn().mockResolvedValue({ id: 'order-1', trackingToken: 'private-token' }) },
      product: { update: jest.fn().mockResolvedValue({}) },
      mpesaTransaction: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma.client = {
      mpesaTransaction: {
        findUnique: jest.fn().mockResolvedValue(transaction),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((callback) => callback(transactionalClient)),
    };
    config.get.mockImplementation((key: string) => key === 'STOREFRONT_URL' ? 'https://shop.quza.test/' : undefined);

    await service.handleCallback({
      Body: {
        stkCallback: {
          CheckoutRequestID: 'checkout-1',
          ResultCode: 0,
          ResultDesc: 'The service request is processed successfully.',
          CallbackMetadata: { Item: [{ Name: 'MpesaReceiptNumber', Value: 'RCP123' }] },
        },
      },
    });

    expect(emailService.sendPaymentReceivedEmail).toHaveBeenCalledWith({
      recipientEmail: 'buyer@example.com',
      recipientName: 'Buyer',
      orderNumber: 'QZ0000000001',
      amount: 1500,
      mpesaReceiptNumber: 'RCP123',
      trackingUrl: 'https://shop.quza.test/track?orderNumber=QZ0000000001',
    });
  });
});
