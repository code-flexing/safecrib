import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { CompleteStudentProfileDto } from './dto/student-signup.dto.js';
import { StudentProfileService } from './student-profiles.service.js';

describe('StudentProfileService.completeProfile', () => {
  it('blocks student profile submission while a provider Page is under review', async () => {
    const tx = {
      providerPage: {
        findUnique: vi.fn().mockResolvedValue({ verificationState: 'SUBMITTED' }),
      },
      studentProfile: { create: vi.fn(), update: vi.fn() },
    };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-id',
          email: 'student@example.com',
          role: 'STUDENT',
        }),
      },
      studentProfile: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;
    const service = new StudentProfileService(prisma, { enqueueAdmins: vi.fn() } as never);

    await expect(
      service.completeProfile('user-id', {
        proofOfStudentship: 'student-proof-id',
        schoolOfStudy: 'SafeCrib University',
        courseOfStudy: 'Computer Science',
        level: '100',
        profilePicture: 'profile-picture-id',
      } as CompleteStudentProfileDto),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(tx.studentProfile.create).not.toHaveBeenCalled();
  });
});