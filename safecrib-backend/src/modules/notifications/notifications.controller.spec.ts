import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';

describe('NotificationsController', () => {
  it('always scopes notification reads and counts to the authenticated user', async () => {
    const prisma = {
      notification: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(3),
      },
    };
    const controller = new NotificationsController(prisma as never);

    const response = await controller.list({ id: 'user-1' }, undefined, undefined, undefined);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1' },
    }));
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
    });
    expect(response.unreadCount).toBe(3);
  });

  it('falls back to an empty state when the notifications table is missing', async () => {
    const prisma = {
      notification: {
        findMany: vi.fn().mockRejectedValue(Object.assign(new Error('Table does not exist'), { code: 'P2021' })),
        count: vi.fn().mockRejectedValue(Object.assign(new Error('Table does not exist'), { code: 'P2021' })),
      },
    };
    const controller = new NotificationsController(prisma as never);

    await expect(controller.list({ id: 'user-1' }, undefined, undefined)).resolves.toEqual({
      notifications: [],
      unreadCount: 0,
      nextCursor: null,
      latestCursor: null,
      hasMoreAfter: false,
    });
    await expect(controller.unreadCount({ id: 'user-1' })).resolves.toEqual({ count: 0 });
  });

  it('returns only notifications newer than the supplied cursor', async () => {
    const createdAt = new Date('2026-10-06T12:00:00.000Z');
    const prisma = {
      notification: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'notification-2', createdAt, type: 'WELCOME' },
        ]),
        count: vi.fn().mockResolvedValue(1),
      },
    };
    const controller = new NotificationsController(prisma as never);
    const cursor = Buffer.from(`${new Date('2026-10-06T11:00:00.000Z').toISOString()}|notification-1`).toString('base64url');

    const response = await controller.list({ id: 'user-1' }, undefined, '30', cursor);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: 'user-1',
        OR: [
          { createdAt: { gt: new Date('2026-10-06T11:00:00.000Z') } },
          { createdAt: new Date('2026-10-06T11:00:00.000Z'), id: { gt: 'notification-1' } },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }));
    expect(response.notifications).toHaveLength(1);
    expect(response.latestCursor).toBe(Buffer.from(`${createdAt.toISOString()}|notification-2`).toString('base64url'));
  });

  it('does not mark or reveal another user’s notification', async () => {
    const prisma = {
      notification: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const controller = new NotificationsController(prisma as never);

    await expect(controller.markRead({ id: 'user-1' }, 'notification-1'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notification-1', userId: 'user-1', readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
