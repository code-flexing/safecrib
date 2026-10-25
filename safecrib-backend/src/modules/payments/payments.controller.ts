import { Controller, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Public } from '../../common/public.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { PaystackService } from './paystack.service.js';

interface VerifyResult {
  status: 'success' | 'pending' | 'failed';
  reference: string;
  message?: string;
  amountMinor?: number;
  currency?: string;
  paidAt?: string | null;
}

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
  ) {}

  @Get('verify')
  @ApiBearerAuth('access-token')
  async verify(
    @Query('reference') reference: string,
    @CurrentUser() user: { id: string },
  ): Promise<VerifyResult> {
    if (!reference) {
      throw new HttpException('Missing reference', HttpStatus.BAD_REQUEST);
    }

    const payment = await this.prisma.payment.findUnique({
      where: { reference },
      include: { booking: { select: { studentId: true } } },
    });
    if (!payment) {
      throw new HttpException('Payment not found', HttpStatus.NOT_FOUND);
    }
    if (payment.booking?.studentId !== user.id) {
      throw new HttpException('Not authorized', HttpStatus.FORBIDDEN);
    }

    // If we already recorded success, return it directly.
    if (payment.status === 'SUCCESS') {
      return {
        status: 'success',
        reference: payment.reference,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paidAt: payment.paidAt?.toISOString() ?? null,
      };
    }

    // Otherwise ask Paystack for the latest state and reconcile.
    const verified = await this.paystack.verify(reference);
    if (!verified) {
      return { status: 'failed', reference, message: 'Unable to verify with provider' };
    }

    const providerStatus = verified.status;
    if (providerStatus === 'success') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'SUCCESS',
          providerRawStatus: providerStatus,
          paidAt: verified.paid_at ? new Date(verified.paid_at) : new Date(),
        },
      });
      return {
        status: 'success',
        reference: payment.reference,
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        paidAt: verified.paid_at ?? null,
      };
    }

    if (providerStatus === 'failed' || providerStatus === 'abandoned') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', providerRawStatus: providerStatus },
      });
      return { status: 'failed', reference, message: `Payment ${providerStatus}` };
    }

    // Still pending/processing
    return { status: 'pending', reference, message: 'Payment is still processing' };
  }
}