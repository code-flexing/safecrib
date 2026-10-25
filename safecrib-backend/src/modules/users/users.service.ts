import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { computeUserVerificationStage } from '../trust/trust.service.js';
import type { UpdateUserDto } from './dto/user.dto.js';
import type { ChangePasswordDto } from './dto/user.dto.js';
import type { Role } from '../../common/roles.decorator.js';
import { normaliseDisplayName, isBlockedDisplayName } from '../../common/username.utils.js';
import { getPublicVerification } from '../../common/verification/public-verification.js';


export class UserService {
  private readonly logger = new Logger(UserService.name);
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        username: true,
        profilePicture: true,
        role: true,
        emailVerified: true,
        identityVerified: true,
        trustScore: true,
        trustScoreUpdatedAt: true,
        createdAt: true,
        updatedAt: true,
        verification: {
          select: {
            stage: true,
            badge: true,
            badgeColor: true,
            riskBlocked: true,
          },
        },
        providerPage: {
          select: {
            verificationState: true,
          },
        },
        studentProfile: {
          select: {
            status: true,
          },
        },
        _count: { select: { followers: true } },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { studentProfile, _count, ...rest } = user;
    const verificationStage = computeUserVerificationStage({
      userId: user.id,
      role: user.role,
      identityVerified: user.identityVerified,
      trustScore: user.trustScore ?? 0,
      providerPageVerified: user.providerPage?.verificationState === 'VERIFIED',
      studentProfileApproved: studentProfile?.status === 'APPROVED',
      followerCount: _count.followers,
      confirmedFraudCount: 0,
      recentFraudCount: 0,
      flaggedForReview: false,
    });
    const adminApproved =
      (user.role === 'STUDENT' && studentProfile?.status === 'APPROVED') ||
      (['AGENT', 'LANDLORD'].includes(user.role) && user.providerPage?.verificationState === 'VERIFIED') ||
      user.role === 'ADMIN';

    const normalizedVerification = user.verification ?? {
      stage: verificationStage.stage,
      badge: verificationStage.badge,
      badgeColor: verificationStage.badgeColor,
      riskBlocked: false,
      eligible: true,
    };

