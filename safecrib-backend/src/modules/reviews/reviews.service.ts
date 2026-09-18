import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TrustService } from '../trust/trust.service.js';
import type { CreateReviewDto } from './dto/review.dto.js';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService, private readonly trust: TrustService) {}

  async create(reviewerId: string, dto: CreateReviewDto) {
    const booking = await this.prisma.booking.findUnique({ where: { id: dto.bookingId }, include: { listing: { select: { ownerId: true } }, review: true } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.studentId !== reviewerId) throw new ForbiddenException('You can only review your own booking');
    if (booking.status !== 'COMPLETED') throw new ConflictException('Reviews are available only after a completed booking');
    if (booking.review) throw new ConflictException('A review already exists for this booking');
    const review = await this.prisma.$transaction(async (tx) => {
      const created = await tx.review.create({ data: { bookingId: booking.id, reviewerId, revieweeId: booking.listing.ownerId, rating: dto.rating, text: dto.text } });
      await tx.auditLog.create({ data: { actorId: reviewerId, action: 'REVIEW_SUBMITTED', entityType: 'review', entityId: created.id, metadata: { bookingId: booking.id } } });
      return created;
    });
    return review;
  }

  async moderate(reviewId: string, adminId: string, approved: boolean) {
    const review = await this.prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Review not found');
    const status = approved ? 'APPROVED' : 'HIDDEN';
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.review.update({ where: { id: reviewId }, data: { status, moderatedAt: new Date(), moderatedBy: adminId } });
      await tx.auditLog.create({ data: { actorId: adminId, action: approved ? 'REVIEW_APPROVED' : 'REVIEW_HIDDEN', entityType: 'review', entityId: reviewId } });
      return result;
    });
    if (approved) await this.trust.recordTrustEvent(review.revieweeId, 'REVIEW_RECEIVED', review.rating * 2, { reviewId, reviewerTrustFactor: 1 });
    return updated;
  }
}
