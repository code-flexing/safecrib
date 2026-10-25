import { Controller, Post, Headers, Req, HttpCode, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/public.decorator.js';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { PaystackService } from './paystack.service.js';
import { ReceiptService } from '../receipts/receipt.service.js';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackService,
    private readonly receipts: ReceiptService,
  ) {}

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  async webhook(@Headers() headers: Record<string, string>, @Req() req: Request, @Res() res: Response) {
    const signature = headers['x-paystack-signature'] || headers['X-Paystack-Signature'];
    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY') ?? '';
    const raw = req.body;
    let rawString: string;
    if (Buffer.isBuffer(raw)) {
      rawString = raw.toString();
    } else if (typeof raw === 'string') {
      rawString = raw;
    } else {
      rawString = JSON.stringify(raw ?? {});
    }
    const hash = crypto.createHmac('sha512', secret).update(rawString).digest('hex');
    if (!signature || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature))) {
      res.status(HttpStatus.UNAUTHORIZED).send('Invalid signature');
      return;
    }

    let payload: { event: string; data: { reference: string; status: string; paid_at: string | null; amount: number; currency: string; channel: string; customer: { email: string }; metadata: Record<string, unknown> | null } };
    try {
      payload = JSON.parse(rawString) as typeof payload;
    } catch {
      res.status(HttpStatus.BAD_REQUEST).send('Invalid payload');
      return;
    }

    await this.processWebhook(payload);
    res.status(HttpStatus.OK).send('ok');
  }

  private async processWebhook(payload: { event: string; data: { reference: string; status: string; paid_at: string | null; amount: number; currency: string; channel: string; customer: { email: string }; metadata: Record<string, unknown> | null } }): Promise<void> {
    const { event, data } = payload;
    const reference = data?.reference;
    if (!reference) return;

    const payment = await this.prisma.payment.findUnique({ where: { reference } });
    if (!payment) return;
    if (payment.status === 'SUCCESS') return;

    if (event === 'charge.success' && data.status === 'success') {
      await this.handleSuccess(payment, data);
    } else if (event === 'charge.failed' && data.status === 'failed') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', providerRawStatus: data.status, paidAt: data.paid_at ? new Date(data.paid_at) : null },
      });
    }
  }

  private async handleSuccess(payment: any, data: { reference: string; status: string; paid_at: string | null; amount: number; currency: string; channel: string; customer: { email: string }; metadata: Record<string, unknown> | null }): Promise<void> {
    const paidAt = data.paid_at ? new Date(data.paid_at) : new Date();

    await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'SUCCESS', providerRawStatus: data.status, paidAt },
        include: { booking: { include: { listing: { select: { id: true, title: true, address: true, ownerId: true } } } } },
      });

      const booking = updatedPayment.booking;
      if (!booking) return;
      const listing = booking.listing;

      const escrow = await tx.escrow.create({
        data: {
          bookingId: booking.id,
          paymentId: updatedPayment.id,
          payerId: updatedPayment.userId,
          agentId: listing?.ownerId ?? null,
          listingId: updatedPayment.listingId,
          amountMinor: updatedPayment.amountMinor,
          currency: updatedPayment.currency,
          state: 'HELD',
        },
      });

      const student = await tx.user.findUnique({
        where: { id: updatedPayment.userId },
        select: { id: true, displayName: true, email: true },
      });
      const owner = listing?.ownerId
        ? await tx.user.findUnique({ where: { id: listing.ownerId }, select: { id: true, displayName: true, email: true } })
        : null;

      const receiptNumber = `RCPT-${Date.now().toString(36).toUpperCase()}-${data.reference.slice(-6).toUpperCase()}`;
      await this.receipts.createReceipt({
        paymentId: updatedPayment.id,
        bookingId: booking.id,
        escrowId: escrow.id,
        payerId: updatedPayment.userId,
        agentId: owner?.id ?? null,
        listingId: updatedPayment.listingId,
        currency: updatedPayment.currency,
        totalMinor: updatedPayment.amountMinor,
        snapshot: {
          platformName: 'SafeCrib',
          receiptNumber,
          payer: { id: student?.id ?? '', displayName: student?.displayName ?? null, email: student?.email ?? null },
          agent: owner ? { id: owner.id, displayName: owner.displayName } : null,
          listing: { id: listing?.id ?? '', title: listing?.title ?? '', address: listing?.address ?? null },
          lineItems: [{ label: 'Deposit', amountMinor: updatedPayment.amountMinor }],
          totalMinor: updatedPayment.amountMinor,
          currency: updatedPayment.currency,
          paystackReference: data.reference,
          paidAt: paidAt.toISOString(),
          issuedAt: new Date().toISOString(),
        },
      });

      await tx.booking.update({
        where: { id: booking.id },
        data: { status: 'BOOKED', bookedAt: new Date(), holdExpiresAt: null },
      });
    });
  }
}