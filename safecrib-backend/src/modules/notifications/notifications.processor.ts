import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { NOTIFICATION_QUEUE } from '../../infra/queue/queue.constants.js';
import { QueueService } from '../../infra/queue/queue.service.js';
import { NotificationsGateway } from './notifications.gateway.js';
import type { NotificationQueuePayload } from './notification.types.js';
import { NotificationPushService } from './notification-push.service.js';
import { serializeNotificationRow } from './notification-serializer.util.js';

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  href: true,
  data: true,
  readAt: true,
  createdAt: true,
  source: true,
  actorId: true,
  actorSnapshot: true,
} as const;

@Injectable()
export class NotificationsProcessor implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly queues: QueueService,
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

    this.queues.registerWorker<NotificationQueuePayload>(
      NOTIFICATION_QUEUE,
      concurrency,
      async (job) => this.deliver(job.data),
      { max: rate, durationMs: 1000 },
    );
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
        source: payload.source as any,
        actorId: payload.actorId as any,
        actorSnapshot: payload.actorSnapshot as any,
      }] as any,
      skipDuplicates: true,
    });
    const notification = await this.prisma.notification.findUnique({
      where: { userId_dedupeKey: { userId: payload.userId, dedupeKey: payload.dedupeKey } },
      select: notificationSelect,
    });
    if (!notification) {
      throw new Error(`Notification ${payload.dedupeKey} was inserted but could not be loaded`);
    }
    if (created.count > 0) this.gateway.emitNotification(payload.userId, serializeNotificationRow(notification));
    await this.push.deliverToUser(payload.userId, {
      title: notification.title,
      body: notification.body,
      href: notification.href ?? undefined,
    });
  }
}
