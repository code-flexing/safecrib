import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectJobQueue } from '../../infra/queue/queue-injection.js';
import type { JobQueueClient } from '../../infra/queue/queue.service.js';
import { NOTIFICATION_QUEUE } from '../../infra/queue/queue.constants.js';
import type { NotificationInput, NotificationQueuePayload } from './notification.types.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const MAX_TITLE_LENGTH = 160;
const MAX_BODY_LENGTH = 500;
const MAX_HREF_LENGTH = 500;
const MAX_DEDUPE_KEY_LENGTH = 200;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectJobQueue(NOTIFICATION_QUEUE) private readonly queue: JobQueueClient,
    private readonly prisma: PrismaService,
  ) {}

  async enqueue(userId: string, input: NotificationInput): Promise<void> {
    const payload: NotificationQueuePayload = {
      ...input,
      userId,
      title: input.title.slice(0, MAX_TITLE_LENGTH),
      body: input.body.slice(0, MAX_BODY_LENGTH),
      href: input.href?.slice(0, MAX_HREF_LENGTH),
      dedupeKey: input.dedupeKey.slice(0, MAX_DEDUPE_KEY_LENGTH),
    };
    const jobHash = createHash('sha256')
      .update(`${userId}\0${payload.dedupeKey}`)
      .digest('hex');

    try {
      await this.queue.add('deliver', payload, {
        jobId: `notification-${jobHash}`,
        attempts: 8,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: { age: 3600, count: 50_000 },
        removeOnFail: { age: 7 * 24 * 3600, count: 100_000 },
      });
    } catch (error) {
      this.logger.error(
        `Could not queue notification ${input.type} for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async enqueueAdmins(input: NotificationInput): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: 'ADMIN', emailVerified: true },
        select: { id: true },
      });
      await Promise.all(admins.map((admin) => this.enqueue(admin.id, input)));
    } catch (error) {
      this.logger.error(
        `Could not deliver admin notification ${input.type}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
