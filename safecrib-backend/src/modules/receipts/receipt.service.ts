import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { createHash } from 'crypto';

export interface ReceiptSnapshot {
  platformName: string;
  receiptNumber: string;
  payer: {
    id: string;
    displayName: string | null;
    email: string | null;
  };
  agent: {
    id: string | null;
    displayName: string | null;
  } | null;
  listing: {
    id: string;
    title: string;
    address: string | null;
  };
  lineItems: Array<{ label: string; amountMinor: number }>;
  totalMinor: number;
  currency: string;
  paystackReference: string;
  paidAt: string | null;
  issuedAt: string;
}

@Injectable()
export class ReceiptService {
  constructor(private readonly prisma: PrismaService) {}

  private canonicalize(snapshot: ReceiptSnapshot): string {
    // Simple stable serialization
    return JSON.stringify(snapshot, Object.keys(snapshot).sort());
  }

  async createReceipt(input: {
    paymentId: string;
    bookingId: string;
    escrowId?: string | null;
    payerId: string;
    agentId?: string | null;
    listingId: string;
    currency: string;
    totalMinor: number;
    snapshot: ReceiptSnapshot;
  }) {
    const snapshotHash = createHash('sha256').update(this.canonicalize(input.snapshot)).digest('hex');
    return this.prisma.receipt.create({
      data: {
        receiptNumber: input.snapshot.receiptNumber,
        paymentId: input.paymentId,
        bookingId: input.bookingId,
        escrowId: input.escrowId || null,
        payerId: input.payerId,
        agentId: input.agentId || null,
        listingId: input.listingId,
        currency: input.currency,
        totalMinor: input.totalMinor,
        status: 'ISSUED',
        snapshot: input.snapshot as any,
        snapshotHash,
      },
    });
  }
}
