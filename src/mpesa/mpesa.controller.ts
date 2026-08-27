import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
} from '@nestjs/common';
import { MpesaService } from './mpesa.service';
import { InitiateStkPushDto } from './dto/create-mpesa.dto';
import { SkipGuard } from '../auth/decorators/skip-guard.decorator';

@Controller('mpesa')
export class MpesaController {
  private readonly logger = new Logger(MpesaController.name);

  constructor(private readonly mpesaService: MpesaService) {}

  /**
   * POST /mpesa/stk-push
   *
   * Buyer authentication is required so every paid order belongs to a global account.
   * Initiates an STK push to the buyer's phone. The order is created later
   * inside the callback once Safaricom confirms payment.
   *
   * Body: { phoneNumber, amount, orderPayload }
   * Returns: { checkoutRequestId, merchantRequestId, responseDescription }
   */
  @Post('stk-push')
  async initiateStkPush(@Body() dto: InitiateStkPushDto, @Req() req: any) {
    return this.mpesaService.initiateStkPush(dto, req.user.id);
  }

  /**
   * GET /mpesa/status/:checkoutRequestId
   *
   * The authenticated buyer may poll their own checkout only.
   * Returns: { status, orderId, resultDescription, mpesaReceiptNumber }
   *   status: PENDING | SUCCESS | FAILED | CANCELLED | TIMEOUT
   */
  @Get('status/:checkoutRequestId')
  async getStatus(@Param('checkoutRequestId') checkoutRequestId: string, @Req() req: any) {
    return this.mpesaService.getTransactionStatus(checkoutRequestId, req.user.id);
  }

  /**
   * POST /mpesa/callback
   *
   * Public endpoint — Safaricom posts the payment result here.
   * Always returns HTTP 200 with a success acknowledgement immediately;
   * actual processing happens asynchronously.
   */
  @Post('callback')
  @SkipGuard()
  @HttpCode(HttpStatus.OK)
  async handleCallback(@Body() body: any) {
    this.logger.log('M-Pesa callback received');
    this.mpesaService.handleCallback(body).catch((err) => {
      this.logger.error('Callback processing error', err?.message);
    });

    return {
      ResultCode: 0,
      ResultDesc: 'Accepted',
    };
  }
}
