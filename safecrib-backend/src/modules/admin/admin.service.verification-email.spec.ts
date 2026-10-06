import { describe, expect, it, vi } from 'vitest';
import type { JobQueueClient } from '../../infra/queue/queue.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { TrustService } from '../trust/trust.service.js';
import { AdminService } from './admin.service.js';

describe('AdminService.reviewSubmission verification email', () => {
  it('falls back to the matching student email when a queued profile ID is stale', async () => {
    const tx = {
      adminReviewQueue: { update: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-id', role: 'UNVERIFIED' }),
        update: vi.fn().mockResolvedValue({ id: 'user-id' }),
      },
      studentProfile: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      adminReviewQueue: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'submission-id',
          email: 'student@example.com',
          tier: 'STUDENT',
          reviewType: 'SIGNUP',
          entityType: 'student_profile',
          entityId: 'profile-id',
          status: 'PENDING',
        }),
      },
      studentProfile: {
        findFirst: vi.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
          id: 'profile-id',
          userId: 'user-id',
          status: 'PENDING',
          displayName: 'Student Name',
          }),
      },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;
    const trustService = { getVerificationStage: vi.fn().mockResolvedValue({}) };
    const emailQueue = { add: vi.fn().mockResolvedValue(undefined) };
    const service = new AdminService(
      prisma,
      trustService as unknown as TrustService,
      emailQueue as unknown as JobQueueClient,
      { enqueue: vi.fn().mockResolvedValue(undefined) } as never,
    );

    await service.reviewSubmission('submission-id', 'admin-id', { status: 'APPROVED' });

    expect(prisma.studentProfile.findFirst).toHaveBeenNthCalledWith(1, {
      where: { id: 'profile-id', user: { email: 'student@example.com' } },
    });
    expect(prisma.studentProfile.findFirst).toHaveBeenNthCalledWith(2, {
      where: { user: { email: 'student@example.com' } },
      orderBy: { submittedAt: 'desc' },
    });
    expect(trustService.getVerificationStage).toHaveBeenCalledWith('user-id');
    expect(emailQueue.add).toHaveBeenCalledWith(
      'profile-verification-email',
      expect.objectContaining({ type: 'student-approval', to: 'student@example.com' }),
      expect.any(Object),
    );
  });
});