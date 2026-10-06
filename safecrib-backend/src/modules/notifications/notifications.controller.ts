import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationPushService } from './notification-push.service.js';
import { PushSubscriptionDto, RemovePushSubscriptionDto } from './dto/push-subscription.dto.js';

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 50;

function decodeCursor(value?: string): { createdAt: Date; id: string } | null {
  if (!value) return null;
  if (value.length > 256) throw new BadRequestException('Invalid notification cursor');
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    const separator = decoded.indexOf('|');
    const createdAt = new Date(decoded.slice(0, separator));
    const id = decoded.slice(separator + 1);
    if (separator < 1 || !id || Number.isNaN(createdAt.getTime())) throw new Error();
    return { createdAt, id };
  } catch {
    throw new BadRequestException('Invalid notification cursor');
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString('base64url');
}

function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return candidate.code === 'P2021' || (
    typeof candidate.message === 'string' && candidate.message.includes('does not exist in the current database')
  );
}

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly push: NotificationPushService,
  ) {}

  @Post('student-profile-reminder')
  @ApiOperation({ summary: 'Create the profile completion reminder for an unsubmitted student' })
  async createStudentProfileReminder(@CurrentUser() user: { id: string }) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true, studentProfile: { select: { status: true } } },
    });
    if (!account || !['UNVERIFIED', 'STUDENT'].includes(account.role)) {
      return { created: false };
    }
    if (account.studentProfile && account.studentProfile.status !== 'NOT_SUBMITTED') {
      return { created: false };
    }
    await this.notifications.enqueue(user.id, {
      type: 'STUDENT_PROFILE_COMPLETION',
      title: 'Complete your student profile',
      body: 'Add your student details and submit them for verification.',
      href: '/profile/complete',
      dedupeKey: 'student-profile-completion',
    });
    return { queued: true };
  }

  @Get('push/config')
  @ApiOperation({ summary: 'Get public phone notification configuration' })
  getPushConfig() {
    return this.push.getPublicConfig();
  }

  @Post('push/subscriptions')
  @ApiOperation({ summary: 'Save a phone notification subscription for the authenticated user' })
  async savePushSubscription(
    @CurrentUser() user: { id: string },
    @Body() subscription: PushSubscriptionDto,
  ) {
    return this.push.saveSubscription(user.id, {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.p256dh, auth: subscription.auth },
    });
  }

  @Delete('push/subscriptions')
  @ApiOperation({ summary: 'Remove a phone notification subscription owned by the authenticated user' })
  async removePushSubscription(
    @CurrentUser() user: { id: string },
    @Body() subscription: RemovePushSubscriptionDto,
  ) {
    return this.push.removeSubscription(user.id, subscription.endpoint);
  }

  private async withNotificationTableFallback<T>(fallback: T, callback: () => Promise<T>): Promise<T> {
    try {
      return await callback();
    } catch (error) {
      if (isMissingTableError(error)) return fallback;
      throw error;
    }
  }

  @Get()
  @ApiOperation({ summary: 'List the authenticated user notifications' })
  async list(
    @CurrentUser() user: { id: string },
    @Query('before') before?: string,
    @Query('limit') limitValue?: string,
    @Query('after') after?: string,
  ) {
    const requestedLimit = limitValue === undefined ? DEFAULT_PAGE_SIZE : Number(limitValue);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
      throw new BadRequestException('Notification limit must be a positive integer');
    }
    const limit = Math.min(requestedLimit, MAX_PAGE_SIZE);
    if (before && after) {
      throw new BadRequestException('Use either before or after, not both');
    }
    const cursor = decodeCursor(before);
    const newerThan = decodeCursor(after);
    return this.withNotificationTableFallback({
      notifications: [],
      unreadCount: 0,
      nextCursor: null,
      latestCursor: null,
      hasMoreAfter: false,
    }, async () => {
      const rows = await this.prisma.notification.findMany({
        where: {
          userId: user.id,
          ...(cursor ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          } : {}),
          ...(newerThan ? {
            OR: [
              { createdAt: { gt: newerThan.createdAt } },
              { createdAt: newerThan.createdAt, id: { gt: newerThan.id } },
            ],
          } : {}),
        },
        orderBy: newerThan
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          href: true,
          data: true,
          readAt: true,
          createdAt: true,
        },
      });
      const hasMore = rows.length > limit;
      const selectedRows = rows.slice(0, limit);
      const notifications = newerThan ? selectedRows.reverse() : selectedRows;
      const unreadCount = await this.prisma.notification.count({
        where: { userId: user.id, readAt: null },
      });
      const last = notifications.at(-1);
      const latest = notifications[0];
      return {
        notifications,
        unreadCount,
        nextCursor: !newerThan && hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
        latestCursor: latest ? encodeCursor(latest.createdAt, latest.id) : null,
        hasMoreAfter: Boolean(newerThan && hasMore),
      };
    });
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get the authenticated user unread notification count' })
  async unreadCount(@CurrentUser() user: { id: string }) {
    return this.withNotificationTableFallback({ count: 0 }, async () => {
      const count = await this.prisma.notification.count({
        where: { userId: user.id, readAt: null },
      });
      return { count };
    });
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all authenticated user notifications as read' })
  async markAllRead(@CurrentUser() user: { id: string }) {
    return this.withNotificationTableFallback({ updated: 0 }, async () => {
      const result = await this.prisma.notification.updateMany({
        where: { userId: user.id, readAt: null },
        data: { readAt: new Date() },
      });
      return { updated: result.count };
    });
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one owned notification as read' })
  async markRead(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.withNotificationTableFallback({ id, readAt: null, updated: false }, async () => {
      const result = await this.prisma.notification.updateMany({
        where: { id, userId: user.id, readAt: null },
        data: { readAt: new Date() },
      });
      const notification = await this.prisma.notification.findFirst({
        where: { id, userId: user.id },
        select: { id: true, readAt: true },
      });
      if (!notification) throw new NotFoundException('Notification not found');
      return { ...notification, updated: result.count > 0 };
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete one owned notification' })
  async deleteNotification(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.withNotificationTableFallback({ deleted: false, unreadCount: 0 }, async () => {
      const result = await this.prisma.notification.deleteMany({
        where: { id, userId: user.id },
      });
      if (!result.count) throw new NotFoundException('Notification not found');
      const unreadCount = await this.prisma.notification.count({
        where: { userId: user.id, readAt: null },
      });
      return { deleted: true, unreadCount };
    });
  }
}
