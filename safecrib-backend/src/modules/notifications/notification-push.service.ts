import webPush, { type PushSubscription as WebPushSubscription } from 'web-push';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

const PUSH_HOST_SUFFIXES = [
  'fcm.googleapis.com',
  'push.apple.com',
  'push.services.mozilla.com',
  'notify.windows.com',
];

@Injectable()
export class NotificationPushService {
  private readonly logger = new Logger(NotificationPushService.name);
  private readonly publicKey: string | null;
  private readonly enabled: boolean;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const publicKey = config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    const subject = config.get<string>('VAPID_SUBJECT')?.trim();
    this.enabled = Boolean(publicKey && privateKey && subject);
    this.publicKey = this.enabled ? publicKey! : null;

    if (this.enabled) {
      webPush.setVapidDetails(subject!, publicKey!, privateKey!);
    } else {
      this.logger.warn('Web Push is disabled because VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT are not all configured.');
    }
  }

  getPublicConfig() {
    return { enabled: this.enabled, publicKey: this.publicKey };
  }

  async saveSubscription(userId: string, subscription: WebPushSubscription) {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Phone notifications are not configured on this server');
    }
    this.assertSupportedEndpoint(subscription.endpoint);
    const existing = await this.prisma.notificationPushSubscription.findUnique({
      where: { endpoint: subscription.endpoint },
      select: { id: true },
    });
    if (!existing) {
      const subscriptionCount = await this.prisma.notificationPushSubscription.count({
        where: { userId },
      });
      if (subscriptionCount >= 10) {
        throw new BadRequestException('A maximum of 10 phone notification devices can be connected');
      }
    }
    return this.prisma.notificationPushSubscription.upsert({
      where: { endpoint: subscription.endpoint },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      update: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
      select: { id: true },
    });
  }

  async removeSubscription(userId: string, endpoint: string) {
    this.assertSupportedEndpoint(endpoint);
    const result = await this.prisma.notificationPushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { removed: result.count > 0 };
  }

  async deliverToUser(userId: string, payload: { title: string; body: string; href?: string }) {
    if (!this.enabled) return;
    const subscriptions = await this.prisma.notificationPushSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    await Promise.all(subscriptions.map(async (subscription) => {
      const webSubscription: WebPushSubscription = {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      };
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await webPush.sendNotification(webSubscription, JSON.stringify({
            title: payload.title,
            body: payload.body,
            href: payload.href ?? '/notifications',
          }));
          return;
        } catch (error) {
          const statusCode = typeof error === 'object' && error !== null && 'statusCode' in error
            ? Number(error.statusCode)
            : undefined;
          if (statusCode === 404 || statusCode === 410) {
            try {
              await this.prisma.notificationPushSubscription.deleteMany({
                where: { id: subscription.id },
              });
            } catch (cleanupError) {
              this.logger.error(
                `Could not remove expired push subscription ${subscription.id}: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
                cleanupError instanceof Error ? cleanupError.stack : undefined,
              );
            }
            return;
          }
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
            continue;
          }
          this.logger.error(
            `Could not send notification push to subscription ${subscription.id} after ${attempt} attempts: ${error instanceof Error ? error.message : String(error)}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    }));
  }

  private assertSupportedEndpoint(endpoint: string) {
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw new BadRequestException('Invalid push subscription endpoint');
    }
    const host = parsed.hostname.toLowerCase();
    if (
      parsed.protocol !== 'https:' ||
      !PUSH_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
    ) {
      throw new BadRequestException('Unsupported push subscription endpoint');
    }
  }
}
