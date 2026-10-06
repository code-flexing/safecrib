import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsService', () => {
  it('queues bounded, recipient-scoped, retryable notifications', async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } };
    const service = new NotificationsService(queue as never, prisma as never);
    const input = {
      type: 'WELCOME' as const,
      title: 'T'.repeat(180),
      body: 'B'.repeat(550),
      href: `/${'h'.repeat(520)}`,
      dedupeKey: 'welcome:user-1',
    };

    await service.enqueue('user-1', input);

    expect(queue.add).toHaveBeenCalledWith(
      'deliver',
      {
        ...input,
        userId: 'user-1',
        title: 'T'.repeat(160),
        body: 'B'.repeat(500),
        href: `/${'h'.repeat(499)}`,
      },
      expect.objectContaining({
        jobId: expect.stringMatching(/^notification-[a-f0-9]{64}$/),
        attempts: 8,
        backoff: { type: 'exponential', delay: 1000 },
      }),
    );
  });

  it('logs queue failures without breaking the user action', async () => {
    const queue = { add: vi.fn().mockRejectedValue(new Error('Redis unavailable')) };
    const prisma = { user: { findMany: vi.fn().mockResolvedValue([]) } };
    const logger = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const service = new NotificationsService(queue as never, prisma as never);

    await expect(service.enqueue('user-1', {
      type: 'WELCOME',
      title: 'Welcome',
      body: 'Account ready',
      dedupeKey: 'welcome:user-1',
    })).resolves.toBeUndefined();
    expect(logger).toHaveBeenCalled();
    logger.mockRestore();
  });

  it('queues each admin notification for verified administrators only', async () => {
    const queue = { add: vi.fn().mockResolvedValue(undefined) };
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]),
      },
    };
    const service = new NotificationsService(queue as never, prisma as never);

    await service.enqueueAdmins({
      type: 'ADMIN_REVIEW_SUBMISSION',
      title: 'Profile awaiting review',
      body: 'A profile was submitted.',
      href: '/admin',
      dedupeKey: 'profile:submission-1',
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { role: 'ADMIN', emailVerified: true },
      select: { id: true },
    });
    expect(queue.add).toHaveBeenCalledTimes(2);
    expect(queue.add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({ userId: 'admin-1', type: 'ADMIN_REVIEW_SUBMISSION' }),
      expect.any(Object),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'deliver',
      expect.objectContaining({ userId: 'admin-2', type: 'ADMIN_REVIEW_SUBMISSION' }),
      expect.any(Object),
    );
  });
});
