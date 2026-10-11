import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { UserService } from '../users/users.service.js';
import { ListingsService } from '../listings/listings.service.js';
import type { JobQueueClient } from '../../infra/queue/queue.service.js';
import type { TrustService } from '../trust/trust.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { AdminService } from '../admin/admin.service.js';

function makeBaseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    displayName: 'Test User',
    username: 'testuser',
    profilePicture: 'photo-id',
    role: 'STUDENT',
    emailVerified: true,
    identityVerified: true,
    trustScore: 50,
    trustScoreUpdatedAt: new Date(),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    verification: {
      stage: 'PROFILE_VERIFIED',
      badge: 'GREEN_CHECK',
      badgeColor: 'green',
      riskBlocked: false,
    },
    providerPage: null,
    studentProfile: { status: 'APPROVED', profilePicture: null, shortBio: null, longBio: null },
    _count: { followers: 5 },
    ...overrides,
  };
}

describe('verification.kind on user-facing payloads', () => {
  describe('UserService.getProfile', () => {
    it('includes kind="student" for approved student profile', async () => {
      const findUnique = vi.fn().mockResolvedValue(
        makeBaseUser({ role: 'STUDENT', identityVerified: true, studentProfile: { status: 'APPROVED', profilePicture: null, shortBio: null, longBio: null } }),
      );
      const service = new UserService({ user: { findUnique } } as unknown as PrismaService);

      const result = await service.getProfile('user-1');

      expect(result.verification.kind).toBe('student');
    });

    it('includes kind="agent" for verified agent with provider page', async () => {
      const findUnique = vi.fn().mockResolvedValue(
        makeBaseUser({
          role: 'AGENT',
          identityVerified: true,
          providerPage: { verificationState: 'VERIFIED' },
          studentProfile: null,
        }),
      );
      const service = new UserService({ user: { findUnique } } as unknown as PrismaService);

      const result = await service.getProfile('user-1');

      expect(result.verification.kind).toBe('agent');
    });

    it('includes kind="landlord" for verified landlord with provider page', async () => {
      const findUnique = vi.fn().mockResolvedValue(
        makeBaseUser({
          role: 'LANDLORD',
          identityVerified: true,
          providerPage: { verificationState: 'VERIFIED' },
          studentProfile: null,
        }),
      );
      const service = new UserService({ user: { findUnique } } as unknown as PrismaService);

      const result = await service.getProfile('user-1');

      expect(result.verification.kind).toBe('landlord');
    });

    it('includes kind="staff" for admin role', async () => {
      const findUnique = vi.fn().mockResolvedValue(
        makeBaseUser({ role: 'ADMIN', identityVerified: true }),
      );
      const service = new UserService({ user: { findUnique } } as unknown as PrismaService);

      const result = await service.getProfile('user-1');

      expect(result.verification.kind).toBe('staff');
    });

    it('includes kind=null for unverified student', async () => {
      const findUnique = vi.fn().mockResolvedValue(
        makeBaseUser({
          role: 'STUDENT',
          identityVerified: false,
          studentProfile: { status: 'PENDING', profilePicture: null, shortBio: null, longBio: null },
        }),
      );
      const service = new UserService({ user: { findUnique } } as unknown as PrismaService);

      const result = await service.getProfile('user-1');

      expect(result.verification.kind).toBe(null);
    });
  });

  describe('UserService.getPublicProfile', () => {
    it('includes kind="student" for approved student', async () => {
      const findUnique = vi.fn().mockResolvedValue(
        makeBaseUser({
          role: 'STUDENT',
          identityVerified: true,
          studentProfile: { status: 'APPROVED', profilePicture: null, shortBio: null, longBio: null },
        }),
      );
      const service = new UserService({ user: { findUnique } } as unknown as PrismaService);

      const result = await service.getPublicProfile('user-1');

      expect(result.verification.kind).toBe('student');
    });

    it('includes kind="agent" for verified provider', async () => {
      const findUnique = vi.fn().mockResolvedValue(
        makeBaseUser({
          role: 'AGENT',
          identityVerified: true,
          providerPage: {
            id: 'page-1',
            displayName: 'Test Agent',
            description: '',
            shortBio: '',
            longBio: '',
            providerType: 'AGENT',
            businessName: '',
            profilePicture: null,
            verificationState: 'VERIFIED',
            verifiedAt: new Date(),
            socialLinks: {},
            _count: { followers: 0 },
            listings: [],
          },
        }),
      );
      const service = new UserService({ user: { findUnique } } as unknown as PrismaService);

      const result = await service.getPublicProfile('user-1');

      expect(result.verification.kind).toBe('agent');
    });
  });

  describe('UserService.discoverPeople', () => {
    it('includes kind="student" on discovered users', async () => {
      const findMany = vi.fn().mockResolvedValue([
        makeBaseUser({
          id: 'user-1',
          role: 'STUDENT',
          identityVerified: true,
          studentProfile: { status: 'APPROVED', schoolOfStudy: 'Engineering', profilePicture: null, shortBio: null },
          followers: [],
        }),
      ]);
      const providerPageFindMany = vi.fn().mockResolvedValue([]);
      const prisma = {
        user: { findMany: findMany },
        providerPage: { findMany: providerPageFindMany },
      } as unknown as PrismaService;
      const service = new UserService(prisma);

      const result = await service.discoverPeople('campus', 'viewer-1');

      expect(result.users[0].verification.kind).toBe('student');
    });

    it('includes kind="agent" on discovered provider users', async () => {
      const findMany = vi.fn().mockResolvedValue([
        makeBaseUser({
          id: 'user-1',
          role: 'AGENT',
          identityVerified: true,
          providerPage: { verificationState: 'VERIFIED', shortBio: '' },
          studentProfile: null,
          followers: [],
        }),
      ]);
      const providerPageFindMany = vi.fn().mockResolvedValue([]);
      const prisma = {
        user: { findMany: findMany },
        providerPage: { findMany: providerPageFindMany },
      } as unknown as PrismaService;
      const service = new UserService(prisma);

      const result = await service.discoverPeople('agent', 'viewer-1');

      expect(result.users[0].verification.kind).toBe('agent');
    });
  });

  describe('UserService.getUserByUsername', () => {
    it('includes kind="student" when looking up by username', async () => {
      const findFirst = vi.fn().mockResolvedValue(
        makeBaseUser({ role: 'STUDENT', identityVerified: true, studentProfile: { status: 'APPROVED', profilePicture: null, shortBio: null, longBio: null } }),
      );
      const service = new UserService({ user: { findFirst } } as unknown as PrismaService);

      const result = await service.getUserByUsername('testuser');

      expect(result).not.toBeNull();
      expect(result!.verification.kind).toBe('student');
    });

    it('includes kind="landlord" for verified landlord', async () => {
      const findFirst = vi.fn().mockResolvedValue(
        makeBaseUser({
          role: 'LANDLORD',
          identityVerified: true,
          providerPage: { verificationState: 'VERIFIED' },
          studentProfile: null,
        }),
      );
      const service = new UserService({ user: { findFirst } } as unknown as PrismaService);

      const result = await service.getUserByUsername('landlord_123');

      expect(result).not.toBeNull();
      expect(result!.verification.kind).toBe('landlord');
    });
  });

  describe('ListingsService.getListingComments', () => {
    it('includes kind on comment users via withPublicVerification', async () => {
      const listingFindUnique = vi.fn().mockResolvedValue({ id: 'listing-1', status: 'VERIFIED' });
      const commentFindMany = vi.fn().mockResolvedValue([
        {
          id: 'comment-1',
          body: 'Nice place!',
          parentId: null,
          createdAt: new Date(),
          user: makeBaseUser({
            role: 'STUDENT',
            identityVerified: true,
            studentProfile: { status: 'APPROVED', profilePicture: null, shortBio: null },
            providerPage: null,
            verification: { stage: 'PROFILE_VERIFIED', badge: 'GREEN_CHECK', badgeColor: 'green', riskBlocked: false },
          }),
          _count: { likes: 0 },
        },
      ]);
      const prisma = {
        listing: { findUnique: listingFindUnique, findMany: vi.fn(), update: vi.fn() },
        listingComment: { findMany: commentFindMany, create: vi.fn() },
      } as unknown as PrismaService;
      const providerPages = { requireVerifiedPage: vi.fn() } as never;
      const mediaService = { getAccessUrl: vi.fn(), deleteMedia: vi.fn() } as never;
      const notifications = { enqueue: vi.fn(), enqueueAdmins: vi.fn() } as never;
      const queue = { add: vi.fn() } as never;
      const service = new ListingsService(prisma, queue, providerPages, mediaService, notifications);

      const result = await service.getListingComments('listing-1');

      expect(result[0].user.verification.kind).toBe('student');
    });
  });

  describe('AdminService.getAllUsers', () => {
    function makeAdminService(findMany: ReturnType<typeof vi.fn>) {
      const count = vi.fn().mockResolvedValue(1);
      const prisma = { user: { findMany, count } } as unknown as PrismaService;
      const trustService = {} as TrustService;
      const emailQueue = { add: vi.fn() } as unknown as JobQueueClient;
      const notifications = {} as NotificationsService;
      return new AdminService(prisma, trustService, emailQueue, notifications);
    }

    it('includes kind="student" for approved student', async () => {
      const findMany = vi.fn().mockResolvedValue([
        makeBaseUser({ role: 'STUDENT', identityVerified: true, studentProfile: { status: 'APPROVED' } }),
      ]);
      const service = makeAdminService(findMany);

      const result = await service.getAllUsers({});

      expect(result.items[0].verification.kind).toBe('student');
    });

    it('includes kind="agent" for verified agent', async () => {
      const findMany = vi.fn().mockResolvedValue([
        makeBaseUser({ role: 'AGENT', identityVerified: true, providerPage: { verificationState: 'VERIFIED' } }),
      ]);
      const service = makeAdminService(findMany);

      const result = await service.getAllUsers({});

      expect(result.items[0].verification.kind).toBe('agent');
    });

    it('includes kind="staff" for admin', async () => {
      const findMany = vi.fn().mockResolvedValue([
        makeBaseUser({ role: 'ADMIN', identityVerified: true }),
      ]);
      const service = makeAdminService(findMany);

      const result = await service.getAllUsers({});

      expect(result.items[0].verification.kind).toBe('staff');
    });

    it('includes kind=null for unverified user', async () => {
      const findMany = vi.fn().mockResolvedValue([
        makeBaseUser({ role: 'STUDENT', identityVerified: false, studentProfile: { status: 'PENDING' } }),
      ]);
      const service = makeAdminService(findMany);

      const result = await service.getAllUsers({});

      expect(result.items[0].verification.kind).toBe(null);
    });
  });

  describe('ListingsService.toResponse owner verification.kind', () => {
    it('includes kind="staff" on listing owner for admin', async () => {
      const listingFindUnique = vi.fn().mockResolvedValue({
        id: 'listing-1',
        ownerId: 'owner-1',
        title: 'Near campus room',
        description: null,
        price: 50000,
        discountAmount: null,
        lat: 9.0765,
        lng: 7.3986,
        campus: null,
        address: '123 Campus Road',
        locationReference: null,
        status: 'VERIFIED',
        createdAt: new Date(),
        updatedAt: new Date(),
        photos: [],
        video: null,
        bookings: [],
        owner: makeBaseUser({ id: 'owner-1', role: 'ADMIN', identityVerified: true, studentProfile: null }),
        providerPage: null,
        _count: { likes: 0, views: 0, comments: 0, bookmarks: 0 },
      } as never);

      const prisma = {
        listing: { findUnique: listingFindUnique, findMany: vi.fn(), update: vi.fn() },
        listingComment: { findMany: vi.fn(), create: vi.fn() },
        user: { findMany: vi.fn().mockResolvedValue([]) },
        providerActivityDay: { groupBy: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaService;
      const providerPages = { requireVerifiedPage: vi.fn() } as never;
      const mediaService = { getAccessUrl: vi.fn(), deleteMedia: vi.fn() } as never;
      const notifications = { enqueue: vi.fn(), enqueueAdmins: vi.fn() } as never;
      const queue = { add: vi.fn() } as never;
      const service = new ListingsService(prisma, queue, providerPages, mediaService, notifications);

      const result = await service.getListing('listing-1');

      expect(result.owner?.verification.kind).toBe('staff');
    });

    it('includes kind="agent" on listing owner for verified agent', async () => {
      const listingFindUnique = vi.fn().mockResolvedValue({
        id: 'listing-1',
        ownerId: 'owner-1',
        title: 'Near campus room',
        description: null,
        price: 50000,
        discountAmount: null,
        lat: 9.0765,
        lng: 7.3986,
        campus: null,
        address: '123 Campus Road',
        locationReference: null,
        status: 'VERIFIED',
        createdAt: new Date(),
        updatedAt: new Date(),
        photos: [],
        video: null,
        bookings: [],
        owner: makeBaseUser({
          id: 'owner-1',
          role: 'AGENT',
          identityVerified: true,
          providerPage: { verificationState: 'VERIFIED' },
          studentProfile: null,
        }),
        providerPage: null,
        _count: { likes: 0, views: 0, comments: 0, bookmarks: 0 },
      } as never);

      const prisma = {
        listing: { findUnique: listingFindUnique, findMany: vi.fn(), update: vi.fn() },
        listingComment: { findMany: vi.fn(), create: vi.fn() },
        user: { findMany: vi.fn().mockResolvedValue([]) },
        providerActivityDay: { groupBy: vi.fn().mockResolvedValue([]) },
      } as unknown as PrismaService;
      const providerPages = { requireVerifiedPage: vi.fn() } as never;
      const mediaService = { getAccessUrl: vi.fn(), deleteMedia: vi.fn() } as never;
      const notifications = { enqueue: vi.fn(), enqueueAdmins: vi.fn() } as never;
      const queue = { add: vi.fn() } as never;
      const service = new ListingsService(prisma, queue, providerPages, mediaService, notifications);

      const result = await service.getListing('listing-1');

      expect(result.owner?.verification.kind).toBe('agent');
    });
  });
});
