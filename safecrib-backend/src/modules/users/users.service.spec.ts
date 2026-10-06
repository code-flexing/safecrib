import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { UserService } from './users.service.js';

describe('UserService.getProfile', () => {
  it('does not show a verification badge before admin approval, even with a stored badge', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'pending-agent',
      email: 'agent@example.com',
      displayName: 'Amina',
      profilePicture: null,
      role: 'AGENT',
      emailVerified: true,
      identityVerified: true,
      trustScore: 95,
      trustScoreUpdatedAt: new Date('2026-02-01'),
      createdAt: new Date('2026-01-01'),
      verification: {
        stage: 'AGENT_VERIFIED',
        badge: 'BLUE_SHIELD',
        badgeColor: 'blue',
        riskBlocked: false,
      },
      providerPage: { verificationState: 'PENDING' },
      studentProfile: null,
      _count: { followers: 20 },
    });
    const service = new UserService({ user: { findUnique } } as unknown as PrismaService);

    const result = await service.getProfile('pending-agent');

    expect(result.verification.isVerified).toBe(false);
    expect(result.verification.eligible).toBe(false);
  });
});

describe('UserService.getPublicProfile', () => {
  it('returns only verified provider data and approved listings', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'user-id',
      displayName: 'Amina',
      profilePicture: null,
      role: 'AGENT',
      identityVerified: true,
      createdAt: new Date('2026-01-01'),
      _count: { followers: 0, recommendationsReceived: 0 },
      studentProfile: null,
      providerPage: {
        id: 'provider-page-id',
        displayName: 'Amina Homes',
        description: 'Homes near campus',
        providerType: 'AGENT',
        businessName: 'Amina Homes Ltd',
        profilePicture: 'avatar-id',
        verificationState: 'VERIFIED',
        verifiedAt: new Date('2026-02-01'),
        socialLinks: { website: 'https://example.com' },
        _count: { followers: 0 },
        listings: [{ id: 'listing-id', title: 'Campus apartment', _count: { likes: 0, views: 0 } }],
      },
    });
    const service = new UserService({ user: { findUnique } } as unknown as PrismaService);

    const result = await service.getPublicProfile('user-id');
    const select = findUnique.mock.calls[0][0].select;

    expect(result.isVerified).toBe(true);
    expect(result.profilePicture).toBe('avatar-id');
    expect(result.provider?.displayName).toBe('Amina Homes');
    expect(result.listings).toHaveLength(1);
    expect(select.email).toBeUndefined();
    expect(select.providerPage.select.phone).toBeUndefined();
    expect(select.providerPage.select.payoutAccounts).toBeUndefined();
    expect(select.providerPage.select.proofOfLicense).toBeUndefined();
    expect(select.providerPage.select.listings.where.status.in).toEqual(['VERIFIED', 'ACTIVE']);
  });

  it('does not expose profiles before student or provider verification', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'unverified-id',
      role: 'UNVERIFIED',
      studentProfile: null,
      providerPage: null,
    });
    const service = new UserService({ user: { findUnique } } as unknown as PrismaService);

    await expect(service.getPublicProfile('unverified-id')).rejects.toBeInstanceOf(NotFoundException);
  });
});