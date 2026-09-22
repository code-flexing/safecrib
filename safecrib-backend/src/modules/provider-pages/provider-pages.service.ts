import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { EMAIL_QUEUE } from '../../infra/queue/queue.constants.js';
import { TrustService } from '../trust/trust.service.js';
import type { ProviderProfileSubmission } from '../../common/types.js';
import type {
  CreateProviderPageDto,
  UpdateProviderPageDto,
} from './dto/provider-page.dto.js';

@Injectable()
export class ProviderPagesService {
  private readonly logger = new Logger(ProviderPagesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly trustService: TrustService,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue,
  ) {}

  async getMine(ownerId: string) {
    return this.prisma.providerPage.findUnique({ where: { ownerId } });
  }

  async create(ownerId: string, dto: CreateProviderPageDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, email: true, displayName: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!['STUDENT', 'AGENT', 'LANDLORD'].includes(user.role)) {
      throw new ForbiddenException('Only basic or provider accounts can create a Page');
    }

    if (dto.payoutAccounts) {
      this.validatePayoutAccounts(dto.payoutAccounts);
    }
    const existing = await this.getMine(ownerId);
    const data = this.toPageData(dto) as any;

    if (existing) {
      if (existing.verificationState !== 'REJECTED') {
        throw new ConflictException('A provider Page already exists for this account');
      }

      const page = await this.prisma.providerPage.update({
        where: { id: existing.id },
        data: {
          ...data,
          verificationState: 'DRAFT',
          submittedAt: null,
          verifiedAt: null,
          verifiedBy: null,
          verificationNotes: null,
        },
      });
      await this.audit(ownerId, 'PROVIDER_PAGE_UPDATED', 'provider_page', page.id);
      return page;
    }

