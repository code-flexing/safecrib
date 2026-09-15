import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { TRUST_RECOMPUTE_QUEUE } from '../../infra/queue/queue.constants.js';
import type { ReportFraudDto } from './dto/fraud.dto.js';
import type { Prisma } from '@prisma/client';

@Injectable()
export class FraudService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TRUST_RECOMPUTE_QUEUE) private readonly trustQueue: Queue,
  ) {}

  async reportFraud(reporterId: string, dto: ReportFraudDto) {
    if (!dto.targetListingId && !dto.targetUserId) {
      throw new BadRequestException('Must specify either targetListingId or targetUserId');
    }

    const report = await this.prisma.fraudReport.create({
      data: {
        reporterId,
        targetUserId: dto.targetUserId ?? null,
        targetListingId: dto.targetListingId ?? null,
        type: (dto.type ?? 'OTHER') as any,
        description: dto.description,
        status: 'PENDING',
      },
    });

    await this.prisma.trustEvent.create({
      data: {
        userId: reporterId,
        eventType: 'FRAUD_REPORT_CONFIRMED',
        weight: -10,
        payload: { reportId: report.id, reportedAt: new Date().toISOString() },
      },
    });

    return {
      id: report.id,
      message: 'Fraud report submitted and is pending review',
    };
  }

  async getPendingReports(skip = 0, take = 20) {
    return this.prisma.fraudReport.findMany({
      where: { status: 'PENDING' },
      include: {
        reporter: { select: { id: true, email: true, trustScore: true } },
        targetUser: { select: { id: true, email: true, trustScore: true } },
        targetListing: { select: { id: true, title: true, status: true } },
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingDuplicateFlags(skip = 0, take = 20) {
    return this.prisma.duplicateFlag.findMany({
      where: { status: 'PENDING' },
      include: {
        listingA: { select: { id: true, title: true, price: true, lat: true, lng: true, owner: { select: { id: true, email: true, trustScore: true } } } },
        listingB: { select: { id: true, title: true, price: true, lat: true, lng: true, owner: { select: { id: true, email: true, trustScore: true } } } },
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveFraudReport(
    reportId: string,
    adminId: string,
    status: 'CONFIRMED' | 'DISMISSED',
    notes?: string,
  ) {
    const report = await this.prisma.fraudReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        status: true,
        targetUserId: true,
        targetListingId: true,
        reporterId: true,
      },
    });

    if (!report) {
      throw new NotFoundException('Fraud report not found');
    }

    if (report.status !== 'PENDING') {
      throw new BadRequestException(`Report is already ${report.status}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.fraudReport.update({
        where: { id: reportId },
        data: {
          status,
          resolution: notes ?? null,
          resolvedBy: adminId,
          resolvedAt: new Date(),
        },
      });

      if (status === 'CONFIRMED' && report.targetUserId) {
        await tx.trustEvent.create({
          data: {
            userId: report.targetUserId,
            eventType: 'FRAUD_REPORT_CONFIRMED',
            weight: -60,
            payload: { reportId, resolvedBy: adminId, notes },
          },
        });

        if (report.targetListingId) {
          await tx.listing.update({
            where: { id: report.targetListingId },
            data: { status: 'FLAGGED' },
          });
        }

        await this.trustQueue.add('recompute', { userId: report.targetUserId });
      } else if (status === 'CONFIRMED' && report.targetListingId) {
        await tx.listing.update({
          where: { id: report.targetListingId },
          data: { status: 'FLAGGED' },
        });
      }
    });

    return { message: `Fraud report ${status.toLowerCase()}` };
  }

  async resolveDuplicateFlag(
    flagId: string,
    adminId: string,
    status: 'CONFIRMED' | 'DISMISSED',
    notes?: string,
  ) {
    const flag = await this.prisma.duplicateFlag.findUnique({
      where: { id: flagId },
      select: {
        id: true,
        listingIdA: true,
        listingIdB: true,
        status: true,
      },
    });

    if (!flag) {
      throw new NotFoundException('Duplicate flag not found');
    }

    if (flag.status !== 'PENDING') {
      throw new BadRequestException(`Flag is already ${flag.status}`);
    }

    await this.prisma.duplicateFlag.update({
      where: { id: flagId },
      data: {
        status,
        reviewedBy: adminId,
        reviewedAt: new Date(),
      },
    });

    if (status === 'CONFIRMED') {
      const listingAOwner = await this.prisma.listing.findUnique({
        where: { id: flag.listingIdA },
        select: { ownerId: true },
      });
      const listingBOwner = await this.prisma.listing.findUnique({
        where: { id: flag.listingIdB },
        select: { ownerId: true },
      });

      if (listingAOwner) {
        await this.prisma.$executeRaw`
          INSERT INTO "trust_events" ("id", "user_id", "event_type", "weight", "occurred_at", "payload")
          VALUES (gen_random_uuid(), ${listingAOwner.ownerId}, 'FRAUD_REPORT_CONFIRMED', -40, NOW(), ${JSON.stringify({ duplicateFlagId: flagId, notes })})
        `;
        await this.trustQueue.add('recompute', { userId: listingAOwner.ownerId });
      }
      if (listingBOwner && listingBOwner.ownerId !== listingAOwner?.ownerId) {
        await this.prisma.trustEvent.create({
          data: {
            userId: listingBOwner.ownerId,
            eventType: 'FRAUD_REPORT_CONFIRMED',
            weight: -40,
            payload: { duplicateFlagId: flagId, notes },
          },
        });
        await this.trustQueue.add('recompute', { userId: listingBOwner.ownerId });
      }
    }
  }

  async getAllReports(skip = 0, take = 50, status?: string) {
    const where: Prisma.FraudReportWhereInput = {};
    if (status) {
      where.status = status as any;
    }
    return this.prisma.fraudReport.findMany({
      where,
      include: {
        reporter: { select: { id: true, email: true } },
        targetUser: { select: { id: true, email: true } },
        targetListing: { select: { id: true, title: true } },
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }
}
