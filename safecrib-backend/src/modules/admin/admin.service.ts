import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { EMAIL_QUEUE } from '../../infra/queue/queue.constants.js';
import { TrustService } from '../trust/trust.service.js';
import type { CreateAdminDto, OnboardAgentDto } from './dto/admin.dto.js';
import type { IdentityVerificationDto } from './dto/admin.dto.js';
import type { ReviewSubmissionDto } from './dto/review.dto.js';
import type { Role } from '../../common/roles.decorator.js';
import type { ProfileStatus, SubmissionEntityType } from '../../common/types.js';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trustService: TrustService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {}

  async createAdmin(dto: CreateAdminDto) {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
      timeCost: 3,
      memoryCost: 8192,
      parallelism: 2,
    });

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        displayName: dto.displayName?.trim() || null,
        role: 'ADMIN',
        emailVerified: true,
        identityVerified: true,
      },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        emailVerified: true,
        identityVerified: true,
      },
    });

    return { ...user, message: 'Admin account created successfully' };
  }

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
        data: { identityVerified: true },
      });

      await tx.trustEvent.create({
        data: {
          userId: dto.userId,
          eventType: 'IDENTITY_VERIFIED',
          weight: 15,
          payload: {
            idDocumentNumber: dto.idDocumentNumber,
            idDocumentPhotoUrl: dto.idDocumentPhotoUrl,
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
    if (role) where.role = role;

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

  async reviewSubmission(submissionId: string, adminId: string, dto: ReviewSubmissionDto) {
    const submission = await this.prisma.adminReviewQueue.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.status !== 'PENDING') {
      throw new ConflictException('Submission has already been reviewed');
    }

    const reason = dto.reason?.trim() || null;
    if (dto.status === 'REJECTED' && !reason) {
      throw new BadRequestException('A rejection reason is required');
    }

    const entityType = (submission.entityType ?? this.defaultEntityType(submission.reviewType)) as SubmissionEntityType;
    const entityId = submission.entityId;
    const studentProfile = entityType === 'student_profile'
      ? await this.findStudentProfile(entityId, submission.email)
      : null;
    const providerPage = entityType === 'provider_page'
      ? await this.findProviderPage(entityId, submission.email)
      : null;

    if (entityType === 'student_profile' && !studentProfile) {
      throw new NotFoundException('Student profile submission not found');
    }

    if (entityType === 'provider_page' && !providerPage) {
      throw new NotFoundException('Provider Page submission not found');
    }

    if (
      (entityType === 'student_profile' && studentProfile?.status !== 'PENDING') ||
      (entityType === 'provider_page' && providerPage?.verificationState !== 'SUBMITTED')
    ) {
      throw new ConflictException('Submission is not pending review');
    }

    const newStatus = dto.status;
    const reviewedAt = new Date();
    let approvedUserId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      await tx.adminReviewQueue.update({
        where: { id: submissionId },
        data: {
          status: newStatus,
          reviewedBy: adminId,
          reviewedAt,
          reviewNotes: reason,
          rejectionReason: newStatus === 'REJECTED' ? reason : null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: newStatus === 'APPROVED' ? 'SUBMISSION_APPROVED' : 'SUBMISSION_REJECTED',
          entityType: 'admin_review',
          entityId: submissionId,
          metadata: {
            tier: submission.tier,
            reviewType: submission.reviewType,
            entityType,
            entityId,
            reason,
          },
        },
      });

      if (entityType === 'student_profile' && studentProfile) {
        if (newStatus === 'APPROVED') {
          const email = submission.email.toLowerCase().trim();
          const existingUser = await tx.user.findUnique({ where: { email } });
          const user = existingUser ?? await tx.user.create({
            data: {
              email,
              passwordHash: studentProfile.passwordHash,
              displayName: studentProfile.displayName ?? null,
              role: 'STUDENT',
              emailVerified: true,
              identityVerified: true,
            },
          });

          if (existingUser) {
            await tx.user.update({
              where: { id: user.id },
              data: {
                role: 'STUDENT',
                emailVerified: true,
                identityVerified: true,
                displayName: studentProfile.displayName ?? existingUser.displayName,
              },
            });
          }

          await tx.studentProfile.update({
            where: { id: studentProfile.id },
            data: {
              userId: user.id,
              status: 'APPROVED',
              reviewedBy: adminId,
              reviewNotes: reason,
              rejectionReason: null,
              reviewedAt,
            },
          });
          approvedUserId = user.id;
        } else {
          await tx.studentProfile.update({
            where: { id: studentProfile.id },
            data: {
              status: 'REJECTED',
              reviewedBy: adminId,
              reviewNotes: reason,
              rejectionReason: reason,
              reviewedAt,
            },
          });
        }
      }

      if (entityType === 'provider_page' && providerPage) {
        const providerType = providerPage.providerType === 'AGENT' ? 'AGENT' : 'LANDLORD';
        await tx.providerPage.update({
          where: { id: providerPage.id },
          data: {
            verificationState: newStatus === 'APPROVED' ? 'VERIFIED' : 'REJECTED',
            verifiedAt: newStatus === 'APPROVED' ? reviewedAt : null,
            verifiedBy: newStatus === 'APPROVED' ? adminId : null,
            verificationNotes: reason,
          },
        });

        if (newStatus === 'APPROVED') {
          await tx.user.update({
            where: { id: providerPage.ownerId },
            data: {
              role: providerType,
              identityVerified: true,
            },
          });
          await tx.trustEvent.create({
            data: {
              userId: providerPage.ownerId,
              eventType: 'IDENTITY_VERIFIED',
              weight: 15,
              payload: { providerPageId: providerPage.id, providerType },
            },
          });
          approvedUserId = providerPage.ownerId;
        }
      }
    });

    this.enqueueEmail(
      submission.tier === 'STUDENT'
        ? newStatus === 'APPROVED' ? 'student-approval' : 'student-rejection'
        : newStatus === 'APPROVED' ? 'landlord-approval' : 'landlord-rejection',
      submission.email,
      newStatus === 'REJECTED' ? reason ?? 'No reason provided' : undefined,
    );

    return {
      id: submissionId,
      status: newStatus,
      email: submission.email,
      tier: submission.tier,
      reviewType: submission.reviewType,
      entityType,
      entityId,
      reviewedBy: adminId,
      reviewedAt: reviewedAt.toISOString(),
      rejectionReason: newStatus === 'REJECTED' ? reason : null,
      approvedUserId,
      message: newStatus === 'APPROVED' ? 'Submission approved' : 'Submission rejected',
    };
  }

  async listReviewQueue(status?: ProfileStatus, tier?: 'STUDENT' | 'LANDLORD') {
    const where: any = {};
    if (status) where.status = status;
    if (tier) where.tier = tier;

    const queues = await this.prisma.adminReviewQueue.findMany({
      where,
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' },
    });

    return queues.map((queue) => this.toRecord(queue));
  }

  async getReviewQueue(submissionId: string) {
    const queue = await this.prisma.adminReviewQueue.findUnique({
      where: { id: submissionId },
    });
    if (!queue) throw new NotFoundException('Submission not found');
    return this.toRecord(queue);
  }

  private async findStudentProfile(entityId: string | null, email: string) {
    if (entityId) {
      return this.prisma.studentProfile.findUnique({ where: { id: entityId } });
    }
    return this.prisma.studentProfile.findUnique({ where: { email } });
  }

  private async findProviderPage(entityId: string | null, email: string) {
    if (entityId) {
      return this.prisma.providerPage.findUnique({ where: { id: entityId } });
    }
    return this.prisma.providerPage.findFirst({
      where: { owner: { email } },
      orderBy: { submittedAt: 'desc' },
    });
  }

  private defaultEntityType(reviewType: string): SubmissionEntityType {
    return reviewType === 'SIGNUP' ? 'student_profile' : 'provider_page';
  }

  private toRecord(queue: any) {
    return {
      id: queue.id,
      email: queue.email,
      tier: queue.tier,
      reviewType: queue.reviewType,
      status: queue.status,
      entityType: queue.entityType ?? this.defaultEntityType(queue.reviewType),
      entityId: queue.entityId ?? null,
      submittedData: queue.submittedData,
      reviewNotes: queue.reviewNotes ?? null,
      reviewedBy: queue.reviewedBy ?? null,
      reviewedAt: queue.reviewedAt?.toISOString() ?? null,
      rejectionReason: queue.rejectionReason ?? null,
      submittedAt: queue.createdAt.toISOString(),
      createdAt: queue.createdAt.toISOString(),
    };
  }

  private enqueueEmail(
    type: 'student-approval' | 'student-rejection' | 'landlord-approval' | 'landlord-rejection',
    to: string,
    reason?: string,
  ) {
    void this.emailQueue
      .add('profile-verification-email', {
        type,
        to,
        ...(reason ? { reason } : {}),
      } as any, {
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
        jobId: `email:${type}:${to}`,
      })
      .catch((error) => {
        this.logger.error(
          `Unable to queue ${type} email for ${to}: ${(error as Error).message}`,
          (error as Error).stack,
        );
      });
  }
}
