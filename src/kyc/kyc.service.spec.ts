import { Test, TestingModule } from '@nestjs/testing';
import { KycService } from './kyc.service';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';

describe('KycService', () => {
  let service: KycService;
  const emailService = { sendKycStatusEmail: jest.fn() };
  const transactionClient = {
    kYC: { update: jest.fn() },
    kYCReview: { create: jest.fn() },
    shop: { findFirst: jest.fn(), create: jest.fn() },
    user: { update: jest.fn() },
  };
  const prisma = {
    client: {
      kYC: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    prisma.client.$transaction.mockImplementation((callback) => callback(transactionClient));
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get<KycService>(KycService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('sends an approval email only after the KYC transaction completes', async () => {
    const kyc = {
      id: 'kyc-1', userId: 'seller-1', status: 'PENDING', businessName: 'Acme Shop',
      description: null, phone: '0700000000', user: { email: 'seller@example.com', name: 'Amina', phone: '0700000000' },
    };
    prisma.client.kYC.findUnique.mockResolvedValue(kyc);
    transactionClient.kYC.update.mockResolvedValue({ ...kyc, status: 'VERIFIED' });
    transactionClient.kYCReview.create.mockResolvedValue({});
    transactionClient.shop.findFirst.mockResolvedValue({ id: 'shop-1' });

    await service.approveKYC('kyc-1', 'admin-1');

    expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
    expect(emailService.sendKycStatusEmail).toHaveBeenCalledWith({
      recipientEmail: 'seller@example.com',
      recipientName: 'Amina',
      businessName: 'Acme Shop',
      outcome: 'approved',
    });
  });

  it('sends a rejection email with the officer reason after the KYC transaction completes', async () => {
    const kyc = {
      id: 'kyc-1', userId: 'seller-1', status: 'PENDING', businessName: 'Acme Shop',
      user: { email: 'seller@example.com', name: 'Amina' },
    };
    prisma.client.kYC.findUnique.mockResolvedValue(kyc);
    transactionClient.kYC.update.mockResolvedValue({ ...kyc, status: 'REJECTED' });
    transactionClient.kYCReview.create.mockResolvedValue({});

    await service.rejectKYC('kyc-1', 'admin-1', 'Please upload a readable business licence.');

    expect(prisma.client.$transaction).toHaveBeenCalledTimes(1);
    expect(emailService.sendKycStatusEmail).toHaveBeenCalledWith({
      recipientEmail: 'seller@example.com',
      recipientName: 'Amina',
      businessName: 'Acme Shop',
      outcome: 'rejected',
      reason: 'Please upload a readable business licence.',
    });
  });
});