    const page = await this.prisma.providerPage.create({
      data: { ownerId, ...data, verificationState: 'DRAFT' },
    });
    await this.audit(ownerId, 'PROVIDER_PAGE_CREATED', 'provider_page', page.id);
    return page;
  }

  async update(ownerId: string, dto: UpdateProviderPageDto) {
    const page = await this.requireOwnerPage(ownerId);
    if (page.verificationState !== 'DRAFT' && page.verificationState !== 'REJECTED') {
      throw new ConflictException('This Page cannot be edited in its current state');
    }

    if (dto.payoutAccounts) {
      this.validatePayoutAccounts(dto.payoutAccounts);
    }

    const current = {
      displayName: dto.displayName ?? page.displayName,
      description: dto.description ?? page.description ?? undefined,
      phone: dto.phone ?? page.phone ?? undefined,
      proofOfLicense: dto.proofOfLicense ?? page.proofOfLicense ?? undefined,
      profilePicture: dto.profilePicture ?? page.profilePicture ?? undefined,
      payoutAccounts: dto.payoutAccounts ?? (page.payoutAccounts as any) ?? undefined,
      providerType: dto.providerType ?? page.providerType ?? undefined,
      businessName: dto.businessName ?? page.businessName ?? undefined,
      businessRegNumber: dto.businessRegNumber ?? page.businessRegNumber ?? undefined,
      businessAddress: dto.businessAddress ?? page.businessAddress ?? undefined,
      additionalContactNumbers:
        dto.additionalContactNumbers ?? (page.additionalContacts as string[] | undefined) ?? undefined,
      socialLinks: dto.socialLinks ?? (page.socialLinks as Record<string, string> | undefined) ?? undefined,
    };

    const updated = await this.prisma.providerPage.update({
      where: { id: page.id },
      data: {
        ...this.toPageData(current as unknown as CreateProviderPageDto) as any,
        verificationState: 'DRAFT',
        submittedAt: null,
        verifiedAt: null,
        verifiedBy: null,
        verificationNotes: null,
      },
    });
    await this.audit(ownerId, 'PROVIDER_PAGE_UPDATED', 'provider_page', updated.id);
    return updated;
  }

  async submit(ownerId: string) {
    const page = await this.requireOwnerPage(ownerId);
    if (page.verificationState !== 'DRAFT' && page.verificationState !== 'REJECTED') {
      throw new ConflictException('This Page cannot be submitted in its current state');
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true, displayName: true },
    });
    if (!owner) throw new NotFoundException('User not found');

    const submittedData = this.toSubmissionData(page, owner.displayName);
    this.validateSubmission(submittedData);

    const reviewId = randomUUID();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.providerPage.update({
        where: { id: page.id },
        data: {
          verificationState: 'SUBMITTED',
          submittedAt: new Date(),
          verifiedAt: null,
          verifiedBy: null,
          verificationNotes: null,
        },
      });
      await tx.adminReviewQueue.create({
        data: {
          id: reviewId,
          email: owner.email,
          tier: 'LANDLORD',
          reviewType: 'CREATE_PAGE',
          status: 'PENDING',
          entityType: 'provider_page',
          entityId: page.id,
          submittedData: submittedData as any,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: ownerId,
          action: 'PROVIDER_PAGE_SUBMITTED',
          entityType: 'provider_page',
          entityId: page.id,
          metadata: { reviewQueueId: reviewId },
        },
      });
      return result;
    });

    return { ...updated, reviewQueueId: reviewId };
  }

  async listPending() {
    const queues = await this.prisma.adminReviewQueue.findMany({
      where: {
        tier: 'LANDLORD',
        reviewType: 'CREATE_PAGE',
        status: 'PENDING',
      },
      orderBy: { createdAt: 'asc' },
    });

    return Promise.all(
      queues.map(async (queue) => {
        const page = queue.entityId
          ? await this.prisma.providerPage.findUnique({
              where: { id: queue.entityId },
              include: {
                owner: {
                  select: { id: true, email: true, displayName: true, role: true, identityVerified: true },
                },
              },
            })
          : null;
        return { ...queue, page };
      }),
    );
  }

  async review(pageId: string, adminId: string, approved: boolean, notes?: string) {
    const page = await this.prisma.providerPage.findUnique({
      where: { id: pageId },
      include: { owner: { select: { id: true, email: true, displayName: true, role: true } } },
    });
    if (!page) throw new NotFoundException('Provider Page not found');
    if (page.verificationState !== 'SUBMITTED') {
      throw new ConflictException('Only submitted Pages can be reviewed');
    }

    const reason = notes?.trim() || null;
    if (!approved && !reason) {
      throw new BadRequestException('A rejection reason is required');
    }

    const queue = await this.prisma.adminReviewQueue.findFirst({
      where: {
        entityId: pageId,
        entityType: 'provider_page',
        tier: 'LANDLORD',
        reviewType: 'CREATE_PAGE',
        status: 'PENDING',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!queue) {
      throw new NotFoundException('Review queue submission not found');
    }

    const providerType = page.providerType === 'AGENT' ? 'AGENT' : 'LANDLORD';
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.providerPage.update({
        where: { id: pageId },
        data: {
          verificationState: approved ? 'VERIFIED' : 'REJECTED',
          verifiedAt: approved ? new Date() : null,
          verifiedBy: approved ? adminId : null,
          verificationNotes: reason,
        },
      });
      await tx.adminReviewQueue.update({
        where: { id: queue.id },
        data: {
          status: approved ? 'APPROVED' : 'REJECTED',
          reviewedBy: adminId,
          reviewedAt: new Date(),
          reviewNotes: reason,
          rejectionReason: approved ? null : reason,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: adminId,
          action: approved ? 'PROVIDER_PAGE_VERIFIED' : 'PROVIDER_PAGE_REJECTED',
          entityType: 'provider_page',
          entityId: pageId,
          metadata: { reviewQueueId: queue.id, reason },
        },
      });
      if (approved) {
        await tx.user.update({
          where: { id: page.ownerId },
          data: { role: providerType, identityVerified: true },
        });
        await tx.trustEvent.create({
          data: {
            userId: page.ownerId,
            eventType: 'IDENTITY_VERIFIED',
            weight: 15,
            payload: { providerPageId: pageId, providerType },
          },
        });
      }
      return result;
    });

    this.enqueueEmail(
      approved ? 'landlord-approval' : 'landlord-rejection',
      page.owner.email,
      approved ? undefined : reason ?? 'No reason provided',
    );

    return { ...updated, reviewQueueId: queue.id };
  }

  async requireVerifiedPage(ownerId: string) {
    const page = await this.getMine(ownerId);
    if (!page || page.verificationState !== 'VERIFIED') {
      throw new ForbiddenException('A verified provider Page is required before Upload Home is available');
    }
    return page;
  }

  private async requireOwnerPage(ownerId: string) {
    const page = await this.getMine(ownerId);
    if (!page) throw new NotFoundException('Create a provider Page before submitting for verification');
    return page;
  }

  private toPageData(dto: CreateProviderPageDto | UpdateProviderPageDto) {
    const payoutAccounts = dto.payoutAccounts
      ? dto.payoutAccounts.map((account) => ({
          provider: account.provider.trim(),
          accountName: account.accountName.trim(),
          accountNumber: account.accountNumber.trim(),
        }))
      : undefined;

    return {
      displayName: dto.displayName?.trim(),
      description: dto.description?.trim() || null,
      phone: dto.phone?.trim() || null,
      proofOfLicense: dto.proofOfLicense?.trim() || null,
      profilePicture: dto.profilePicture?.trim() || null,
      payoutAccounts: payoutAccounts ? (payoutAccounts as any) : null,
      providerType: dto.providerType ?? null,
      businessName: dto.businessName?.trim() || null,
      businessRegNumber: dto.businessRegNumber?.trim() || null,
      businessAddress: dto.businessAddress?.trim() || null,
      additionalContacts: dto.additionalContactNumbers
        ? (dto.additionalContactNumbers.map((value) => value.trim()) as any)
        : null,
      socialLinks: dto.socialLinks ?? null,
    };
  }

  private toSubmissionData(page: any, applicantName?: string | null): ProviderProfileSubmission {
    const payoutAccounts = (page.payoutAccounts as any[] | null) ?? [];
    const statedName = applicantName || page.displayName;
    const normalizedStatedName = this.normalizeName(statedName);
    const fraudFlags: string[] = [];

    if (
      normalizedStatedName &&
      payoutAccounts.some((account) => this.normalizeName(account.accountName) !== normalizedStatedName)
    ) {
      fraudFlags.push('Payout account name does not match the applicant name');
    }

    return {
      displayName: page.displayName,
      proofOfLicense: page.proofOfLicense,
      payoutAccounts,
      profilePicture: page.profilePicture,
      businessName: page.businessName ?? null,
      businessRegNumber: page.businessRegNumber ?? null,
      businessAddress: page.businessAddress ?? null,
      additionalContacts: (page.additionalContacts as string[] | null) ?? null,
      socialLinks: (page.socialLinks as Record<string, string> | null) ?? null,
      fraudFlags,
    };
  }

  private validateSubmission(data: ProviderProfileSubmission) {
    if (!data.displayName?.trim()) throw new BadRequestException('Page name is required');
    if (!data.proofOfLicense?.trim()) throw new BadRequestException('Proof of authorization is required');
    if (!data.profilePicture?.trim()) throw new BadRequestException('Profile picture is required');
    this.validatePayoutAccounts(data.payoutAccounts);
  }

  private validatePayoutAccounts(accounts: any[]) {
    if (!Array.isArray(accounts) || accounts.length === 0) {
      throw new BadRequestException('At least one payout account is required');
    }

    for (const account of accounts) {
      if (!account.provider?.trim() || !account.accountName?.trim() || !account.accountNumber?.trim()) {
        throw new BadRequestException('Each payout account requires provider, account name, and account number');
      }
      if (!/^[0-9]+$/.test(account.accountNumber) || account.accountNumber.length < 8 || account.accountNumber.length > 20) {
        throw new BadRequestException('Payout account numbers must contain 8 to 20 digits');
      }
      const provider = account.provider.toLowerCase();
      if (['opay', 'kuda', 'moniepoint', 'palmpay'].includes(provider) && account.accountNumber.length !== 10) {
        throw new BadRequestException(`${account.provider} account numbers must contain 10 digits`);
      }
    }
  }

  private normalizeName(value: string | null | undefined): string {
    return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
  }

  private audit(actorId: string, action: string, entityType: string, entityId: string) {
    return this.prisma.auditLog.create({ data: { actorId, action, entityType, entityId } });
  }

  private enqueueEmail(type: 'landlord-approval' | 'landlord-rejection', to: string, reason?: string) {
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