    return {
      ...rest,
      studentProfileStatus: studentProfile?.status ?? 'NOT_SUBMITTED',
      followerCount: _count.followers,
      verification: {
        isVerified: adminApproved && verificationStage.eligible,
        stage: normalizedVerification.stage,
        badge: normalizedVerification.badge,
        badgeColor: normalizedVerification.badgeColor,
        riskBlocked: normalizedVerification.riskBlocked,
        eligible: adminApproved && verificationStage.eligible,
        kind: getPublicVerification({
          role: user.role as Role,
          identityVerified: user.identityVerified,
          studentProfileApproved: studentProfile?.status === 'APPROVED',
          providerPageVerified: user.providerPage?.verificationState === 'VERIFIED',
          riskBlocked: normalizedVerification.riskBlocked,
        }).kind,
      },
      verificationStage,
    };
  }

  async updateProfile(userId: string, dto: UpdateUserDto) {
    // The username is system-generated and immutable. Ignore any attempt to change it.
    if (dto.username !== undefined && dto.username !== null && String(dto.username).trim() !== '') {
      throw new BadRequestException('Your username is created automatically and cannot be changed.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.role && dto.role !== user.role && user.role !== 'ADMIN') {
      throw new BadRequestException('Cannot change own role');
    }

    let displayName: string | null | undefined = undefined;
    if (dto.displayName !== undefined) {
      displayName = normaliseDisplayName(dto.displayName);
      if (displayName === null) {
        throw new BadRequestException(
          'Display name must be 2-50 characters, contain no control characters or HTML, and may include emojis.',
        );
      }
      if (!user.role || user.role !== 'ADMIN') {
        if (isBlockedDisplayName(displayName)) {
          throw new ForbiddenException('That display name is not allowed.');
        }
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: displayName ?? undefined,
        profilePicture: dto.profilePicture ?? undefined,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        username: true,
        profilePicture: true,
        role: true,
        emailVerified: true,
        identityVerified: true,
        trustScore: true,
        createdAt: true,
      },
    });

    return updated;
  }

  async getPublicProfile(userId: string, viewerId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        username: true,
        profilePicture: true,
        role: true,
        identityVerified: true,
        createdAt: true,
        verification: {
          select: {
            stage: true,
            badge: true,
            badgeColor: true,
            riskBlocked: true,
          },
        },
        studentProfile: {
          select: { status: true, profilePicture: true, shortBio: true, longBio: true },
        },
        _count: { select: { followers: true, recommendationsReceived: true } },
        followers: viewerId ? {
          where: { followerId: viewerId },
          select: { followerId: true },
          take: 1,
        } : false,
        providerPage: {
          select: {
            id: true,
            displayName: true,
            description: true,
            shortBio: true,
            longBio: true,
            providerType: true,
            businessName: true,
            profilePicture: true,
            verificationState: true,
            _count: { select: { followers: true } },
            followers: viewerId ? {
              where: { followerId: viewerId },
              select: { followerId: true },
              take: 1,
            } : false,
            verifiedAt: true,
            socialLinks: true,
            listings: {
              where: { status: { in: ['VERIFIED', 'ACTIVE'] } },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                title: true,
                description: true,
                price: true,
                discountAmount: true,
                campus: true,
                address: true,
                createdAt: true,
                photos: { select: { id: true, url: true } },
                _count: { select: { likes: true, views: true } },
              },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('Public profile unavailable');
    const providerVerified =
      ['AGENT', 'LANDLORD'].includes(user.role) &&
      user.providerPage?.verificationState === 'VERIFIED';
    const studentVerified =
      user.role === 'STUDENT' && user.studentProfile?.status === 'APPROVED';
    if (!providerVerified && !studentVerified) {
      throw new NotFoundException('Public profile unavailable');
    }

    const providerPage = providerVerified ? user.providerPage : null;
    const computedVerification = user.verification ?? {
      stage: providerVerified ? 'AGENT_VERIFIED' : 'PROFILE_VERIFIED',
      badge: providerVerified ? 'BLUE_SHIELD' : 'GREEN_CHECK',
      badgeColor: providerVerified ? 'blue' : 'green',
      riskBlocked: false,
      eligible: true,
    };

    const verification = user.verification
      ? {
          isVerified: true,
          stage: user.verification.stage,
          badge: user.verification.badge,
          badgeColor: user.verification.badgeColor,
          riskBlocked: user.verification.riskBlocked,
          eligible: true,
        }
      : {
          isVerified: true,
          stage: computedVerification.stage,
          badge: computedVerification.badge,
          badgeColor: computedVerification.badgeColor,
          riskBlocked: computedVerification.riskBlocked,
          eligible: true,
        };

    return {
      id: user.id,
      username: user.username,
      isVerified: verification.isVerified,
      verification: {
        isVerified: true,
        stage: verification.stage,
        badge: verification.badge,
        badgeColor: verification.badgeColor,
        riskBlocked: verification.riskBlocked,
        eligible: true,
        kind: getPublicVerification({
          role: user.role as Role,
          identityVerified: user.identityVerified,
          studentProfileApproved: studentVerified,
          providerPageVerified: providerVerified,
          riskBlocked: user.verification?.riskBlocked ?? computedVerification.riskBlocked,
        }).kind,
      },
      displayName: providerPage?.displayName ?? user.displayName,
      role: user.role,
      createdAt: user.createdAt,
      identityVerified: user.identityVerified,
      followerCount: user._count.followers,
      isFollowingUser: Boolean(user.followers?.length),
      providerPageId: providerPage?.id ?? null,
      providerPageProfilePicture: providerPage?.profilePicture ?? null,
      isFollowingPage: Boolean(providerPage?.followers?.length),
      providerPageFollowerCount: providerPage?._count.followers ?? 0,
      publicEngagement: providerPage
        ? {
            recommendationCount: user._count.recommendationsReceived,
            likeCount: providerPage.listings.reduce((sum, listing) => sum + listing._count.likes, 0),
          }
        : null,
      profilePicture:
        user.profilePicture ??
        providerPage?.profilePicture ??
        (studentVerified ? user.studentProfile?.profilePicture : null),
      shortBio: providerPage?.shortBio ?? (studentVerified ? user.studentProfile?.shortBio : null),
      longBio: providerPage?.longBio ?? providerPage?.description ?? (studentVerified ? user.studentProfile?.longBio : null),
      provider: providerPage
        ? {
            displayName: providerPage.displayName,
            description: providerPage.description,
            shortBio: providerPage.shortBio,
            longBio: providerPage.longBio ?? providerPage.description,
            providerType: providerPage.providerType,
            businessName: providerPage.businessName,
            verifiedAt: providerPage.verifiedAt,
            socialLinks: providerPage.socialLinks,
          }
        : null,
      listings: providerPage?.listings.map(({ _count, ...listing }) => ({
        ...listing,
        likeCount: _count.likes,
        viewCount: _count.views,
      })) ?? [],
    };
  }

  async discoverPeople(query: string, currentUserId: string) {
    const search = query.trim().slice(0, 80);
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: [
          { role: 'STUDENT', studentProfile: { status: 'APPROVED' } },
          { role: { in: ['AGENT', 'LANDLORD'] }, providerPage: { verificationState: 'VERIFIED' } },
        ],
        ...(search ? {
          AND: [{
            OR: [
              { displayName: { contains: search, mode: 'insensitive' } },
              { username: { contains: search, mode: 'insensitive' } },
              { studentProfile: { schoolOfStudy: { contains: search, mode: 'insensitive' } } },
              { providerPage: { displayName: { contains: search, mode: 'insensitive' } } },
            ],
          }],
        } : {}),
      },
      take: 40,
      orderBy: { displayName: 'asc' },
      select: {
        id: true,
        displayName: true,
        username: true,
        profilePicture: true,
        role: true,
        identityVerified: true,
        studentProfile: { select: { status: true, schoolOfStudy: true, shortBio: true } },
        providerPage: { select: { verificationState: true, shortBio: true } },
        verification: { select: { riskBlocked: true, identityVerified: true, providerVerified: true, studentProfileApproved: true } },
        _count: { select: { followers: true } },
        followers: { where: { followerId: currentUserId }, select: { followerId: true }, take: 1 },
      },
    });
    const pages = await this.prisma.providerPage.findMany({
      where: {
        verificationState: 'VERIFIED',
        ownerId: { not: currentUserId },
        ...(search ? { displayName: { contains: search, mode: 'insensitive' } } : {}),
      },
      take: 40,
      orderBy: { displayName: 'asc' },
      select: {
        id: true,
        ownerId: true,
        displayName: true,
        profilePicture: true,
        providerType: true,
        shortBio: true,
        _count: { select: { followers: true } },
        followers: { where: { followerId: currentUserId }, select: { followerId: true }, take: 1 },
      },
    });
    return {
  users: users.map(({ _count, followers, studentProfile, providerPage, verification, identityVerified, ...user }) => ({
        ...user,
        isVerified: true,
        identityVerified,
        school: studentProfile?.schoolOfStudy ?? null,
        shortBio: providerPage?.shortBio ?? studentProfile?.shortBio ?? null,
        followerCount: _count.followers,
        isFollowing: followers.length > 0,
        verification: {
          kind: getPublicVerification({
            role: user.role as Role,
            identityVerified: identityVerified ?? false,
            studentProfileApproved: studentProfile?.status === 'APPROVED',
            providerPageVerified: providerPage?.verificationState === 'VERIFIED',
            riskBlocked: verification?.riskBlocked ?? false,
          }).kind,
        },
      })),
      pages: pages.map(({ _count, followers, ...page }) => ({
        ...page,
        isVerified: true,
        followerCount: _count.followers,
        isFollowing: followers.length > 0,
      })),
    };
  }

  /**
   * Case-insensitive lookup of a user by their username handle (with or without the leading '@').
   * Returns the public-safe subset of fields, or null when not found.
   */
  async getUserByUsername(rawUsername: string | null | undefined) {
    const username = String(rawUsername ?? '').trim().replace(/^@+/, '').toLowerCase();
    if (!username) return null;
    const user = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
      select: {
        id: true,
        displayName: true,
        username: true,
        profilePicture: true,
        role: true,
        identityVerified: true,
        createdAt: true,
        verification: {
          select: { stage: true, badge: true, badgeColor: true, riskBlocked: true },
        },
        studentProfile: { select: { status: true } },
        providerPage: { select: { verificationState: true } },
        _count: { select: { followers: true } },
      },
    });
    if (!user) return null;
    const providerVerified =
      ['AGENT', 'LANDLORD'].includes(user.role) &&
      user.providerPage?.verificationState === 'VERIFIED';
    const studentVerified = user.role === 'STUDENT' && user.studentProfile?.status === 'APPROVED';
    if (!providerVerified && !studentVerified) return null;
    return {
      id: user.id,
      displayName: user.displayName,
      username: user.username,
      profilePicture: user.profilePicture,
      role: user.role,
      createdAt: user.createdAt,
      identityVerified: user.identityVerified,
      followerCount: user._count.followers,
      verification: getPublicVerification({
        role: user.role as Role,
        identityVerified: user.identityVerified,
        studentProfileApproved: user.studentProfile?.status === 'APPROVED',
        providerPageVerified: user.providerPage?.verificationState === 'VERIFIED',
        riskBlocked: user.verification?.riskBlocked ?? false,
      }),
    };
  }

  async followUser(followerId: string, followedId: string) {
    if (followerId === followedId) throw new BadRequestException('You cannot follow yourself');
    const target = await this.prisma.user.findUnique({
      where: { id: followedId },
      select: { id: true, role: true, studentProfile: { select: { status: true } }, providerPage: { select: { verificationState: true } } },
    });
    if (!target || !(target.role === 'STUDENT' && target.studentProfile?.status === 'APPROVED') &&
      !(['AGENT', 'LANDLORD'].includes(target.role) && target.providerPage?.verificationState === 'VERIFIED')) {
      throw new NotFoundException('User profile unavailable');
    }
    const [follow] = await this.prisma.$transaction([
      this.prisma.userFollow.upsert({
        where: { followerId_followedId: { followerId, followedId } },
        create: { followerId, followedId },
        update: {},
      }),
      this.prisma.user.update({
        where: { id: followedId },
        data: { followerCount: { increment: 1 } },
      }),
      this.prisma.user.update({
        where: { id: followerId },
        data: { followingCount: { increment: 1 } },
      }),
    ]);
    const [followersCount, followingCount] = await Promise.all([
      this.prisma.userFollow.count({ where: { followedId } }),
      this.prisma.userFollow.count({ where: { followerId } }),
    ]);
    return { following: true, followersCount, followingCount };
  }

  async unfollowUser(followerId: string, followedId: string) {
    await this.prisma.$transaction([
      this.prisma.userFollow.deleteMany({ where: { followerId, followedId } }),
      this.prisma.user.update({
        where: { id: followedId },
        data: { followerCount: { decrement: 1 } },
      }),
      this.prisma.user.update({
        where: { id: followerId },
        data: { followingCount: { decrement: 1 } },
      }),
    ]);
    const [followersCount, followingCount] = await Promise.all([
      this.prisma.userFollow.count({ where: { followedId } }),
      this.prisma.userFollow.count({ where: { followerId } }),
    ]);
    return { following: false, followersCount, followingCount };
  }

  async followPage(followerId: string, pageId: string) {
    const page = await this.prisma.providerPage.findUnique({
      where: { id: pageId },
      select: { id: true, ownerId: true, verificationState: true },
    });
    if (!page || page.verificationState !== 'VERIFIED') throw new NotFoundException('Provider page unavailable');
    if (page.ownerId === followerId) throw new BadRequestException('You cannot follow your own page');
    await this.prisma.$transaction([
      this.prisma.pageFollow.upsert({
        where: { followerId_pageId: { followerId, pageId } },
        create: { followerId, pageId },
        update: {},
      }),
      this.prisma.providerPage.update({
        where: { id: pageId },
        data: { followerCount: { increment: 1 } },
      }),
      this.prisma.user.update({
        where: { id: followerId },
        data: { followingCount: { increment: 1 } },
      }),
    ]);
    const [pageFollowersCount, pageFollowingCount, userFollowingCount] = await Promise.all([
      this.prisma.pageFollow.count({ where: { pageId } }),
      this.prisma.pageFollow.count({ where: { followerId } }),
      this.prisma.userFollow.count({ where: { followerId } }),
    ]);
    return { following: true, followersCount: pageFollowersCount, followingCount: pageFollowingCount + userFollowingCount };
  }

  async unfollowPage(followerId: string, pageId: string) {
    await this.prisma.$transaction([
      this.prisma.pageFollow.deleteMany({ where: { followerId, pageId } }),
      this.prisma.providerPage.update({
        where: { id: pageId },
        data: { followerCount: { decrement: 1 } },
      }),
      this.prisma.user.update({
        where: { id: followerId },
        data: { followingCount: { decrement: 1 } },
      }),
    ]);
    const [pageFollowersCount, pageFollowingCount, userFollowingCount] = await Promise.all([
      this.prisma.pageFollow.count({ where: { pageId } }),
      this.prisma.pageFollow.count({ where: { followerId } }),
      this.prisma.userFollow.count({ where: { followerId } }),
    ]);
    return { following: false, followersCount: pageFollowersCount, followingCount: pageFollowingCount + userFollowingCount };
  }

  async getStudentEngagementStats(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || user.role !== 'STUDENT') throw new ForbiddenException('Student activity is private');
    const [likes, comments, recommendations, userFollows, pageFollows] = await Promise.all([
      this.prisma.listingLike.count({ where: { userId } }),
      this.prisma.listingComment.count({ where: { userId } }),
      this.prisma.providerRecommendation.count({ where: { recommenderId: userId } }),
      this.prisma.userFollow.count({ where: { followerId: userId } }),
      this.prisma.pageFollow.count({ where: { followerId: userId } }),
    ]);
    return {
      likes,
      comments,
      recommendations,
      follows: userFollows + pageFollows,
      totalInteractions: likes + comments + recommendations,
    };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const valid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 8192,
      parallelism: 2,
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Password changed successfully' };
  }

  async setUserRole(userId: string, role: Role) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        role: true,
      },
    });
  }
  async getMyPayments(userId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { userId },
      include: {
        booking: { select: { id: true, listingId: true } },
        listing: { select: { id: true, title: true } },
        receipt: { select: { id: true, receiptNumber: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return payments.map((p) => ({
      id: p.id,
      bookingId: p.bookingId,
      listingId: p.listingId,
      listingTitle: p.listing?.title ?? null,
      amountMinor: p.amountMinor,
      currency: p.currency,
      status: p.status,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
      receiptId: p.receipt?.id ?? null,
      receiptNumber: p.receipt?.receiptNumber ?? null,
    }));
  }
}