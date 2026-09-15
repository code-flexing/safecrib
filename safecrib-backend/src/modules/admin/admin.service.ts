import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TrustService } from '../trust/trust.service.js';
import type { OnboardAgentDto } from './dto/admin.dto.js';
import type { IdentityVerificationDto } from './dto/admin.dto.js';
import type { Role } from '../../common/roles.decorator.js';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trustService: TrustService,
  ) {}

  async onboardAgent(dto: OnboardAgentDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 8192,
      parallelism: 2,
    });

    const role: Role = dto.role ?? 'AGENT';

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email.toLowerCase().trim(),
          passwordHash,
          displayName: dto.displayName ?? null,
          role,
          emailVerified: true,
          identityVerified: true,
        },
      });

      await tx.trustEvent.create({
        data: {
          userId: created.id,
          eventType: 'IDENTITY_VERIFIED',
          weight: 15,
        },
      });

      return created;
    });

    await this.trustService.recordTrustEvent(
      user.id,
      'IDENTITY_VERIFIED',
      15,
    );

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      message: 'Agent onboarded successfully with manual verification',
    };
  }

  async verifyIdentity(dto: IdentityVerificationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: dto.userId },
        data: {
          identityVerified: true,
        },
      });

      await tx.trustEvent.create({
        data: {
          userId: dto.userId,
          eventType: 'IDENTITY_VERIFIED',
          weight: 15,
          payload: {
            idDocumentNumber: dto.idDocumentNumber,
            idDocumentPhotoUrl: dto.idDocumentPhotoUrl,
            verifiedBy: dto.userId,
          },
        },
      });
    });

    return { message: 'Identity verified successfully' };
  }

  async flagListing(listingId: string, _adminId: string, _reason: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, ownerId: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: 'FLAGGED' },
    });

    return { message: 'Listing flagged', listingId };
  }

  async getAllUsers(skip = 0, take = 50, role?: string) {
    const where: any = {};
    if (role) {
      where.role = role;
    }

    return this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        emailVerified: true,
        identityVerified: true,
        trustScore: true,
        createdAt: true,
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUserDetail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        listings: {
          select: { id: true, title: true, price: true, status: true, createdAt: true },
        },
        trustEvents: {
          select: { id: true, eventType: true, weight: true, occurredAt: true },
          orderBy: { occurredAt: 'desc' },
        },
        _count: {
          select: {
            listings: true,
            bookings: true,
            trustEvents: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
