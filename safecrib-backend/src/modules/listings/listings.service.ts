import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { IMAGE_HASH_QUEUE } from '../../infra/queue/queue.constants.js';
import type { UpdateListingDto } from './dto/listing.dto.js';
import type { SearchListingsDto } from './dto/listing.dto.js';
import type { ListingResponse } from './dto/listing.dto.js';
import type { Role } from '../../common/roles.decorator.js';
import { ProviderPagesService } from '../provider-pages/provider-pages.service.js';

export interface CreateListingInput {
  title: string;
  description?: string;
  price: number;
  lat: number;
  lng: number;
  campus?: string;
  address?: string;
}

export interface PhotoInput {
  url: string;
  buffer?: Buffer;
}

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(IMAGE_HASH_QUEUE) private readonly imageHashQueue: Queue,
    private readonly providerPages: ProviderPagesService,
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
    const page = await this.providerPages.requireVerifiedPage(ownerId);

    const listing = await this.prisma.listing.create({
      data: {
        ownerId,
        title: input.title,
        description: input.description ?? null,
        price: input.price,
        lat: input.lat,
        lng: input.lng,
        campus: input.campus ?? null,
        address: input.address ?? null,
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
      select: { ownerId: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this listing');
    }

    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: {
        title: input.title ?? undefined,
        description: input.description ?? undefined,
        price: input.price ?? undefined,
        lat: input.lat ?? undefined,
        lng: input.lng ?? undefined,
        campus: input.campus ?? undefined,
        address: input.address ?? undefined,
      },
      include: { photos: true },
    });

    return this.toResponse(updated, updated.photos);
  }

  async deleteListing(listingId: string, ownerId: string): Promise<void> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      select: { ownerId: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.ownerId !== ownerId) {
      throw new ForbiddenException('You do not own this listing');
    }

    await this.prisma.listing.delete({
      where: { id: listingId },
    });
  }

  async getListing(listingId: string): Promise<ListingResponse> {
    const listing = await this.prisma.listing.findUnique({
      where: { id: listingId },
      include: { photos: true },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    return this.toResponse(listing, listing.photos);
  }

  async searchListings(dto: SearchListingsDto): Promise<ListingResponse[]> {
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

    const listings = await this.prisma.listing.findMany({
      where,
      include: { photos: true },
      orderBy: { createdAt: 'desc' },
    });

    return listings.map((l) => this.toResponse(l, l.photos));
  }

  async getMyListings(userId: string): Promise<ListingResponse[]> {
    const listings = await this.prisma.listing.findMany({
      where: { ownerId: userId },
      include: { photos: true },
      orderBy: { createdAt: 'desc' },
    });

    return listings.map((l) => this.toResponse(l, l.photos));
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
      include: { photos: true },
    });

    return this.toResponse(fullListing!, [...listing.photos, photo]);
  }

  async submitListing(listingId: string, ownerId: string): Promise<ListingResponse> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, include: { photos: true } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.ownerId !== ownerId) throw new ForbiddenException('You do not own this listing');
    if (listing.status !== 'DRAFT' && listing.status !== 'REJECTED') {
      throw new ForbiddenException('Only draft or rejected listings can be submitted for verification');
    }
    if (listing.photos.length === 0) throw new ForbiddenException('Upload at least one photo before submitting a home');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.listing.update({ where: { id: listingId }, data: { status: 'SUBMITTED' }, include: { photos: true } });
      await tx.auditLog.create({ data: { actorId: ownerId, action: 'LISTING_SUBMITTED', entityType: 'listing', entityId: listingId } });
      return result;
    });
    return this.toResponse(updated, updated.photos);
  }

  async listPendingReview(): Promise<ListingResponse[]> {
    const listings = await this.prisma.listing.findMany({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } }, include: { photos: true }, orderBy: { updatedAt: 'asc' } });
    return listings.map((listing) => this.toResponse(listing, listing.photos));
  }

  async reviewListing(listingId: string, adminId: string, approved: boolean, notes?: string): Promise<ListingResponse> {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, include: { photos: true } });
    if (!listing) throw new NotFoundException('Listing not found');
    if (!['SUBMITTED', 'UNDER_REVIEW'].includes(listing.status)) {
      throw new ForbiddenException('Only submitted listings can be reviewed');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.listing.update({ where: { id: listingId }, data: { status: approved ? 'VERIFIED' : 'REJECTED' }, include: { photos: true } });
      await tx.auditLog.create({ data: { actorId: adminId, action: approved ? 'LISTING_VERIFIED' : 'LISTING_REJECTED', entityType: 'listing', entityId: listingId, metadata: { notes } } });
      return result;
    });
    return this.toResponse(updated, updated.photos);
  }

  private async computePhashFromBuffer(buffer: Buffer): Promise<string> {
    const { computePhash } = await import('../../domain/fraud/image-phash.js');
    return computePhash(buffer);
  }

  private toResponse(listing: any, photos: any[]): ListingResponse {
    return {
      id: listing.id,
      title: listing.title,
      description: listing.description ?? null,
      price: listing.price,
      lat: listing.lat,
      lng: listing.lng,
      campus: listing.campus ?? null,
      address: listing.address ?? null,
      status: listing.status,
      ownerId: listing.ownerId,
      photos: photos.map((p) => ({
        url: p.url,
        phash: p.phash,
      })),
      createdAt: listing.createdAt,
      updatedAt: listing.updatedAt,
    };
  }
}
