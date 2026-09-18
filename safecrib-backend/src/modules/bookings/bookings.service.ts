import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  BOOKING_HOLD_EXPIRY_QUEUE,
  TRUST_RECOMPUTE_QUEUE,
} from '../../infra/queue/queue.constants.js';
import {
  applyTransition,
  type BookingStatus,
  IllegalStateTransitionError,
} from '../../domain/booking/booking-state-machine.js';
type PrismaBookingStatus = Exclude<BookingStatus, 'AVAILABLE'>;
import type { CreateBookingDto } from './dto/booking.dto.js';

export interface BookingResult {
  id: string;
  listingId: string;
  studentId: string;
  status: BookingStatus;
  depositAmount: number;
  holdExpiresAt: Date | null;
  bookedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const HOLD_DURATION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(BOOKING_HOLD_EXPIRY_QUEUE)
    private readonly holdExpiryQueue: Queue,
    @InjectQueue(TRUST_RECOMPUTE_QUEUE)
    private readonly trustRecomputeQueue: Queue,
  ) {}

  async createBooking(studentId: string, dto: CreateBookingDto): Promise<BookingResult> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: dto.listingId },
      select: { id: true, ownerId: true, status: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.status !== 'VERIFIED') {
      throw new ConflictException('Listing is not available');
    }

    const existingActiveBooking = await this.prisma.booking.findFirst({
      where: {
        listingId: dto.listingId,
        status: { in: ['HELD', 'BOOKED'] as any },
      },
    });

    if (existingActiveBooking) {
      throw new ConflictException('This listing is currently being held or booked');
    }

    const holdExpiresAt = new Date(Date.now() + HOLD_DURATION_MS);

    const booking = await this.prisma.$transaction(async (tx) => {
      const created = await tx.booking.create({
        data: {
          listingId: dto.listingId,
          studentId,
          status: 'HELD',
          depositAmount: dto.depositAmount,
          holdExpiresAt,
        },
      });

      await tx.listing.update({
        where: { id: dto.listingId },
        data: { status: 'INACTIVE' },
      });

      return created;
    });

    await this.holdExpiryQueue.add(
      'expire-hold',
      { bookingId: booking.id, listingId: dto.listingId },
      { delay: HOLD_DURATION_MS },
    );

    return this.toResult(booking);
  }

  async confirmBooking(bookingId: string, studentId: string, depositAmount?: number): Promise<BookingResult> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, listingId: true, studentId: true, status: true, depositAmount: true, holdExpiresAt: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.studentId !== studentId) {
      throw new ConflictException('You can only confirm your own bookings');
    }

    try {
      const updated = applyTransition(
        {
          id: booking.id,
          listingId: booking.listingId,
          status: booking.status as BookingStatus,
          holdExpiresAt: booking.holdExpiresAt,
          depositAmount: booking.depositAmount,
        },
        'BOOKED',
        { bookedAt: new Date() },
      );

      const result = await this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: updated.status as PrismaBookingStatus,
          holdExpiresAt: null,
          bookedAt: new Date(),
          depositAmount: depositAmount ?? booking.depositAmount,
        },
      });

      await this.prisma.listing.update({
        where: { id: booking.listingId },
        data: { status: 'SOLD' },
      });

      await this.trustRecomputeQueue.add('recompute', {
        userId: booking.studentId,
      });

      await this.trustRecomputeQueue.add('recompute', {
        userId: (await this.prisma.listing.findUnique({
          where: { id: booking.listingId },
          select: { ownerId: true },
        }))?.ownerId,
      });

      return this.toResult(result);
    } catch (err) {
      if (err instanceof IllegalStateTransitionError) {
        throw new BadRequestException(
          `Booking is in ${err.currentState} status and cannot be confirmed`,
        );
      }
      throw err;
    }
  }

  async releaseHold(bookingId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        listingId: true,
        status: true,
        holdExpiresAt: true,
        depositAmount: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.status !== 'HELD') {
      return;
    }

    try {
      applyTransition(
        {
          id: booking.id,
          listingId: booking.listingId,
          status: booking.status as BookingStatus,
          holdExpiresAt: booking.holdExpiresAt,
          depositAmount: booking.depositAmount,
        },
        'AVAILABLE',
      );
    } catch (err) {
      if (err instanceof IllegalStateTransitionError) {
        return;
      }
      throw err;
    }

    await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: bookingId },
        data: { status: 'CANCELLED' },
      }),
      this.prisma.listing.update({
        where: { id: booking.listingId },
        data: { status: 'VERIFIED' },
      }),
    ]);
  }

  async cancelBooking(bookingId: string, studentId: string): Promise<void> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        listingId: true,
        studentId: true,
        status: true,
        holdExpiresAt: true,
        depositAmount: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.studentId !== studentId) {
      throw new ConflictException('You can only cancel your own bookings');
    }

    if (booking.status !== 'HELD' && booking.status !== 'BOOKED') {
      throw new BadRequestException(
        `Cannot cancel a booking in ${booking.status} status`,
      );
    }

    try {
      applyTransition(
        {
          id: booking.id,
          listingId: booking.listingId,
          status: booking.status as BookingStatus,
          holdExpiresAt: booking.holdExpiresAt,
          depositAmount: booking.depositAmount,
        },
        'CANCELLED',
      );
    } catch (err) {
      if (err instanceof IllegalStateTransitionError) {
        throw new BadRequestException(
          `Cannot cancel booking in ${booking.status} status`,
        );
      }
      throw err;
    }

    await this.prisma.$transaction([
      this.prisma.booking.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
      }),
      this.prisma.listing.update({
        where: { id: booking.listingId },
        data: { status: 'VERIFIED' },
      }),
    ]);
  }

  async completeBooking(bookingId: string, studentId: string): Promise<BookingResult> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        listingId: true,
        studentId: true,
        status: true,
        holdExpiresAt: true,
        depositAmount: true,
        bookedAt: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.studentId !== studentId) {
      throw new ConflictException('You can only complete your own bookings');
    }

    if (booking.status !== 'BOOKED') {
      throw new BadRequestException(
        `Cannot complete a booking in ${booking.status} status`,
      );
    }

    try {
      applyTransition(
        {
          id: booking.id,
          listingId: booking.listingId,
          status: booking.status as BookingStatus,
          holdExpiresAt: booking.holdExpiresAt,
          depositAmount: booking.depositAmount,
        },
        'COMPLETED',
        { completedAt: new Date() },
      );
    } catch (err) {
      if (err instanceof IllegalStateTransitionError) {
        throw new BadRequestException(
          `Cannot complete booking in ${booking.status} status`,
        );
      }
      throw err;
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: booking.listingId },
      select: { ownerId: true },
    });

    const completed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      await tx.trustEvent.create({
        data: {
          userId: booking.studentId,
          eventType: 'BOOKING_COMPLETED',
          weight: 5,
        },
      });

      if (listing) {
        await tx.trustEvent.create({
          data: {
            userId: listing.ownerId,
            eventType: 'BOOKING_COMPLETED',
            weight: 10,
          },
        });
      }

      return updated;
    });

    if (listing?.ownerId) {
      await this.trustRecomputeQueue.add('recompute', { userId: listing.ownerId });
    }
    await this.trustRecomputeQueue.add('recompute', { userId: booking.studentId });

    return this.toResult(completed);
  }

  async disputeBooking(bookingId: string, studentId: string, _reason: string): Promise<BookingResult> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        listingId: true,
        studentId: true,
        status: true,
        holdExpiresAt: true,
        depositAmount: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.studentId !== studentId) {
      throw new ConflictException('You can only dispute your own bookings');
    }

    if (booking.status !== 'BOOKED') {
      throw new BadRequestException(
        `Cannot dispute a booking in ${booking.status} status`,
      );
    }

    try {
      applyTransition(
        {
          id: booking.id,
          listingId: booking.listingId,
          status: booking.status as BookingStatus,
          holdExpiresAt: booking.holdExpiresAt,
          depositAmount: booking.depositAmount,
        },
        'DISPUTED',
      );
    } catch (err) {
      if (err instanceof IllegalStateTransitionError) {
        throw new BadRequestException(
          `Cannot dispute booking in ${booking.status} status`,
        );
      }
      throw err;
    }

    const listing = await this.prisma.listing.findUnique({
      where: { id: booking.listingId },
      select: { ownerId: true },
    });

    const disputed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.booking.update({
        where: { id: bookingId },
        data: {
          status: 'DISPUTED',
          holdExpiresAt: null,
        },
      });

      await tx.trustEvent.create({
        data: {
          userId: booking.studentId,
          eventType: 'DISPUTE_RESOLVED_AGAINST',
          weight: -5,
        },
      });

      if (listing) {
        await tx.trustEvent.create({
          data: {
            userId: listing.ownerId,
            eventType: 'DISPUTE_RESOLVED_AGAINST',
            weight: -30,
          },
        });
      }

      return updated;
    });

    if (listing?.ownerId) {
      await this.trustRecomputeQueue.add('recompute', { userId: listing.ownerId });
    }
    await this.trustRecomputeQueue.add('recompute', { userId: booking.studentId });

    return this.toResult(disputed);
  }

  async getMyBookings(studentId: string): Promise<BookingResult[]> {
    const bookings = await this.prisma.booking.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
    });

    return bookings.map((b) => this.toResult(b));
  }

  async getBooking(bookingId: string, studentId: string): Promise<BookingResult> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.studentId !== studentId) {
      throw new ConflictException('You can only view your own bookings');
    }

    return this.toResult(booking);
  }

  private toResult(booking: any): BookingResult {
    return {
      id: booking.id,
      listingId: booking.listingId,
      studentId: booking.studentId,
      status: booking.status,
      depositAmount: booking.depositAmount,
      holdExpiresAt: booking.holdExpiresAt,
      bookedAt: booking.bookedAt,
      completedAt: booking.completedAt,
      createdAt: booking.createdAt,
      updatedAt: booking.updatedAt,
    };
  }
}
