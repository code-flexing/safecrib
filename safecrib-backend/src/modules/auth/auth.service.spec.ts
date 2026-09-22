import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { AuthService } from './auth.service.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { Queue } from 'bullmq';

const { mockArgonHash, mockArgonVerify } = vi.hoisted(() => ({
  mockArgonHash: vi.fn().mockResolvedValue('hashed'),
  mockArgonVerify: vi.fn().mockResolvedValue(true),
}));

vi.mock('argon2', () => ({
  hash: mockArgonHash,
  verify: mockArgonVerify,
  argon2id: 'argon2id',
  default: { hash: mockArgonHash, verify: mockArgonVerify, argon2id: 'argon2id' },
}));

type PrismaMock = {
  user: {
    create: Mock;
    findUnique: Mock;
    update: Mock;
  };
  emailVerificationToken: {
    create: Mock;
    findFirst: Mock;
    deleteMany: Mock;
  };
  passwordResetToken: {
    create: Mock;
    findFirst: Mock;
    deleteMany: Mock;
  };
  refreshToken: {
    create: Mock;
    update: Mock;
    updateMany: Mock;
  };
  $transaction: Mock;
};

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: PrismaMock;
  let emailQueue: { add: Mock };

  beforeEach(() => {
    emailQueue = { add: vi.fn().mockResolvedValue(undefined) };

    prisma = {
      user: {
        create: vi.fn().mockResolvedValue({
          id: 'user-123',
          email: 'newuser@example.com',
          passwordHash: 'hashed',
          displayName: 'New User',
          role: 'STUDENT',
          emailVerified: true,
          identityVerified: false,
        }),
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue({}),
      },
      emailVerificationToken: {
        create: vi.fn().mockResolvedValue({ id: 'token-id' }),
        findFirst: vi.fn().mockResolvedValue(null),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      passwordResetToken: {
        create: vi.fn().mockResolvedValue({ id: 'reset-id' }),
        findFirst: vi.fn().mockResolvedValue(null),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      refreshToken: {
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: vi.fn(),
    } as unknown as PrismaMock;

    authService = new AuthService(
      prisma as unknown as PrismaService,
      { sign: vi.fn().mockReturnValue('token'), verify: vi.fn().mockReturnValue({ sub: 'user-id', email: 'test@example.com', role: 'STUDENT' }) } as unknown as JwtService,
      { get: vi.fn((key: string) => ({ JWT_ACCESS_SECRET: 'secret', JWT_REFRESH_SECRET: 'refresh_secret' }[key])) } as unknown as ConfigService,
      emailQueue as unknown as Queue,
    );
  });

  describe('register', () => {
    it('should create user with emailVerified=true and queue welcome email', async () => {
      const result = await authService.register({
        email: 'newuser@example.com',
        password: 'SuperSecure123!',
        displayName: 'New User',
      });

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'newuser@example.com',
            emailVerified: true,
          }),
        }),
      );

      expect(emailQueue.add).toHaveBeenCalledWith(
        'welcome-email',
        expect.objectContaining({
          type: 'welcome',
          to: 'newuser@example.com',
          displayName: 'New User',
        }),
        expect.objectContaining({
          attempts: 5,
          backoff: expect.any(Object),
        }),
      );

      expect(result.message).toContain('welcome email');
      expect(result.userId).toBeTruthy();
    });

    it('should reject duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({
        id: 'existing-user-id',
        email: 'exists@example.com',
      });

      await expect(
        authService.register({
          email: 'exists@example.com',
          password: 'SuperSecure123!',
        }),
      ).rejects.toThrow('An account with this email already exists');
    });
  });

  describe('forgotPassword', () => {
    it('should queue password-reset email with correct type field', async () => {
      const user = {
        id: 'user-123',
        email: 'reset@example.com',
        emailVerified: true,
      };
      prisma.user.findUnique.mockResolvedValueOnce(user);

      await authService.forgotPassword('reset@example.com');

      expect(emailQueue.add).toHaveBeenCalledWith(
        'password-reset-email',
        expect.objectContaining({
          type: 'password-reset',
          to: user.email,
          token: expect.any(String),
        }),
        expect.objectContaining({
          attempts: 5,
          backoff: expect.any(Object),
        }),
      );
    });
  });

  describe('resendVerificationEmail', () => {
    it('should return no-verification-required message', async () => {
      const result = await authService.resendVerificationEmail('user@example.com');
      expect(result.message).toContain('no longer required');
    });
  });

  describe('login', () => {
    it('should issue tokens for verified user with correct password', async () => {
      const user = {
        id: 'user-123',
        email: 'login@example.com',
        passwordHash: 'hashed',
        role: 'STUDENT',
        emailVerified: true,
      };
      prisma.user.findUnique.mockResolvedValueOnce(user);
      mockArgonVerify.mockResolvedValue(true);

      const result = await authService.login({
        email: 'login@example.com',
        password: 'SuperSecure123!',
      });

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(prisma.refreshToken.create).toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('should verify email and delete tokens', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValueOnce({
        id: 'token-id',
        tokenHash: 'abc123',
        userId: 'user-id',
        expiresAt: new Date(Date.now() + 3600000),
        user: { id: 'user-id', email: 'test@example.com' },
      });

      const result = await authService.verifyEmail('any-token');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { emailVerified: true },
      });
      expect(prisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-id' },
      });
      expect(result.message).toBe('Email verified successfully');
    });

    it('should reject invalid token', async () => {
      prisma.emailVerificationToken.findFirst.mockResolvedValueOnce(null);

      await expect(authService.verifyEmail('invalid')).rejects.toThrow(
        'Invalid or expired verification token',
      );
    });
  });
});
