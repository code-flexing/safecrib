import { Worker, Job } from 'bullmq';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import {
  BOOKING_HOLD_EXPIRY_QUEUE,
} from '../../infra/queue/queue.constants.js';
import { parseRedisConnection } from '../../infra/queue/redis-connection.util.js';
import {
  applyTransition,
  IllegalStateTransitionError,
  type BookingStatus,
} from '../../domain/booking/booking-state-machine.js';

export interface BookingHoldExpiryJobData {
  bookingId: string;
  listingId: string;
}

@Injectable()
export class BookingHoldExpiryProcessor implements OnModuleInit {
  private readonly logger = new Logger(BookingHoldExpiryProcessor.name);
  private worker: Worker | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';

    this.worker = new Worker<BookingHoldExpiryJobData>(
      BOOKING_HOLD_EXPIRY_QUEUE,
      async (job: Job<BookingHoldExpiryJobData>) => {
        const { bookingId, listingId } = job.data;

        const booking = await this.prisma.booking.findUnique({
          where: { id: bookingId },
          select: {
            id: true,
            listingId: true,
            status: true,
            holdExpiresAt: true,
            depositAmount: true,
            studentId: true,
          },
        });

        if (!booking || booking.status !== 'HELD') {
          this.logger.log(`Booking ${bookingId} is no longer HELD, skipping expiry`);
          return;
        }

        const now = new Date();
        if (booking.holdExpiresAt && booking.holdExpiresAt > now) {
          this.logger.log(`Booking ${bookingId} hold not yet expired, skipping`);
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
        } catch (err: unknown) {
          if (err instanceof IllegalStateTransitionError) {
            this.logger.log(`Booking ${bookingId} already transitioned, skipping`);
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
            where: { id: listingId },
            data: { status: 'ACTIVE' },
          }),
        ]);

        this.logger.log(`Booking ${bookingId} hold expired and cancelled`);
      },
      {
        connection: parseRedisConnection(redisUrl),
      },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Booking hold expiry failed: ${err?.message}`, err?.stack);
    });
  }
}
