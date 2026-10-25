import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export interface QuoteLineItem {
  label: string;
  amountMinor: number;
}

export interface SecureQuote {
  amountMinor: number;
  currency: 'NGN';
  lineItems: QuoteLineItem[];
  total: number;
}

function computeDiscountedPrice(listing: { price: number; discountAmount?: number | null }) {
  const price = Number(listing.price);
  const discountAmount = listing.discountAmount == null ? 0 : Number(listing.discountAmount);
  if (!Number.isFinite(price) || price <= 0) return NaN;
  const discounted = price - discountAmount;
  if (!Number.isFinite(discounted) || discounted < 0) return NaN;
  return discounted;
}

export function getSecureQuoteValues(listing: { price: number; discountAmount?: number | null }) {
  const discounted = computeDiscountedPrice(listing);
  if (!Number.isFinite(discounted) || discounted <= 0) {
    return { valid: false as const, reason: 'NO_PRICE' as const };
  }
  const price = Number(listing.price);
  const discountAmount = listing.discountAmount == null ? 0 : Number(listing.discountAmount);
  const lineItems: QuoteLineItem[] = [];
  if (discountAmount > 0) {
    lineItems.push({ label: 'Base price', amountMinor: Math.round(price * 100) });
    lineItems.push({ label: 'Discount', amountMinor: -Math.round(discountAmount * 100) });
    lineItems.push({ label: "Home price", amountMinor: Math.round(discounted * 100) });
  } else {
    lineItems.push({ label: "Home price", amountMinor: Math.round(discounted * 100) });
  }
  const amountMinor = Math.round(discounted * 100);
  return { valid: true as const, amountMinor, currency: 'NGN' as const, lineItems, total: amountMinor };
}

@Injectable()
export class SecureQuoteService {
  constructor(private readonly prisma: PrismaService) {}

  async getSecureQuote(listingId: string, studentId: string): Promise<SecureQuote & { eligibility: { allowed: boolean; reason?: string } }> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        id: true,
        price: true,
        discountAmount: true,
        availability: true,
        status: true,
        ownerId: true,
      },
    });
    if (!listing) {
      throw new BadRequestException('Listing not found');
    }
    const res = getSecureQuoteValues(listing as any);
    if (!res.valid) {
      return {
        amountMinor: 0,
        currency: 'NGN',
        lineItems: [],
        total: 0,
        eligibility: { allowed: false, reason: res.reason },
      };
    }
    return {
      amountMinor: res.amountMinor,
      currency: res.currency,
      lineItems: res.lineItems,
      total: res.total,
      eligibility: { allowed: true },
    };
  }
}
