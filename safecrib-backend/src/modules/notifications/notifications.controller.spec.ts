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

    const response = await controller.list({ id: 'user-1' }, undefined, undefined);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1' },
    }));
    expect(prisma.notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
    });
    expect(response.unreadCount).toBe(3);
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
