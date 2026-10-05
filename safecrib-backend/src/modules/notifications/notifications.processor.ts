import { Worker, type Job } from 'bullmq';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { NOTIFICATION_QUEUE } from '../../infra/queue/queue.constants.js';
import { parseRedisConnection } from '../../infra/queue/redis-connection.util.js';
import { NotificationsGateway } from './notifications.gateway.js';
import type { NotificationQueuePayload } from './notification.types.js';
import { NotificationPushService } from './notification-push.service.js';

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  href: true,
  data: true,
  readAt: true,
  createdAt: true,
} as const;

@Injectable()
export class NotificationsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private worker: Worker<NotificationQueuePayload> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
    private readonly push: NotificationPushService,
  ) {}

  onModuleInit(): void {
    const configuredConcurrency = Number(this.config.get('NOTIFICATION_WORKER_CONCURRENCY') ?? 10);
    const concurrency = Number.isInteger(configuredConcurrency)
      ? Math.max(1, Math.min(configuredConcurrency, 50))
      : 10;
    const configuredRate = Number(this.config.get('NOTIFICATION_WORKER_RATE') ?? 100);
    const rate = Number.isInteger(configuredRate)
      ? Math.max(1, Math.min(configuredRate, 1000))
      : 100;

    this.worker = new Worker<NotificationQueuePayload>(
      NOTIFICATION_QUEUE,
      async (job: Job<NotificationQueuePayload>) => this.deliver(job.data),
      {
        connection: parseRedisConnection(this.config.get<string>('REDIS_URL')),
        concurrency,
        limiter: { max: rate, duration: 1000 },
      },
    );
    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Notification job ${job?.id ?? 'unknown'} failed after ${job?.attemptsMade ?? 0} attempts: ${error.message}`,
        error.stack,
      );
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.worker = null;
  }

  private async deliver(payload: NotificationQueuePayload): Promise<void> {
    const created = await this.prisma.notification.createMany({
      data: [{
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        href: payload.href,
        data: payload.data as object | undefined,
        dedupeKey: payload.dedupeKey,
      }],
      skipDuplicates: true,
    });
    const notification = await this.prisma.notification.findUnique({
      where: { userId_dedupeKey: { userId: payload.userId, dedupeKey: payload.dedupeKey } },
      select: notificationSelect,
    });
    if (!notification) {
      throw new Error(`Notification ${payload.dedupeKey} was inserted but could not be loaded`);
    }
    if (created.count > 0) this.gateway.emitNotification(payload.userId, notification);
    await this.push.deliverToUser(payload.userId, {
      title: notification.title,
      body: notification.body,
      href: notification.href ?? undefined,
    });
  }
}
