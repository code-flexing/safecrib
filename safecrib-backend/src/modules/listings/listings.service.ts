import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectJobQueue } from '../../infra/queue/queue-injection.js';
import type { JobQueueClient } from '../../infra/queue/queue.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { IMAGE_HASH_QUEUE } from '../../infra/queue/queue.constants.js';
import type { CreateListingCommentDto, UpdateListingDto } from './dto/listing.dto.js';
import type { SearchListingsDto } from './dto/listing.dto.js';
import type { ListingResponse } from './dto/listing.dto.js';
import type { Role } from '../../common/roles.decorator.js';
import { ProviderPagesService } from '../provider-pages/provider-pages.service.js';
import { MediaService } from '../media/services/media.service.js';
import { computeProviderRecommendationScore } from '../trust/trust.service.js';
import type { MediaPurpose, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service.js';

export interface CreateListingInput {
  title: string;
  description?: string;
  price: number;
  discountAmount?: number;
  lat: number;
  lng: number;
  campus?: string;
  address?: string;
  locationReference?: string;
}

export interface PhotoInput {
  url: string;
  buffer?: Buffer;
}

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectJobQueue(IMAGE_HASH_QUEUE) private readonly imageHashQueue: JobQueueClient,
    private readonly providerPages: ProviderPagesService,
    private readonly mediaService: MediaService,
    private readonly notifications: NotificationsService,
  ) {}

  async createListing(
    ownerId: string,
    ownerRole: Role,
    input: CreateListingInput,
    photos: PhotoInput[] = [],
  ): Promise<ListingResponse> {
    if (ownerRole !== 'AGENT' && ownerRole !== 'LANDLORD') {
      throw new ForbiddenException('Only agents and landlords can create listings');
    }
    this.validateDiscount(input.price, input.discountAmount);
    this.assertPhotoCapacity(0, photos.length);
    const page = await this.providerPages.requireVerifiedPage(ownerId);

    const listing = await this.prisma.listing.create({
      data: {
        ownerId,
        title: input.title,
        description: input.description ?? null,
        price: input.price,
        discountAmount: input.discountAmount ?? null,
        lat: input.lat,
        lng: input.lng,
        campus: input.campus ?? null,
        address: input.address ?? null,
        locationReference: input.locationReference ?? null,
        providerPageId: page.id,
        status: 'DRAFT',
      },
    });

    for (const photo of photos) {
      const phash = photo.buffer
        ? await this.computePhashFromBuffer(photo.buffer)
        : '';

      const dbPhoto = await this.prisma.listingPhoto.create({
        data: {
          listingId: listing.id,
          url: photo.url,
          phash: phash || '',
        },
      });

      if (phash) {
        await this.imageHashQueue.add('phash-check', {
          listingId: listing.id,
          photoId: dbPhoto.id,
          phash,
          url: photo.url,
        });
      }
    }

    return this.toResponse(listing, []);
  }

  async updateListing(
    listingId: string,
    ownerId: string,
    input: UpdateListingDto,
  ): Promise<ListingResponse> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { ownerId: true, price: true, discountAmount: true, status: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this listing');
    }
    if (!['DRAFT', 'REJECTED'].includes(listing.status)) {
      throw new ConflictException('Only draft or rejected listings can be edited');
    }

    this.validateDiscount(
      input.price ?? listing.price,
      input.discountAmount ?? listing.discountAmount ?? undefined,
    );

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        title: input.title ?? undefined,
        description: input.description ?? undefined,
        price: input.price ?? undefined,
        discountAmount: input.discountAmount ?? undefined,
        lat: input.lat ?? undefined,
        lng: input.lng ?? undefined,
        campus: input.campus ?? undefined,
        address: input.address ?? undefined,
        locationReference: input.locationReference ?? undefined,
      },
      include: this.listingInclude(),
    });

    return this.toResponse(updated, updated.photos);
  }

  async deleteListing(listingId: string, ownerId: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: {
        ownerId: true,
        status: true,
        photos: { select: { mediaId: true } },
        video: { select: { mediaId: true } },
      },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this listing');
    }

    if (listing.status !== 'DRAFT') {
      throw new ConflictException('Only draft listings can be deleted');
    }

    const mediaIds = new Set([
      ...listing.photos.map((photo) => photo.mediaId).filter((id): id is string => Boolean(id)),
      ...(listing.video?.mediaId ? [listing.video.mediaId] : []),
    ]);
    await Promise.all([...mediaIds].map((mediaId) => this.mediaService.deleteMedia(mediaId, ownerId, 'AGENT')));
    await this.prisma.listing.delete({
      where: { id: listingId },
    });
  }

  async getListing(listingId: string, viewerId?: string): Promise<ListingResponse> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: this.listingInclude(viewerId),
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (viewerId && listing.status === 'VERIFIED' && listing.ownerId !== viewerId) {
      await this.prisma.listingView.createMany({
        data: [{ userId: viewerId, listingId }],
        skipDuplicates: true,
      });
    }

    const response = this.toResponse(listing, listing.photos);
    if (viewerId && listing.status === 'VERIFIED' && listing.ownerId !== viewerId) {
      response.viewCount = await this.prisma.listingView.count({ where: { listingId } });
    }
    const signal = (await this.getProviderRankingSignals([listing.ownerId])).get(listing.ownerId);
    if (signal) {
      response.providerTrustScore = signal.trustScore;
      response.providerActiveDays = signal.activeDays;
      response.providerRecommendationCount = signal.recommendationCount;
      response.recommendationScore = signal.recommendationScore;
    }
    return response;
  }

  async searchListings(dto: SearchListingsDto, viewerId?: string): Promise<{ items: ListingResponse[]; nextCursor: string | null }> {
    const where: any = {
      status: 'VERIFIED',
    };

    if (dto.maxPrice !== undefined || dto.minPrice !== undefined) {
      where.price = {};
      if (dto.maxPrice !== undefined) where.price.lte = dto.maxPrice;
      if (dto.minPrice !== undefined) where.price.gte = dto.minPrice;
    }

    if (dto.campus) {
      where.OR = [
        { campus: { equals: dto.campus, mode: 'insensitive' } },
        { campus: { contains: dto.campus, mode: 'insensitive' } },
      ];
    }

    if (dto.lat !== undefined && dto.lng !== undefined) {
      where.AND = [
        {
          lat: {
            gte: dto.lat - 0.05,
            lte: dto.lat + 0.05,
          },
          lng: {
            gte: dto.lng - 0.05,
            lte: dto.lng + 0.05,
          },
        },
      ];
    }

    const take = dto.take !== undefined ? Math.min(dto.take, 50) : 15;

    let cursorWhere: any = {};
    if (dto.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(dto.cursor, 'base64').toString());
        if (decoded.createdAt && decoded.id) {
          cursorWhere = {
            OR: [
              { createdAt: { lt: new Date(decoded.createdAt) } },
              { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
            ],
          };
        }
      } catch {
        // Invalid cursor, ignore
      }
    }

    const listings = await this.prisma.listing.findMany({
      where: { ...where, ...cursorWhere },
      include: this.listingInclude(viewerId),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1, // Fetch one extra to detect if there's a next page
    });

    let nextCursor: string | null = null;
    if (listings.length > take) {
      const lastItem = listings[take - 1];
      nextCursor = Buffer.from(JSON.stringify({ createdAt: lastItem.createdAt.toISOString(), id: lastItem.id })).toString('base64');
      listings.pop(); // Remove the extra item
    }

    const responses = listings.map((l) => this.toResponse(l, l.photos));
    const signals = await this.getProviderRankingSignals([...new Set(responses.map((listing) => listing.ownerId))]);
    for (const listing of responses) {
      const signal = signals.get(listing.ownerId);
      if (!signal) continue;
      listing.providerTrustScore = signal.trustScore;
      listing.providerActiveDays = signal.activeDays;
      listing.providerRecommendationCount = signal.recommendationCount;
      listing.recommendationScore = signal.recommendationScore;
    }
    return {
      items: responses.sort((a, b) =>
        Number(b.followedPage) - Number(a.followedPage) ||
        b.recommendationScore - a.recommendationScore ||
        b.createdAt.getTime() - a.createdAt.getTime(),
      ),
      nextCursor,
    };
  }

  async getMyListings(userId: string): Promise<ListingResponse[]> {
    const listings = await this.prisma.listing.findMany({
      where: { ownerId: userId },
      include: this.listingInclude(),
      orderBy: { createdAt: 'desc' },
    });

    return listings.map((l) => this.toResponse(l, l.photos));
  }

  async bookmark(listingId: string, userId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('Listing not found');

    await this.prisma.bookmark.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId },
      update: {},
    });
    return { saved: true, listingId };
  }

  async unbookmark(listingId: string, userId: string) {
    await this.prisma.bookmark.deleteMany({ where: { userId, listingId } });
    return { saved: false, listingId };
  }

  async getBookmarks(userId: string): Promise<ListingResponse[]> {
    const bookmarks = await this.prisma.bookmark.findMany({
      where: { userId },
      include: { listing: { include: this.listingInclude() } },
      orderBy: { createdAt: 'desc' },
    });
    return bookmarks.map(({ listing }) => this.toResponse(listing, listing.photos));
  }

  async likeListing(listingId: string, userId: string): Promise<{ liked: true }> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, ownerId: true, status: true },
    });
    if (!listing || listing.status !== 'VERIFIED') throw new NotFoundException('Home not found');
    if (!listing || listing.status !== 'VERIFIED') throw new NotFoundException('Home not found');

    const existingLike = await this.prisma.listingLike.findUnique({
      where: { userId_listingId: { userId, listingId } },
      select: { id: true },
    });
    await this.prisma.listingLike.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId },
      update: {},
    });
    if (!existingLike && listing.ownerId !== userId) {
      const actor = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          displayName: true,
          username: true,
          profilePicture: true,
          studentProfile: { select: { profilePicture: true } },
          providerPage: { select: { profilePicture: true } },
        },
      });
      await this.notifications.enqueue(listing.ownerId, {
        type: 'LISTING_LIKED',
        title: 'Someone liked your home',
        body: 'A SafeCrib user liked your listing.',
        href: `/dashboard/listings/${encodeURIComponent(listingId)}`,
        data: {
          listingId,
          actorName: actor?.displayName,
          actorUsername: actor?.username,
          actorProfilePicture: actor?.profilePicture
            ?? actor?.studentProfile?.profilePicture
            ?? actor?.providerPage?.profilePicture,
        },
        dedupeKey: `listing-like:${listingId}:${userId}`,
      });
    }
    return { liked: true };
  }

  async unlikeListing(listingId: string, userId: string): Promise<{ liked: false }> {
    await this.prisma.listingLike.deleteMany({ where: { userId, listingId } });
    return { liked: false };
  }

  async getListingComments(listingId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, status: true },
    });
    if (!listing || listing.status !== 'VERIFIED') throw new NotFoundException('Home not found');
    return this.prisma.listingComment.findMany({
      where: { listingId },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: {
        id: true,
        body: true,
        parentId: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            role: true,
            profilePicture: true,
            studentProfile: { select: { profilePicture: true } },
            providerPage: { select: { profilePicture: true } },
          },
        },
        mentions: { select: { user: { select: { id: true, displayName: true, username: true, profilePicture: true, studentProfile: { select: { profilePicture: true } }, providerPage: { select: { profilePicture: true } } } } } },
      },
    });
  }

  async addListingComment(listingId: string, userId: string, input: CreateListingCommentDto) {
    const body = input.body?.trim() ?? '';
    if (!body) throw new BadRequestException('Write a comment');
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { id: true, ownerId: true, title: true, status: true },
    });
    if (!listing || listing.status !== 'VERIFIED') throw new NotFoundException('Home not found');
    if (input.parentId) {
      const parent = await this.prisma.listingComment.findFirst({
        where: { id: input.parentId, listingId },
        select: { id: true },
      });
      if (!parent) throw new NotFoundException('Parent comment not found on this home');
    }
    const mentionIds = [...new Set(input.mentionUserIds ?? [])].filter((id) => id !== userId);
    if (mentionIds.length) {
      const validUsers = await this.prisma.user.findMany({
        where: {
          id: { in: mentionIds },
          OR: [
            { role: 'STUDENT', studentProfile: { status: 'APPROVED' } },
            { role: { in: ['AGENT', 'LANDLORD'] }, providerPage: { verificationState: 'VERIFIED' } },
          ],
        },
        select: { id: true },
      });
      if (validUsers.length !== mentionIds.length) {
        throw new BadRequestException('One or more tagged users are unavailable');
      }
    }
    const comment = await this.prisma.listingComment.create({
      data: {
        listingId,
        userId,
        body,
        parentId: input.parentId ?? null,
        mentions: { create: mentionIds.map((mentionedUserId) => ({ userId: mentionedUserId })) },
      },
      select: {
        id: true,
        body: true,
        parentId: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            displayName: true,
            role: true,
            profilePicture: true,
            studentProfile: { select: { profilePicture: true } },
            providerPage: { select: { profilePicture: true } },
          },
        },
        mentions: { select: { user: { select: { id: true, displayName: true } } } },
      },
    });
    if (listing.ownerId !== userId) {
      const actorPhoto = comment.user.profilePicture
        ?? comment.user.studentProfile?.profilePicture
        ?? comment.user.providerPage?.profilePicture;
      await this.notifications.enqueue(listing.ownerId, {
        type: 'LISTING_COMMENT',
        title: 'New comment on your home',
        body: 'A SafeCrib user commented on your listing.',
        href: `/dashboard/listings/${encodeURIComponent(listingId)}`,
        data: {
          listingId,
          commentId: comment.id,
          actorName: comment.user.displayName,
          actorProfilePicture: actorPhoto,
        },
        dedupeKey: `listing-comment:${comment.id}:owner`,
      });
    }
    await Promise.all(mentionIds.map((mentionedUserId) => this.notifications.enqueue(mentionedUserId, {
      type: 'COMMENT_MENTION',
      title: 'You were mentioned',
      body: `You were mentioned in a comment on ${listing.title ?? 'a home'}.`,
      href: `/dashboard/listings/${encodeURIComponent(listingId)}`,
      data: {
        listingId,
        commentId: comment.id,
        actorName: comment.user.displayName,
        actorProfilePicture: comment.user.profilePicture
          ?? comment.user.studentProfile?.profilePicture
          ?? comment.user.providerPage?.profilePicture,
      },
      dedupeKey: `listing-comment:${comment.id}:mention:${mentionedUserId}`,
    })));
    return comment;
  }

  async uploadPhoto(
    listingId: string,
    ownerId: string,
    url: string,
    buffer?: Buffer,
  ): Promise<ListingResponse> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { ownerId: true, photos: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this listing');
    }

    this.assertPhotoCapacity(listing.photos.length, 1);

    const phash = buffer ? await this.computePhashFromBuffer(buffer) : '';

    const photo = await this.prisma.listingPhoto.create({
      data: {
        listingId,
        url,
        phash: phash || '',
      },
    });

    if (phash) {
      await this.imageHashQueue.add('phash-check', {
        listingId,
        photoId: photo.id,
        phash,
        url,
      });
    }

    const fullListing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: this.listingInclude(),
    });

    return this.toResponse(fullListing!, [...listing.photos, photo]);
  }

  async submitListing(listingId: string, ownerId: string): Promise<ListingResponse> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, include: this.listingInclude() });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.ownerId !== ownerId) throw new ForbiddenException('You do not own this listing');
    if (listing.status !== 'DRAFT' && listing.status !== 'REJECTED') {
      throw new ForbiddenException('Only draft or rejected listings can be submitted for verification');
    }
    if (listing.price < 1) throw new BadRequestException('Listing price must be greater than zero');
    if (!listing.address?.trim() && !listing.locationReference?.trim()) {
      throw new BadRequestException('Provide a typed address or a Google Maps location reference');
    }
    if (listing.photos.length === 0 && !listing.video) {
      throw new BadRequestException('Attach at least one photo or one video before submitting a home');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.listing.update({ where: { id: listingId }, data: { status: 'SUBMITTED' }, include: this.listingInclude() });
      await tx.auditLog.create({ data: { actorId: ownerId, action: 'LISTING_SUBMITTED', entityType: 'listing', entityId: listingId } });
      return result;
    });
    await this.notifications.enqueueAdmins({
      type: 'ADMIN_REVIEW_SUBMISSION',
      title: 'Home awaiting review',
      body: `${listing.title} was submitted for review.`,
      href: `/admin/homes/${encodeURIComponent(listingId)}`,
      data: {
        listingId,
        entityType: 'listing',
      },
      dedupeKey: `admin-review:listing:${listingId}:${updated.updatedAt.toISOString()}`,
    });
    return this.toResponse(updated, updated.photos);
  }

  async listPendingReview(): Promise<ListingResponse[]> {
    const listings = await this.prisma.listing.findMany({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } }, include: this.listingInclude(), orderBy: { updatedAt: 'asc' } });
    return listings.map((listing) => this.toResponse(listing, listing.photos));
  }

  async reviewListing(listingId: string, adminId: string, approved: boolean, notes?: string): Promise<ListingResponse> {
    const reviewNotes = notes?.trim() || null;
    if (!approved && !reviewNotes) {
      throw new BadRequestException('A rejection reason is required');
    }
    if (reviewNotes && reviewNotes.length > 2000) {
      throw new BadRequestException('The review reason must be 2,000 characters or fewer');
    }

    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, include: this.listingInclude() });
    if (!listing) throw new NotFoundException('Listing not found');
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(listing.status)) {
      throw new ForbiddenException('Only submitted listings can be reviewed');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.listing.update({ where: { id: listingId }, data: { status: approved ? 'VERIFIED' : 'REJECTED' }, include: this.listingInclude() });
      await tx.auditLog.create({ data: { actorId: adminId, action: approved ? 'LISTING_VERIFIED' : 'LISTING_REJECTED', entityType: 'listing', entityId: listingId, metadata: { notes: reviewNotes } } });
      return result;
    });
    await this.notifications.enqueue(listing.ownerId, {
      type: approved ? 'LISTING_APPROVED' : 'LISTING_REJECTED',
      title: approved ? 'Home approved' : 'Home needs changes',
      body: approved
        ? 'Your home has been approved and is now visible to students.'
        : `Your home was not approved. ${reviewNotes}`,
      href: `/page/homes/new?id=${encodeURIComponent(listingId)}`,
      data: { listingId, status: approved ? 'VERIFIED' : 'REJECTED' },
      dedupeKey: `listing-review:${listingId}:${approved ? 'approved' : 'rejected'}`,
    });
    return this.toResponse(updated, updated.photos);
  }

  private async computePhashFromBuffer(buffer: Buffer): Promise<string> {
    const { computePhash } = await import('../../domain/fraud/image-phash.js');
    return computePhash(buffer);
  }

  async attachPhotoMedia(
    listingId: string,
    ownerId: string,
    mediaId: string,
  ): Promise<ListingResponse> {
    const listing = await this.getOwnedListing(listingId, ownerId);
    const media = await this.getReadyListingMedia(mediaId, ownerId, 'LISTING_PHOTO');
    this.assertPhotoCapacity(listing.photos.length, 1);
    const access = await this.mediaService.getAccessUrl(
      media.id,
      ownerId,
      'AGENT',
      undefined,
      undefined,
    );
    const photo = await this.prisma.listingPhoto.create({
      data: { listingId, mediaId, url: access.url, phash: '' },
    });
    const updated = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: this.listingInclude(),
    });
    return this.toResponse(updated!, [...listing.photos, photo]);
  }

  async attachVideoMedia(
    listingId: string,
    ownerId: string,
    mediaId: string,
  ): Promise<ListingResponse> {
    await this.getOwnedListing(listingId, ownerId);
    const media = await this.getReadyListingMedia(mediaId, ownerId, 'LISTING_VIDEO');
    const existing = await this.prisma.listingVideo.findUnique({
      where: { listingId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        'This listing already has a video; remove it before attaching another',
      );
    }

    try {
      await this.prisma.listingVideo.create({ data: { listingId, mediaId: media.id } });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('This listing or video is already attached');
      }
      throw error;
    }
    return this.getListing(listingId);
  }

  async removePhoto(
    listingId: string,
    photoId: string,
    ownerId: string,
  ): Promise<ListingResponse> {
    await this.getOwnedListing(listingId, ownerId);
    const photo = await this.prisma.listingPhoto.findFirst({
      where: { id: photoId, listingId },
      select: { id: true, mediaId: true },
    });
    if (!photo) throw new NotFoundException('Listing photo not found');
    await this.prisma.listingPhoto.delete({ where: { id: photoId } });
    if (photo.mediaId) await this.mediaService.deleteMedia(photo.mediaId, ownerId, 'AGENT');
    return this.getListing(listingId);
  }

  async removeVideo(listingId: string, ownerId: string): Promise<ListingResponse> {
    await this.getOwnedListing(listingId, ownerId);
    const video = await this.prisma.listingVideo.findUnique({
      where: { listingId },
      select: { mediaId: true },
    });
    if (video) {
      await this.prisma.listingVideo.delete({ where: { listingId } });
      await this.mediaService.deleteMedia(video.mediaId, ownerId, 'AGENT');
    }
    return this.getListing(listingId);
  }

  private async getOwnedListing(listingId: string, ownerId: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { photos: true },
    });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this listing');
    }
    return listing;
  }

  private async getReadyListingMedia(
    mediaId: string,
    ownerId: string,
    purpose: MediaPurpose,
  ) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) throw new NotFoundException('Media not found');
    if (media.ownerId !== ownerId) throw new ForbiddenException('You do not own this media');
    if (media.purpose !== purpose) {
      throw new BadRequestException(`Media must have purpose ${purpose}`);
    }
    if (media.status !== 'READY') {
      throw new BadRequestException('Wait for the upload to finish before attaching this media');
    }
    return media;
  }

  private assertPhotoCapacity(currentCount: number, additionalCount: number): void {
    if (currentCount + additionalCount > 5) {
      throw new ConflictException('A listing can have no more than 5 photos');
    }
  }

  private validateDiscount(price: number, discountAmount?: number): void {
    if (discountAmount !== undefined && discountAmount > price) {
      throw new BadRequestException('Discount amount cannot exceed the listing price');
    }
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private listingInclude(viewerId?: string): Prisma.ListingInclude {
    return {
      photos: {
        include: {
          media: { select: { id: true, width: true, height: true } },
        },
      },
      video: { include: { media: { select: { id: true, durationSec: true, width: true, height: true } } } },
      _count: { select: { likes: true, views: true, comments: true, bookmarks: true } },
      owner: {
        select: {
          id: true,
          displayName: true,
          username: true,
          profilePicture: true,
          email: true,
          studentProfile: { select: { displayName: true, profilePicture: true } },
          providerPage: { select: { displayName: true, phone: true, additionalContacts: true } },
          verification: { select: { badgeColor: true } },
        },
      },
      providerPage: {
        select: {
          displayName: true,
          phone: true,
          additionalContacts: true,
          ...(viewerId ? { followers: { where: { followerId: viewerId }, select: { followerId: true }, take: 1 } } : {}),
        },
      },
      ...(viewerId ? { likes: { where: { userId: viewerId }, select: { id: true }, take: 1 } } : {}),
      ...(viewerId ? { bookmarks: { where: { userId: viewerId }, select: { id: true }, take: 1 } } : {}),
      bookings: {
        where: {
          OR: [
            { status: 'BOOKED' },
            { status: 'HELD', holdExpiresAt: { gt: new Date() } },
          ],
        },
        select: { id: true },
        take: 1,
      },
    };
  }

  private toResponse(listing: any, photos: any[]): ListingResponse {
    const owner = listing.owner;
    const providerPage = listing.providerPage;
    const studentProfile = owner?.studentProfile;
    const verification = owner?.verification;
    
    const ownerDisplayName = owner?.displayName ?? studentProfile?.displayName ?? providerPage?.displayName ?? null;
    const ownerProfilePicture = owner?.profilePicture ?? studentProfile?.profilePicture ?? providerPage?.profilePicture ?? null;
    const ownerPhone = providerPage?.phone ?? null;
    const additionalContacts = providerPage?.additionalContacts as Record<string, string> | null;
    const whatsApp = additionalContacts?.['whatsApp'] ?? additionalContacts?.['whatsapp'] ?? null;
    const agencyName = providerPage?.displayName ?? null;
    const badgeColor = verification?.badgeColor ?? 'green';
    const verificationStage = verification?.stage ?? 'PROFILE_VERIFIED';

    return {
      id: listing.id,
      title: listing.title,
      description: listing.description ?? null,
      price: listing.price,
      discountAmount: listing.discountAmount ?? null,
      discountedPrice: listing.price - (listing.discountAmount ?? 0),
      lat: listing.lat,
      lng: listing.lng,
      campus: listing.campus ?? null,
      address: listing.address ?? null,
      locationReference: listing.locationReference ?? null,
      status: listing.status,
      availabilityStatus:
        listing.status === 'SOLD' || (listing.bookings?.length ?? 0) > 0
          ? 'SECURED'
          : 'AVAILABLE',
      ownerId: listing.ownerId,
      owner: {
        id: owner?.id ?? listing.ownerId,
        displayName: ownerDisplayName,
        profilePicture: ownerProfilePicture,
        phone: ownerPhone,
        whatsApp,
        agencyName,
        verification: {
          stage: verificationStage,
          badgeColor,
        },
      },
      bedrooms: listing.bedrooms ?? null,
      bathrooms: listing.bathrooms ?? null,
      propertyType: listing.propertyType ?? null,
      likeCount: listing._count?.likes ?? 0,
      likedByCurrentUser: Boolean(listing.likes?.length),
      commentCount: listing._count?.comments ?? 0,
      shareCount: listing._count?.bookmarks ?? 0,
      isBookmarked: Boolean(listing.bookmarks?.length),
      providerTrustScore: 0,
      providerActiveDays: 0,
      providerRecommendationCount: 0,
      recommendationScore: 0,
      viewCount: listing._count?.views ?? 0,
      followedPage: Boolean(providerPage?.followers?.length),
      photos: photos.map((p) => ({
        id: p.id,
        mediaId: p.mediaId ?? null,
        url: p.url,
        phash: p.phash,
        width: p.media?.width ?? null,
        height: p.media?.height ?? null,
      })),
      video: listing.video
        ? {
            mediaId: listing.video.mediaId,
            durationSec: listing.video.media?.durationSec ?? null,
            width: listing.video.media?.width ?? null,
            height: listing.video.media?.height ?? null,
          }
        : null,
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
    };
  }

  private async getProviderRankingSignals(providerIds: string[]) {
    const signals = new Map<string, {
      trustScore: number;
      activeDays: number;
      recommendationCount: number;
      recommendationScore: number;
    }>();
    if (providerIds.length === 0) return signals;

    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 29);
    cutoff.setUTCHours(0, 0, 0, 0);
    const [providers, activityDays] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: providerIds } },
        select: {
          id: true,
          trustScore: true,
          _count: { select: { recommendationsReceived: true } },
        },
      }),
      this.prisma.providerActivityDay.groupBy({
        by: ['providerId'],
        where: { providerId: { in: providerIds }, activeDate: { gte: cutoff } },
        _count: { _all: true },
      }),
    ]);
    const activityByProvider = new Map(activityDays.map((row) => [row.providerId, row._count._all]));
    for (const provider of providers) {
      const trustScore = Number(provider.trustScore ?? 50);
      const activeDays = activityByProvider.get(provider.id) ?? 0;
      const recommendationCount = provider._count.recommendationsReceived;
      const recommendationScore = computeProviderRecommendationScore({
        trustScore,
        activeDays,
        recommendationCount,
      });
      signals.set(provider.id, { trustScore, activeDays, recommendationCount, recommendationScore });
    }
    return signals;
  }
}
