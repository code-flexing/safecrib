import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectJobQueue } from '../../infra/queue/queue-injection.js';
import type { JobQueueClient } from '../../infra/queue/queue.service.js';
import * as argon2 from 'argon2';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { EMAIL_QUEUE } from '../../infra/queue/queue.constants.js';
import { TrustService } from '../trust/trust.service.js';
import type { CreateAdminDto, OnboardAgentDto } from './dto/admin.dto.js';
import type { IdentityVerificationDto } from './dto/admin.dto.js';
import type { ReviewSubmissionDto } from './dto/review.dto.js';
import type { ProfileStatus, SubmissionEntityType } from '../../common/types.js';
import { NotificationsService, withSystemSender } from '../notifications/notifications.service.js';
import { generateUniqueUsername } from '../../common/username.utils.js';
import { getPublicVerification } from '../../common/verification/public-verification.js';
import type { Role } from '../../common/roles.decorator.js';

const NON_ADMIN_ROLES = ['STUDENT', 'AGENT', 'LANDLORD', 'UNVERIFIED'] as const;
type NonAdminRole = (typeof NON_ADMIN_ROLES)[number];

const USER_LIST_SEARCH_FIELDS = ['email', 'displayName', 'username'] as const;
const VALID_SORT_FIELDS = ['createdAt', 'email', 'displayName', 'username'] as const;
type SortField = (typeof VALID_SORT_FIELDS)[number];

