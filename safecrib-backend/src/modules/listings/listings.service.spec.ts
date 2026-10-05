import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ListingsService } from './listings.service.js';

type ListingVideoMock = {
  mediaId: string;
  media: { id: string; durationSec: number };
};

function makeListing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'listing_1',
    ownerId: 'agent_1',
    title: 'Near campus room',
    description: null,
    price: 50000,
    discountAmount: null,
    lat: 9.0765,
    lng: 7.3986,
    campus: null,
    address: '123 Campus Road',
    locationReference: null,
    status: 'DRAFT',
    createdAt: new Date(),
    updatedAt: new Date(),
    photos: [],
    video: null as ListingVideoMock | null,
    bookings: [],
    ...overrides,
  };
}

type ListingMock = ReturnType<typeof makeListing>;

function makeService() {
  const transactionListing: ListingMock = makeListing({ status: 'SUBMITTED' });
  const tx = {
    listing: { update: vi.fn(async () => transactionListing) },
    auditLog: { create: vi.fn(async () => ({})) },
  };
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        displayName: 'Student',
        profilePicture: 'student-photo',
        studentProfile: null,
        providerPage: null,
      }),
    },
    listing: {
      create: vi.fn(async () => makeListing()),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    listingPhoto: { create: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    listingVideo: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
    listingLike: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    listingComment: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: { listingId: string; userId: string; body: string } }) => ({
        id: 'comment_1',
        ...data,
        createdAt: new Date(),
        user: {
          id: data.userId,
          displayName: 'Student',
          profilePicture: 'student-photo',
          studentProfile: null,
          providerPage: null,
        },
      })),
    },
    media: { findUnique: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const providerPages = { requireVerifiedPage: vi.fn(async () => ({ id: 'page_1' })) };
  const mediaService = {
    getAccessUrl: vi.fn(async () => ({ url: 'https://cdn.example/photo.jpg' })),
    deleteMedia: vi.fn(async () => {}),
  };
  const queue = { add: vi.fn(async () => {}) };
  const notifications = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const service = new ListingsService(prisma as never, queue as never, providerPages as never, mediaService as never, notifications as never);
  return { service, prisma, providerPages, mediaService, notifications, tx, transactionListing };
}

