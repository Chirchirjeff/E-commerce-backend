import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { EmailService } from '../email/email.service';
import { InitiateStkPushDto } from './dto/create-mpesa.dto';

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);

  // Safaricom sandbox base URL
  private readonly baseUrl = 'https://sandbox.safaricom.co.ke';

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  // ========================================
  // HELPERS
  // ========================================

  /**
   * Generate a unique, human-readable order number.
   * Format: QZ0000000001 (12 chars, global across every shop).
   *
   * PostgreSQL allocates the sequence atomically, including while other STK
   * requests are still pending. The same number fits Daraja's 12-char
   * AccountReference field and is therefore what the buyer sees on M-Pesa.
   */
  private async generateOrderNumber(
    prisma: Parameters<Parameters<typeof this.prisma.client.$transaction>[0]>[0],
  ): Promise<string> {
    const rows = await prisma.$queryRaw<{ value: bigint }[]>`SELECT nextval('order_number_seq') AS value`;
    return `QZ${rows[0].value.toString().padStart(10, '0')}`;
  }

  /**
   * Global order numbers are already exactly 12 characters.
   */
  private toAccountReference(orderNumber: string): string {
    return orderNumber;
  }

  /**
   * Normalize a Kenyan phone number to 2547XXXXXXXX format required by Daraja.
   * Accepts: 07XXXXXXXX, 01XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX
   */
  private normalizePhone(raw: string): string {
    const cleaned = raw.replace(/\s+/g, '').replace(/^\+/, '');
    if (cleaned.startsWith('254')) return cleaned;
    if (cleaned.startsWith('0')) return `254${cleaned.slice(1)}`;
    throw new BadRequestException(
      `Cannot normalize phone number: ${raw}. Use format 0712345678 or 254712345678.`,
    );
  }

  /**
   * Fetch an OAuth access token from Safaricom.
   * Token is valid for 1 hour; for simplicity we fetch fresh on each call
   * (production apps should cache this).
   */
  private async getAccessToken(): Promise<string> {
    const consumerKey = this.config.get<string>('CONSUMER_KEY');
    const consumerSecret = this.config.get<string>('CONSUMER_SECRET');

    if (!consumerKey || !consumerSecret) {
      throw new InternalServerErrorException(
        'M-Pesa CONSUMER_KEY or CONSUMER_SECRET not configured',
      );
    }

    const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    const response = await axios.get(
      `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${credentials}` },
      },
    );

    return response.data.access_token as string;
  }

  /**
   * Build the Base64-encoded password Daraja requires:
   *   Base64(ShortCode + Passkey + Timestamp)
   */
  private buildPassword(timestamp: string): string {
    const shortCode = this.config.get<string>('SHORT_CODE');
    const passkey = this.config.get<string>('PASSKEY');

    if (!shortCode || !passkey) {
      throw new InternalServerErrorException(
        'M-Pesa SHORT_CODE or PASSKEY not configured',
      );
    }

    return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
  }

  /** Returns timestamp in YYYYMMDDHHmmss format */
  private getTimestamp(): string {
    return new Date()
      .toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14);
  }

  // ========================================
  // STK PUSH
  // ========================================

  /**
   * Initiate a Lipa Na M-Pesa Online (STK Push) request.
   * Creates a pending MpesaTransaction record and returns the CheckoutRequestID
   * that the frontend uses to poll for status.
   */
  async initiateStkPush(dto: InitiateStkPushDto, buyerId: string): Promise<{
    checkoutRequestId: string;
    merchantRequestId: string;
    responseDescription: string;
    orderNumber: string;
  }> {
    const buyer = await this.prisma.client.user.findUnique({
      where: { id: buyerId },
      select: { emailVerifiedAt: true },
    });

    if (!buyer) {
      throw new ForbiddenException('Your buyer account was not found. Please sign in again.');
    }

    if (!buyer.emailVerifiedAt) {
      throw new ForbiddenException(
        'Verify your email address before making a payment. Please sign in again to receive a verification code.',
      );
    }

    const shortCode = this.config.get<string>('SHORT_CODE');
    const callbackUrl = this.config.get<string>('MPESA_CALLBACK_URL');

    if (!shortCode || !callbackUrl) {
      throw new InternalServerErrorException(
        'M-Pesa SHORT_CODE or MPESA_CALLBACK_URL not configured',
      );
    }

    const phone = this.normalizePhone(dto.phoneNumber);

    // ── Generate order number BEFORE the STK push so it goes on the statement ──
    // Use a serializable transaction to prevent duplicate numbers under concurrency.
    const orderNumber = await this.prisma.client.$transaction(
      async (prisma) => this.generateOrderNumber(prisma),
      { isolationLevel: 'Serializable' },
    );

    const accountReference = this.toAccountReference(orderNumber); // e.g. 'QZ-00043'
    this.logger.log(`Reserved order number ${orderNumber} (ref: ${accountReference})`);

    const timestamp = this.getTimestamp();
    const password = this.buildPassword(timestamp);
    const accessToken = await this.getAccessToken();

    const payload = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(dto.amount), // Daraja requires integer
      PartyA: phone,
      PartyB: shortCode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      // Buyer sees this on their M-Pesa statement, e.g. "QZ-00043"
      AccountReference: accountReference,
      // Description shown on the PIN prompt screen
      TransactionDesc: `Quza order ${orderNumber}`,
    };

    this.logger.log(`Initiating STK push to ${phone} for KES ${payload.Amount}`);

    let stkResponse: any;
    try {
      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      stkResponse = response.data;
    } catch (err: any) {
      const detail = err.response?.data || err.message;
      this.logger.error('STK push failed', JSON.stringify(detail));
      throw new InternalServerErrorException(
        `M-Pesa STK push failed: ${JSON.stringify(detail)}`,
      );
    }

    // ResponseCode "0" means the push was accepted by Safaricom
    if (stkResponse.ResponseCode !== '0') {
      throw new BadRequestException(
        `STK push rejected: ${stkResponse.ResponseDescription}`,
      );
    }

    // Persist a PENDING transaction, carrying the reserved order number so the
    // callback can use it when creating the Order record on payment success.
    await this.prisma.client.mpesaTransaction.create({
      data: {
        checkoutRequestId: stkResponse.CheckoutRequestID,
        merchantRequestId: stkResponse.MerchantRequestID,
        amount: Math.round(dto.amount), // store the same integer Daraja charges
        phoneNumber: phone,
        responseCode: stkResponse.ResponseCode,
        responseDescription: stkResponse.ResponseDescription,
        status: 'PENDING',
        orderNumber,
        // Store the full order payload so the callback can create the Order
        callbackMetadata: { ...dto.orderPayload, buyerId } as any,
      },
    });

    return {
      checkoutRequestId: stkResponse.CheckoutRequestID,
      merchantRequestId: stkResponse.MerchantRequestID,
      responseDescription: stkResponse.ResponseDescription,
      orderNumber,
    };
  }

  // ========================================
  // CALLBACK (called by Safaricom)
  // ========================================

  /**
   * Handle the M-Pesa payment notification.
   * On success: update transaction, create the order, link them.
   * On failure: mark transaction as FAILED.
   */
  async handleCallback(body: any): Promise<void> {
    const stk = body?.Body?.stkCallback;
    if (!stk) {
      this.logger.warn('Callback received with unexpected shape', JSON.stringify(body));
      return;
    }

    const checkoutRequestId: string = stk.CheckoutRequestID;
    const resultCode: string = String(stk.ResultCode);
    const resultDesc: string = stk.ResultDesc;

    this.logger.log(
      `Callback received — CheckoutRequestID: ${checkoutRequestId}, ResultCode: ${resultCode}`,
    );

    const transaction = await this.prisma.client.mpesaTransaction.findUnique({
      where: { checkoutRequestId },
    });

    if (!transaction) {
      this.logger.warn(`No transaction found for CheckoutRequestID: ${checkoutRequestId}`);
      return;
    }

    // Already processed (idempotency)
    if (transaction.status !== 'PENDING') {
      this.logger.log(`Transaction ${checkoutRequestId} already processed — skipping`);
      return;
    }

    if (resultCode === '0') {
      // Payment successful
      const items: any[] = stk.CallbackMetadata?.Item ?? [];
      const get = (name: string) => items.find((i: any) => i.Name === name)?.Value;

      const mpesaReceiptNumber = get('MpesaReceiptNumber') as string | undefined;

      // Retrieve the stored order payload and reserved order number
      const orderPayload = transaction.callbackMetadata as any;
      const orderNumber = transaction.orderNumber;

      if (!orderNumber) {
        this.logger.error(`No orderNumber on transaction ${checkoutRequestId} — cannot create order`);
        await this.prisma.client.mpesaTransaction.update({
          where: { checkoutRequestId },
          data: { status: 'FAILED', resultCode, resultDescription: 'Missing order number' },
        });
        return;
      }

      const completedPayment: {
        email?: {
          recipientEmail: string;
          recipientName: string;
          orderNumber: string;
          amount: number;
          trackingToken: string;
          mpesaReceiptNumber?: string;
        };
      } = {};

      try {
        await this.prisma.client.$transaction(async (prisma) => {
          // 1. The checkout was initiated by an authenticated global buyer.
          const buyer = await prisma.user.findUnique({
            where: { id: orderPayload.buyerId },
            select: { id: true, email: true, name: true },
          });
          if (!buyer) throw new Error('Buyer account no longer exists');

          // 2. Create the order with the pre-reserved order number
          const order = await prisma.order.create({
            data: {
              orderNumber,
              trackingToken: crypto.randomBytes(24).toString('hex'),
              shopId: orderPayload.shopId,
              buyerId: buyer.id,
              total: transaction.amount,
              status: 'paid',
              paymentStatus: 'PAID',
              fulfillmentStatus: 'NEW',
              deliveryStatus: 'NOT_DISPATCHED',
              escrowStatus: 'HELD',
              deliveryName: orderPayload.customerName,
              deliveryPhone: orderPayload.customerPhone,
              deliveryEmail: orderPayload.customerEmail,
              deliveryAddress: orderPayload.deliveryAddress,
              deliveryCity: orderPayload.deliveryCity,
              deliveryState: orderPayload.deliveryState,
              deliveryZip: orderPayload.deliveryZip,
              items: {
                create: orderPayload.items.map((item: any) => ({
                  productId: item.productId,
                  quantity: item.quantity,
                  price: item.price,
                  subtotal: item.price * item.quantity,
                })),
              },
              events: {
                create: [
                  { type: 'ORDER_PLACED', message: 'Order placed by buyer', actorId: buyer.id },
                  { type: 'PAYMENT_RECEIVED', message: 'M-Pesa payment received', actorId: buyer.id },
                ],
              },
            },
          });

          // 3. Deduct stock
          for (const item of orderPayload.items) {
            await prisma.product.update({
              where: { id: item.productId },
              data: { stockQuantity: { decrement: item.quantity } },
            });
          }

          // 4. Mark transaction SUCCESS, link to order, store receipt
          await prisma.mpesaTransaction.update({
            where: { checkoutRequestId },
            data: {
              status: 'SUCCESS',
              resultCode,
              resultDescription: resultDesc,
              mpesaReceiptNumber: mpesaReceiptNumber ?? null,
              orderId: order.id,
              // orderNumber already on the row from initiateStkPush
            },
          });

          completedPayment.email = {
            recipientEmail: buyer.email,
            recipientName: buyer.name,
            orderNumber,
            amount: transaction.amount,
            trackingToken: order.trackingToken,
            mpesaReceiptNumber,
          };
        });

        this.logger.log(
          `Payment SUCCESS for ${checkoutRequestId} — receipt: ${mpesaReceiptNumber}`,
        );
      } catch (err: any) {
        this.logger.error('Order creation after payment failed', err.message);
        // Don't re-throw — Safaricom expects a 200 response regardless
        await this.prisma.client.mpesaTransaction.update({
          where: { checkoutRequestId },
          data: { status: 'FAILED', resultCode, resultDescription: resultDesc },
        });
        return;
      }

      const paymentEmail = completedPayment.email;
      if (paymentEmail) {
        const storefrontUrl = (this.config.get<string>('STOREFRONT_URL') ?? 'http://localhost:3000')
          .replace(/\/+$/, '');
        try {
          await this.emailService.sendPaymentReceivedEmail({
            recipientEmail: paymentEmail.recipientEmail,
            recipientName: paymentEmail.recipientName,
            orderNumber: paymentEmail.orderNumber,
            amount: paymentEmail.amount,
            mpesaReceiptNumber: paymentEmail.mpesaReceiptNumber,
            trackingUrl: `${storefrontUrl}/track?orderNumber=${encodeURIComponent(paymentEmail.orderNumber)}`,
          });
        } catch (err: any) {
          // An email outage must not overwrite a successfully paid transaction.
          this.logger.error(`Payment receipt email failed: ${err.message}`);
        }
      }
    } else {
      // Payment failed / cancelled (e.g. ResultCode 1032 = user cancelled)
      await this.prisma.client.mpesaTransaction.update({
        where: { checkoutRequestId },
        data: {
          status: resultCode === '1032' ? 'CANCELLED' : 'FAILED',
          resultCode,
          resultDescription: resultDesc,
        },
      });

      this.logger.warn(
        `Payment FAILED for ${checkoutRequestId} — ${resultCode}: ${resultDesc}`,
      );
    }
  }

  // ========================================
  // STATUS CHECK (polled by frontend)
  // ========================================

  /**
   * Returns the current status of a transaction plus the orderId once created.
   * The frontend polls this until status is SUCCESS, FAILED, CANCELLED, or TIMEOUT.
   */
  async getTransactionStatus(checkoutRequestId: string, buyerId: string): Promise<{
    status: string;
    orderId: string | null;
    orderNumber: string | null;
    resultDescription: string | null;
    mpesaReceiptNumber: string | null;
    trackingToken: string | null;
  }> {
    const transaction = await this.prisma.client.mpesaTransaction.findUnique({
      where: { checkoutRequestId },
      select: {
        status: true,
        orderId: true,
        orderNumber: true,
        resultDescription: true,
        mpesaReceiptNumber: true,
        createdAt: true,
        order: { select: { trackingToken: true } },
        callbackMetadata: true,
      },
    });

    if (!transaction) {
      throw new BadRequestException(
        `Transaction not found: ${checkoutRequestId}`,
      );
    }
    if ((transaction.callbackMetadata as any)?.buyerId !== buyerId) {
      throw new ForbiddenException('You are not allowed to view this payment');
    }

    // Auto-timeout: if still PENDING after 5 minutes, mark it
    if (transaction.status === 'PENDING') {
      const ageMs = Date.now() - new Date(transaction.createdAt).getTime();
      if (ageMs > 5 * 60 * 1000) {
        await this.prisma.client.mpesaTransaction.update({
          where: { checkoutRequestId },
          data: { status: 'TIMEOUT' },
        });
        return {
          status: 'TIMEOUT',
          orderId: null,
          orderNumber: transaction.orderNumber,
          resultDescription: 'Payment request timed out',
          mpesaReceiptNumber: null,
          trackingToken: null,
        };
      }
    }

    return {
      status: transaction.status,
      orderId: transaction.orderId,
      orderNumber: transaction.orderNumber,
      resultDescription: transaction.resultDescription,
      mpesaReceiptNumber: transaction.mpesaReceiptNumber,
      trackingToken: transaction.order?.trackingToken ?? null,
    };
  }
}
