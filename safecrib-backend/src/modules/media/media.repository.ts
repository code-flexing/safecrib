import { Injectable } from '@nestjs/common';
import type {
  Media,
  MediaAttachment,
  MediaPurpose,
  MediaStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export type CreateMediaInput = Omit<
  Prisma.MediaCreateInput,
  'owner' | 'attachments'
> & { ownerId: string };

@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    ownerId: string;
    purpose: MediaPurpose;
    resourceType: Prisma.MediaCreateInput['resourceType'];
    deliveryType: Prisma.MediaCreateInput['deliveryType'];
    publicId: string;
    status: MediaStatus;
  }): Promise<Media> {
    return this.prisma.media.create({
      data: {
        owner: { connect: { id: input.ownerId } },
        purpose: input.purpose,
        resourceType: input.resourceType,
        deliveryType: input.deliveryType,
        publicId: input.publicId,
        status: input.status,
      },
    });
  }

  async findById(id: string): Promise<Media | null> {
    return this.prisma.media.findUnique({ where: { id } });
  }

  async findByPublicId(publicId: string): Promise<Media | null> {
    return this.prisma.media.findUnique({ where: { publicId } });
  }

  async findByIdempotencyKey(key: string): Promise<Media | null> {
    return this.prisma.media.findUnique({ where: { idempotencyKey: key } });
  }

  async markReady(
    id: string,
    data: {
      assetId?: string;
      version?: bigint;
      format?: string;
      bytes?: number;
      width?: number;
      height?: number;
      durationSec?: number;
      etag?: string;
      idempotencyKey: string;
    },
  ): Promise<Media> {
    return this.prisma.media.update({
      where: { id },
      data: {
        status: 'READY',
        readyAt: new Date(),
        assetId: data.assetId,
        version: data.version,
        format: data.format,
        bytes: data.bytes,
        width: data.width,
        height: data.height,
        durationSec: data.durationSec,
        etag: data.etag,
        idempotencyKey: data.idempotencyKey,
      },
    });
  }

  async markFailed(id: string, reason: string): Promise<Media> {
    return this.prisma.media.update({
      where: { id },
      data: { status: 'FAILED', failureReason: reason },
    });
  }

  async markDeleting(id: string): Promise<Media> {
    return this.prisma.media.update({
      where: { id },
      data: { status: 'DELETING' },
    });
  }

  async markDeleted(id: string): Promise<Media> {
    return this.prisma.media.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
  }

  async countPendingForUser(ownerId: string, purpose: MediaPurpose): Promise<number> {
    return this.prisma.media.count({
      where: { ownerId, purpose, status: 'PENDING' },
    });
  }

  async findPendingForOwner(ownerId: string): Promise<Media[]> {
    return this.prisma.media.findMany({
      where: { ownerId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Find PENDING uploads older than the given age (for orphan cleanup).
   */
  async findStaleOrphans(olderThanMs: number, limit = 100): Promise<Media[]> {
    const cutoff = new Date(Date.now() - olderThanMs);
    return this.prisma.media.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Find DELETING records that may need a retry.
   */
  async findDeletingRecords(limit = 100): Promise<Media[]> {
    return this.prisma.media.findMany({
      where: { status: 'DELETING' },
      orderBy: { updatedAt: 'asc' },
      take: limit,
    });
  }

  async attach(input: {
    mediaId: string;
    entityType: string;
    entityId: string;
    role: string;
    position?: number;
  }): Promise<MediaAttachment> {
    return this.prisma.mediaAttachment.upsert({
      where: {
        mediaId_entityType_entityId_role: {
          mediaId: input.mediaId,
          entityType: input.entityType,
          entityId: input.entityId,
          role: input.role,
        },
      },
      create: {
        mediaId: input.mediaId,
        entityType: input.entityType,
        entityId: input.entityId,
        role: input.role,
        position: input.position ?? 0,
      },
      update: { position: input.position ?? 0 },
    });
  }

  async findAttachments(entityType: string, entityId: string): Promise<
    (MediaAttachment & { media: Media })[]
  > {
    return this.prisma.mediaAttachment.findMany({
      where: { entityType, entityId },
      include: { media: true },
      orderBy: [{ role: 'asc' }, { position: 'asc' }],
    }) as Promise<(MediaAttachment & { media: Media })[]>;
  }

  async logAccess(input: {
    mediaId: string;
    accessorId: string;
    ip?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.prisma.mediaAccessLog.create({ data: input });
  }
}