describe('ListingsService listing media and pricing rules', () => {
  it('prevents listing owners from liking their own home', async () => {
    const { service, prisma } = makeService();
    prisma.listing.findUnique.mockResolvedValueOnce({ id: 'listing_1', ownerId: 'agent_1', status: 'VERIFIED' });

    await expect(service.likeListing('listing_1', 'agent_1')).rejects.toThrow('You cannot like your own home');
    expect(prisma.listingLike.upsert).not.toHaveBeenCalled();
  });

  it('stores a trimmed comment on a verified home', async () => {
    const { service, prisma, notifications } = makeService();
    prisma.listing.findUnique.mockResolvedValueOnce({ id: 'listing_1', ownerId: 'agent_1', title: 'A nice home', status: 'VERIFIED' });

    const comment = await service.addListingComment('listing_1', 'student_1', { body: '  Is this available?  ' });

    expect(prisma.listingComment.create).toHaveBeenCalledWith({
      data: {
        listingId: 'listing_1',
        userId: 'student_1',
        body: 'Is this available?',
        gifUrl: null,
        parentId: null,
        mentions: { create: [] },
      },
      select: expect.objectContaining({ body: true, gifUrl: true, parentId: true }),
    });
    expect(comment.body).toBe('Is this available?');
    expect(notifications.enqueue).toHaveBeenCalledWith('agent_1', expect.objectContaining({
      type: 'LISTING_COMMENT',
      data: expect.objectContaining({
        actorName: 'Student',
        actorProfilePicture: 'student-photo',
      }),
    }));
  });

  it('includes the liker profile picture in the home notification', async () => {
    const { service, prisma, notifications } = makeService();
    prisma.listing.findUnique.mockResolvedValueOnce({ id: 'listing_1', ownerId: 'agent_1', status: 'VERIFIED' });

    await service.likeListing('listing_1', 'student_1');

    expect(notifications.enqueue).toHaveBeenCalledWith('agent_1', expect.objectContaining({
      type: 'LISTING_LIKED',
      data: expect.objectContaining({
        actorName: 'Student',
        actorProfilePicture: 'student-photo',
      }),
    }));
  });

  it('rejects a discount greater than the listing price', async () => {
    const { service, providerPages } = makeService();

    await expect(
      service.createListing('agent_1', 'AGENT', {
        title: 'Near campus room',
        price: 50000,
        discountAmount: 50001,
        lat: 9.0765,
        lng: 7.3986,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(providerPages.requireVerifiedPage).not.toHaveBeenCalled();
  });

  it('rejects more than five photos on initial listing creation', async () => {
    const { service, providerPages } = makeService();

    await expect(
      service.createListing(
        'agent_1',
        'AGENT',
        { title: 'Near campus room', price: 50000, lat: 9.0765, lng: 7.3986 },
        Array.from({ length: 6 }, (_, index) => ({ url: `https://cdn.example/${index}.jpg` })),
      ),
    ).rejects.toThrow(ConflictException);
    expect(providerPages.requireVerifiedPage).not.toHaveBeenCalled();
  });

  it('deletes a draft and schedules deletion of its attached media', async () => {
    const { service, prisma, mediaService } = makeService();
    prisma.listing.findUnique.mockResolvedValueOnce({
      ownerId: 'agent_1',
      status: 'DRAFT',
      photos: [{ mediaId: 'photo_media' }, { mediaId: null }],
      video: { mediaId: 'video_media' },
    });

    await service.deleteListing('listing_1', 'agent_1');

    expect(mediaService.deleteMedia).toHaveBeenCalledTimes(2);
    expect(mediaService.deleteMedia).toHaveBeenCalledWith('photo_media', 'agent_1', 'AGENT');
    expect(mediaService.deleteMedia).toHaveBeenCalledWith('video_media', 'agent_1', 'AGENT');
    expect(prisma.listing.delete).toHaveBeenCalledWith({ where: { id: 'listing_1' } });
  });

  it('refuses to delete listings that are not drafts', async () => {
    const { service, prisma, mediaService } = makeService();
    prisma.listing.findUnique.mockResolvedValueOnce({
      ownerId: 'agent_1',
      status: 'VERIFIED',
      photos: [],
      video: null,
    });

    await expect(service.deleteListing('listing_1', 'agent_1')).rejects.toThrow(
      ConflictException,
    );
    expect(mediaService.deleteMedia).not.toHaveBeenCalled();
    expect(prisma.listing.delete).not.toHaveBeenCalled();
  });

  it('refuses to update listings that are not drafts or rejected', async () => {
    const { service, prisma } = makeService();
    prisma.listing.findUnique.mockResolvedValueOnce({
      ownerId: 'agent_1',
      price: 50000,
      discountAmount: null,
      status: 'VERIFIED',
    });

    await expect(service.updateListing('listing_1', 'agent_1', { title: 'Changed home' })).rejects.toThrow(
      ConflictException,
    );
    expect(prisma.listing.update).not.toHaveBeenCalled();
  });

  it('allows submission with a video and location even when there are no photos', async () => {
    const { service, prisma, transactionListing } = makeService();
    transactionListing.video = {
      mediaId: 'media_video',
      media: { id: 'media_video', durationSec: 30 },
    };
    prisma.listing.findUnique.mockResolvedValueOnce(
      
      makeListing({ video: { mediaId: 'media_video', media: { id: 'media_video', durationSec: 30 } } }),
    );

    const result = await service.submitListing('listing_1', 'agent_1');

    expect(result.status).toBe('SUBMITTED');
    expect(result.video?.mediaId).toBe('media_video');
  });

  it('rejects submission without either media type or a location description', async () => {
    const { service, prisma } = makeService();
    prisma.listing.findUnique.mockResolvedValueOnce(makeListing({ address: null }));

    await expect(service.submitListing('listing_1', 'agent_1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('does not allow attaching a second video to a listing', async () => {
    const { service, prisma } = makeService();
    prisma.listing.findUnique.mockResolvedValueOnce(makeListing());
    prisma.media.findUnique.mockResolvedValueOnce({
      id: 'media_video_2',
      ownerId: 'agent_1',
      purpose: 'LISTING_VIDEO',
      status: 'READY',
    });
    prisma.listingVideo.findUnique.mockResolvedValueOnce({ id: 'listing_video_1' });

    await expect(
      service.attachVideoMedia('listing_1', 'agent_1', 'media_video_2'),
    ).rejects.toThrow(ConflictException);
    expect(prisma.listingVideo.create).not.toHaveBeenCalled();
  });
});