function isValidSortField(field: string): field is SortField {
  return VALID_SORT_FIELDS.includes(field as SortField);
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trustService: TrustService,
    @InjectJobQueue(EMAIL_QUEUE) private readonly emailQueue: JobQueueClient,
    private readonly notifications: NotificationsService,
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

    const user = await this.prisma.$transaction(async (tx) => {
      const username = await generateUniqueUsername(email, (candidate) =>
        tx.user
          .findUnique({ where: { username: candidate }, select: { username: true } })
          .then((u) => u !== null),
      );
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName: dto.displayName?.trim() || null,
          username,
          role: 'ADMIN',
          emailVerified: true,
          identityVerified: true,
        },
        select: {
          id: true,
          email: true,
          displayName: true,
          username: true,
          role: true,
          emailVerified: true,
          identityVerified: true,
        },
      });
      await tx.adminProfile.create({ data: { userId: created.id } });
      return created;
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

    const role: 'AGENT' | 'LANDLORD' = dto.role ?? 'AGENT';

    const user = await this.prisma.$transaction(async (tx) => {
      const email = dto.email.toLowerCase().trim();
      const username = await generateUniqueUsername(email, (candidate) =>
        tx.user
          .findUnique({ where: { username: candidate }, select: { username: true } })
          .then((u) => u !== null),
      );
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName: dto.displayName ?? null,
          username,
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

  async getAllUsers(params: {
    skip?: number;
    take?: number;
    role?: string;
    search?: string;
    verification?: string;
    status?: string;
    flagged?: boolean;
    from?: string;
    to?: string;
    sort?: string;
    order?: 'asc' | 'desc';
  } = {}) {
    const {
      skip = 0,
      take = 20,
      role,
      search,
      verification,
      status,
      flagged,
      from,
      to,
      sort = 'createdAt',
      order = 'desc',
    } = params;

    const where: any = {
      role: { in: NON_ADMIN_ROLES },
    };

    if (role && NON_ADMIN_ROLES.includes(role as NonAdminRole)) {
      where.role = role;
    }

    if (search && search.length >= 2) {
      where.OR = USER_LIST_SEARCH_FIELDS.map((field) => ({
        [field]: { contains: search, mode: 'insensitive' },
      }));
    }

    if (verification) {
      switch (verification) {
        case 'VERIFIED':
          where.identityVerified = true;
          break;
        case 'PENDING':
          where.identityVerified = false;
          where.emailVerified = true;
          break;
        case 'REJECTED':
          where.identityVerified = false;
          where.emailVerified = false;
          break;
        case 'NOT_SUBMITTED':
          where.emailVerified = false;
          break;
      }
    }

    if (status === 'ACTIVE') {
      where.emailVerified = true;
    } else if (status === 'SUSPENDED') {
      where.emailVerified = false;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const orderByField = isValidSortField(sort) ? sort : 'createdAt';

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          displayName: true,
          username: true,
          role: true,
          emailVerified: true,
          identityVerified: true,
          trustScore: true,
          createdAt: true,
          profilePicture: true,
          studentProfile: {
            select: {
              id: true,
              status: true,
              schoolOfStudy: true,
              profilePicture: true,
            },
          },
          providerPage: {
            select: {
              id: true,
              verificationState: true,
              displayName: true,
              profilePicture: true,
            },
          },
          verification: {
            select: {
              stage: true,
              badge: true,
              badgeColor: true,
              riskBlocked: true,
            },
          },
          _count: {
            select: {
              fraudReportsFiled: true,
              fraudReportsAssigned: true,
            },
          },
        },
        skip,
        take,
        orderBy: { [orderByField]: order },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => ({
        ...u,
        verification: u.verification
          ? { ...u.verification, kind: getPublicVerification({ role: u.role as Role, identityVerified: u.identityVerified, studentProfileApproved: u.studentProfile?.status === 'APPROVED', providerPageVerified: u.providerPage?.verificationState === 'VERIFIED', riskBlocked: u.verification.riskBlocked }).kind }
          : { kind: getPublicVerification({ role: u.role as Role, identityVerified: u.identityVerified, studentProfileApproved: u.studentProfile?.status === 'APPROVED', providerPageVerified: u.providerPage?.verificationState === 'VERIFIED' }).kind },
      })),
      total,
      nextCursor: items.length === take ? skip + take : null,
    };
  }

  async getUserDetail(userId: string, adminId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        studentProfile: true,
        providerPage: true,
        verification: true,
        listings: {
          select: {
            id: true,
            title: true,
            price: true,
            discountAmount: true,
            status: true,
            campus: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        bookings: {
          select: {
            id: true,
            listingId: true,
            status: true,
            depositAmount: true,
            holdExpiresAt: true,
            bookedAt: true,
            completedAt: true,
            cancelledAt: true,
            createdAt: true,
            listing: {
              select: { id: true, title: true, price: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        trustEvents: {
          select: { id: true, eventType: true, weight: true, occurredAt: true },
          orderBy: { occurredAt: 'desc' },
          take: 20,
        },
        fraudReportsFiled: {
          select: {
            id: true,
            type: true,
            description: true,
            status: true,
            targetUserId: true,
            targetListingId: true,
            createdAt: true,
            targetListing: { select: { id: true, title: true } },
            targetUser: { select: { id: true, displayName: true, username: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        fraudReportsAssigned: {
          select: {
            id: true,
            type: true,
            description: true,
            status: true,
            reporterId: true,
            targetListingId: true,
            createdAt: true,
            reporter: { select: { id: true, displayName: true, username: true } },
            targetListing: { select: { id: true, title: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        notifications: {
          where: {
            data: {
              path: ['senderAdminId'],
              not: {},
            },
          },
          select: {
            id: true,
            type: true,
            title: true,
            body: true,
            href: true,
            readAt: true,
            createdAt: true,
            data: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        _count: {
          select: {
            listings: true,
            bookings: true,
            trustEvents: true,
            fraudReportsFiled: true,
            fraudReportsAssigned: true,
            notifications: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Audit log for admin viewing user profile
    if (adminId) {
      await this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: 'USER_PROFILE_VIEWED',
          entityType: 'user',
          entityId: userId,
          metadata: { viewedAt: new Date().toISOString() },
        },
      });
    }

    return user;
  }

  async sendAdminNotification(
    adminId: string,
    targetUserId: string,
    data: {
      title: string;
      message: string;
      link?: string;
      templateKey?: string;
    },
    idempotencyKey?: string,
  ) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, role: true, email: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Recipient user not found');
    }

    if (targetUser.role === 'ADMIN') {
      throw new BadRequestException('Cannot send admin notifications to other admins');
    }

    const admin = await this.prisma.user.findUnique({
      where: { id: adminId },
      select: { id: true, displayName: true, profilePicture: true, username: true },
    });

    if (!admin) {
      throw new NotFoundException('Admin user not found');
    }

    const title = data.title.trim().slice(0, 80);
    const message = data.message.trim().slice(0, 500);

    if (!title || !message) {
      throw new BadRequestException('Title and message are required');
    }

    let link = data.link?.trim() || null;
    if (link) {
      if (!link.startsWith('/') || link.startsWith('//')) {
        throw new BadRequestException('Link must be an internal path');
      }
      const allowedPrefixes = ['/profile', '/dashboard', '/page', '/admin'];
      const isAllowed = allowedPrefixes.some((prefix) => link.startsWith(prefix));
      if (!isAllowed) {
        throw new BadRequestException('Link must be to an allowed internal destination');
      }
    }

    // Check idempotency
    if (idempotencyKey) {
      const existing = await this.prisma.notification.findFirst({
        where: { dedupeKey: `admin_message:${idempotencyKey}` },
        select: { id: true },
      });
      if (existing) {
        return { id: existing.id, duplicate: true };
      }
    }

    const notification = await this.prisma.$transaction(async (tx) => {
      const created = await tx.notification.create({
        data: {
          userId: targetUserId,
          type: 'ADMIN_MESSAGE',
          title,
          body: message,
          href: link,
          data: {
            senderAdminId: adminId,
            senderNameSnapshot: admin.displayName ?? admin.username ?? 'SafeCribs Team',
            senderAvatarSnapshot: admin.profilePicture,
            templateKey: data.templateKey,
          },
          dedupeKey: idempotencyKey ? `admin_message:${idempotencyKey}` : `admin_message:${adminId}:${targetUserId}:${Date.now()}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: 'ADMIN_NOTIFICATION_SENT',
          entityType: 'notification',
          entityId: created.id,
          metadata: {
            targetUserId,
            title,
            templateKey: data.templateKey ?? null,
            link: link ?? null,
          },
        },
      });

      return created;
    });

    // Send real-time notification via the notifications service
    await this.notifications.enqueue(targetUserId, {
      type: 'ADMIN_MESSAGE' as any,
      title,
      body: message,
      href: link ?? undefined,
      data: {
        senderAdminId: adminId,
        senderNameSnapshot: admin.displayName ?? admin.username ?? 'SafeCribs Team',
        senderAvatarSnapshot: admin.profilePicture,
        templateKey: data.templateKey,
      },
      dedupeKey: notification.dedupeKey,
    });

    return { id: notification.id, duplicate: false };
  }

  async getAdminNotificationsSent(targetUserId: string, skip = 0, take = 20) {
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where: {
          userId: targetUserId,
          type: 'ADMIN_MESSAGE',
        },
        select: {
          id: true,
          title: true,
          body: true,
          href: true,
          readAt: true,
          createdAt: true,
          data: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.notification.count({
        where: {
          userId: targetUserId,
          type: 'ADMIN_MESSAGE',
        },
      }),
    ]);

    return { items, total };
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
          if (!studentProfile.userId) {
            throw new ConflictException('Student profile is not linked to an account');
          }
          const existingUser = await tx.user.findUnique({
            where: { id: studentProfile.userId },
          });
          if (!existingUser) {
            throw new ConflictException('Student profile is not linked to an account');
          }
          if (['AGENT', 'LANDLORD', 'ADMIN'].includes(existingUser.role)) {
            throw new ConflictException('This account already has another verified mode');
          }

          const user = await tx.user.update({
            where: { id: existingUser.id },
            data: {
              role: 'STUDENT',
              emailVerified: true,
              identityVerified: true,
              displayName: studentProfile.displayName ?? existingUser.displayName,
            },
          });

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
        const providerOwner = await tx.user.findUnique({
          where: { id: providerPage.ownerId },
          select: { role: true },
        });
        if (
          newStatus === 'APPROVED' &&
          providerOwner?.role === 'STUDENT' &&
          !providerPage.accountModeConversionConsented
        ) {
          throw new ConflictException('Student account conversion consent is required');
        }
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

    const notificationUserId = entityType === 'student_profile'
      ? studentProfile?.userId
      : providerPage?.ownerId;
    if (notificationUserId) {
      const approved = newStatus === 'APPROVED';
await this.notifications.enqueue(notificationUserId, withSystemSender({
      type: entityType === 'student_profile'
        ? approved ? 'STUDENT_PROFILE_APPROVED' : 'STUDENT_PROFILE_REJECTED'
        : approved ? 'PROVIDER_PAGE_APPROVED' : 'PROVIDER_PAGE_REJECTED',
      title: entityType === 'student_profile'
        ? approved ? 'Student profile approved' : 'Student profile needs changes'
        : approved ? 'Provider Page approved' : 'Provider Page needs changes',
      body: approved
        ? entityType === 'student_profile'
          ? 'Your student profile is approved. Your student account is ready to use.'
          : 'Your provider Page is verified. You can now publish homes.'
        : `Your submission was not approved. ${reason ?? 'Review your profile and update the requested details.'}`,
      href: entityType === 'student_profile' ? '/profile' : '/page',
      data: { submissionId, entityType, status: newStatus },
      dedupeKey: `review:${submissionId}:${newStatus.toLowerCase()}`,
    }));
    }

    if (newStatus === 'APPROVED' && approvedUserId) {
      try {
        await this.trustService.getVerificationStage(approvedUserId);
      } catch (error) {
        this.logger.error(
          `Unable to update verification badge after approval for ${submission.email}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

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
    const normalizedEmail = email.toLowerCase().trim();
    if (entityId) {
      const profile = await this.prisma.studentProfile.findFirst({
        where: { id: entityId, user: { email: normalizedEmail } },
      });
      if (profile) return profile;
    }
    return this.prisma.studentProfile.findFirst({
      where: { user: { email: normalizedEmail } },
      orderBy: { submittedAt: 'desc' },
    });
  }

  private async findProviderPage(entityId: string | null, email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    if (entityId) {
      const page = await this.prisma.providerPage.findFirst({
        where: { id: entityId, owner: { email: normalizedEmail } },
      });
      if (page) return page;
    }
    return this.prisma.providerPage.findFirst({
      where: { owner: { email: normalizedEmail } },
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
