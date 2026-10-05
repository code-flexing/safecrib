import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MediaService } from './media.service.js';
import type { StorageProvider, UploadSignatureResult } from '../providers/storage-provider.interface.js';
import type { MediaRepository } from '../media.repository.js';
import type { MediaPolicyService } from './media-policy.service.js';
import type { MediaPathBuilder } from './media-path-builder.service.js';
import type { Queue } from 'bullmq';
import type { Media } from '@prisma/client';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMedia(overrides: Partial<Media> = {}): Media {
  return {
    id: 'media_1',
    ownerId: 'user_1',
    purpose: 'LISTING_PHOTO',
    resourceType: 'IMAGE',
    deliveryType: 'UPLOAD',
    publicId: 'prod/listings/photo/l1/uuid',
    assetId: null,
    version: null,
    format: null,
    bytes: null,
    width: null,
    height: null,
    durationSec: null,
    etag: null,
    status: 'PENDING',
    failureReason: null,
    idempotencyKey: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    readyAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function makeStorage(): StorageProvider {
  return {
    createUploadSignature: vi.fn((): UploadSignatureResult => ({
      uploadUrl: 'https://api.cloudinary.com/v1_1/cloud/image/upload',
      signature: 'sig',
      timestamp: 1000,
      apiKey: 'key',
      cloudName: 'cloud',
      publicId: 'prod/users/avatar/u1/uuid',
      folder: 'prod/users/avatar/u1',
      uploadPreset: 'sc_avatar',
      expiresAt: 1600,
      extra: {},
    })),
    getDeliveryUrl: vi.fn(() => 'https://res.cloudinary.com/cloud/image/upload/prod/p.jpg'),
    getSignedUrl: vi.fn(() => 'https://res.cloudinary.com/cloud/image/authenticated/sign.jpg'),
    deleteAsset: vi.fn(async () => ({ result: 'ok' })),
    uploadAsset: vi.fn(async () => ({
      publicId: 'prod/users/avatar/u1/uuid',
      url: 'https://res.cloudinary.com/cloud/image/upload/prod/users/avatar/u1/uuid.jpg',
      assetId: 'a1b2c3d4e5f6789012345678901234ab',
      format: 'jpg',
      bytes: 204800,
      width: 200,
      height: 200,
      durationSec: null,
      etag: 'etag_abc',
    })),
    verifyWebhook: vi.fn(() => ({ valid: true })),
    verifyUploadResponseSignature: vi.fn(() => true),
  };
}

function makeRepo(media: Media | null = null): MediaRepository {
  return {
    create: vi.fn(async (input: any) =>
      makeMedia({
        status: input?.status ?? 'PENDING',
        purpose: input?.purpose,
        resourceType: input?.resourceType,
        deliveryType: input?.deliveryType,
        publicId: input?.publicId,
      }),
    ),
    findById: vi.fn(async () => media),
    findByPublicId: vi.fn(async () => media),
    findByIdempotencyKey: vi.fn(async () => null),
    findPendingForOwner: vi.fn(async () => (media?.status === 'PENDING' ? [media] : [])),
    markReady: vi.fn(async (id: string) => makeMedia({ id, status: 'READY', readyAt: new Date() })),
    markFailed: vi.fn(async (id: string) => makeMedia({ id, status: 'FAILED' })),
    markDeleting: vi.fn(async (id: string) => makeMedia({ id, status: 'DELETING' })),
    markDeleted: vi.fn(async (id: string) => makeMedia({ id, status: 'DELETED' })),
    countPendingForUser: vi.fn(async () => 0),
    attach: vi.fn(),
    findAttachments: vi.fn(async () => []),
    logAccess: vi.fn(async () => {}),
    findStaleOrphans: vi.fn(async () => []),
    findDeletingRecords: vi.fn(async () => []),
  } as unknown as MediaRepository;
}

function makePolicy(): MediaPolicyService {
  return {
    validateUploadRequest: vi.fn(async () => ({
      purpose: 'LISTING_PHOTO',
      resourceType: 'IMAGE',
      deliveryType: 'UPLOAD',
      allowedMimeTypes: ['image/jpeg'],
      maxBytes: 15 * 1024 * 1024,
      maxPendingPerUser: 20,
      label: 'Listing photo',
    })),
    validateTransformation: vi.fn((t?: string) => t),
    requiresSignedUrl: vi.fn(() => false),
    assertCanRead: vi.fn(),
    getPolicy: vi.fn(),
  } as unknown as MediaPolicyService;
}

function makePathBuilder(): MediaPathBuilder {
  return {
    buildPublicId: vi.fn(() => 'prod/listings/photo/l1/new-uuid'),
    buildFolder: vi.fn(() => 'prod/listings/photo/l1'),
    uploadPresetName: vi.fn(() => 'sc_photo'),
  } as unknown as MediaPathBuilder;
}

function makeQueue(): Queue {
  return { add: vi.fn(async () => {}) } as unknown as Queue;
}

function makeService(overrides: {
  storage?: StorageProvider;
  repo?: MediaRepository;
  policy?: MediaPolicyService;
  path?: MediaPathBuilder;
  webhookQueue?: Queue;
  deletionQueue?: Queue;
} = {}): MediaService {
  const service = new MediaService(
    overrides.storage ?? makeStorage(),
    overrides.repo ?? makeRepo(),
    overrides.path ?? makePathBuilder(),
    overrides.policy ?? makePolicy(),
    overrides.webhookQueue ?? makeQueue(),
    overrides.deletionQueue ?? makeQueue(),
  );
  return service;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MediaService', () => {
  describe('requestUploadSignature', () => {
    it('creates a PENDING media record and returns the explicit upload contract', async () => {
      const repo = makeRepo();
      const storage = makeStorage();
      const svc = makeService({ repo, storage });

      const result = await svc.requestUploadSignature('user_1', {
        purpose: 'LISTING_PHOTO',
        contentType: 'image/jpeg',
        sizeBytes: 1024 * 1024,
      });

      expect(repo.create).toHaveBeenCalledOnce();
      expect(storage.createUploadSignature).toHaveBeenCalledWith(
        expect.objectContaining({
          publicId: 'uuid',
          folder: 'prod/listings/photo/user_1',
          resourceType: 'image',
        }),
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ publicId: 'prod/listings/photo/user_1/uuid' }),
      );
      expect(result.uploadUrl).toBe('https://api.cloudinary.com/v1_1/cloud/image/upload');
      expect(result.media).toEqual({
        id: 'media_1',
        resourceType: 'image',
        status: 'PENDING',
      });
      expect(result.media.status).toBe('PENDING');
      expect(Object.keys(result.uploadPayload)).toEqual([
        'api_key',
        'timestamp',
        'signature',
        'public_id',
        'folder',
        'upload_preset',
        'context',
      ]);
      expect(result.uploadPayload.context).toBe('purpose=LISTING_PHOTO|owner=user_1');
      expect(JSON.stringify(result)).not.toContain('cloud_name');
      expect(JSON.stringify(result)).not.toContain('expires_at');
    });

    it('calls policy validation before creating record', async () => {
      const policy = makePolicy();
      const svc = makeService({ policy });

      await svc.requestUploadSignature('user_1', {
        purpose: 'AVATAR',
        contentType: 'image/jpeg',
        sizeBytes: 512,
      });

      expect(policy.validateUploadRequest).toHaveBeenCalledWith(
        'user_1',
        'AVATAR',
        'image/jpeg',
        512,
      );
    });
  });

  describe('uploadAsset', () => {
    const avatarPolicy = {
      purpose: 'AVATAR' as const,
      resourceType: 'IMAGE' as const,
      deliveryType: 'UPLOAD' as const,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxBytes: 5 * 1024 * 1024,
      maxPendingPerUser: 2,
      label: 'Profile avatar',
    };

    it('uploads via storage and returns a READY media record with the URL', async () => {
      const storage = makeStorage();
      const policy = makePolicy();
      vi.mocked(policy.getPolicy).mockReturnValue(avatarPolicy);
      const repo = makeRepo();
      const path = makePathBuilder();
      const svc = makeService({ storage, repo, policy, path });

      const file = {
        buffer: Buffer.from('img'),
        mimetype: 'image/jpeg',
        size: 1024,
      } as unknown as Express.Multer.File;

      const result = await svc.uploadAsset('user_1', 'AVATAR', file);

      expect(storage.uploadAsset).toHaveBeenCalledWith(
        file.buffer,
        'image/jpeg',
        expect.objectContaining({
          publicId: 'new-uuid',
          folder: 'prod/listings/photo/l1',
          resourceType: 'image',
        }),
      );
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ purpose: 'AVATAR', status: 'READY' }),
      );
      expect(result.media.status).toBe('READY');
      expect(result.url).toContain('res.cloudinary.com');
    });

    it('returns only a temporary signed URL for proof-of-license uploads', async () => {
      const storage = makeStorage();
      const policy = makePolicy();
      vi.mocked(policy.getPolicy).mockReturnValue({
        purpose: 'PROOF_OF_LICENSE',
        resourceType: 'IMAGE',
        deliveryType: 'AUTHENTICATED',
        allowedMimeTypes: ['application/pdf'],
        maxBytes: 10 * 1024 * 1024,
        maxPendingPerUser: 3,
        label: 'Proof of license',
      });
      vi.mocked(policy.requiresSignedUrl).mockReturnValue(true);
      const svc = makeService({ storage, policy });
      const file = {
        buffer: Buffer.from('pdf'),
        mimetype: 'application/pdf',
        size: 3,
      } as unknown as Express.Multer.File;

      const result = await svc.uploadAsset('user_1', 'PROOF_OF_LICENSE', file);

      expect(storage.uploadAsset).toHaveBeenCalledWith(
        file.buffer,
        'application/pdf',
        expect.objectContaining({ deliveryType: 'authenticated' }),
      );
      expect(storage.getSignedUrl).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ deliveryType: 'authenticated', ttlSeconds: 300 }),
      );
      expect(result.url).toContain('/authenticated/');
      expect(result.url).not.toContain('/upload/');
      expect(result.expiresAt).toBeDefined();
    });

    it('throws BadRequestException when no file buffer is provided', async () => {
      const svc = makeService();
      await expect(
        svc.uploadAsset('user_1', 'AVATAR', undefined as unknown as Express.Multer.File),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for a disallowed mimetype', async () => {
      const policy = makePolicy();
      vi.mocked(policy.getPolicy).mockReturnValue(avatarPolicy);
      const svc = makeService({ policy });

      const file = {
        buffer: Buffer.from('x'),
        mimetype: 'application/exe',
        size: 10,
      } as unknown as Express.Multer.File;

      await expect(svc.uploadAsset('user_1', 'AVATAR', file)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for a file over the size limit', async () => {
      const policy = makePolicy();
      vi.mocked(policy.getPolicy).mockReturnValue({ ...avatarPolicy, maxBytes: 100 });
      const svc = makeService({ policy });

      const file = {
        buffer: Buffer.alloc(200),
        mimetype: 'image/jpeg',
        size: 200,
      } as unknown as Express.Multer.File;

      await expect(svc.uploadAsset('user_1', 'AVATAR', file)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('listPendingUploads', () => {
    it('returns the stable media ID and current pending status', async () => {
      const pendingMedia = makeMedia({ id: 'stable_media_id', status: 'PENDING' });
      const svc = makeService({ repo: makeRepo(pendingMedia) });

      const result = await svc.listPendingUploads('user_1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({ id: 'stable_media_id', status: 'PENDING' }),
      );
    });
  });

  describe('confirmUpload', () => {
    it('marks media READY for a PENDING upload', async () => {
      const pendingMedia = makeMedia({ status: 'PENDING' });
      const repo = makeRepo(pendingMedia);
      const svc = makeService({ repo });

      const result = await svc.confirmUpload('media_1', 'user_1', {
        assetId: 'asset_abc',
        version: 1726780800,
        format: 'jpg',
        bytes: 204800,
      });

      expect(repo.markReady).toHaveBeenCalledOnce();
      expect(result.status).toBe('READY');
    });

    it('is idempotent when media is already READY', async () => {
      const readyMedia = makeMedia({ status: 'READY' });
      const repo = makeRepo(readyMedia);
      const svc = makeService({ repo });

      const result = await svc.confirmUpload('media_1', 'user_1', {});

      expect(repo.markReady).not.toHaveBeenCalled();
      expect(result.status).toBe('READY');
    });

    it('throws ForbiddenException when wrong user tries to confirm', async () => {
      const media = makeMedia({ ownerId: 'user_1', status: 'PENDING' });
      const svc = makeService({ repo: makeRepo(media) });

      await expect(svc.confirmUpload('media_1', 'user_OTHER', {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when media is in FAILED status', async () => {
      const media = makeMedia({ status: 'FAILED' });
      const svc = makeService({ repo: makeRepo(media) });

      await expect(svc.confirmUpload('media_1', 'user_1', {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when media not found', async () => {
      const svc = makeService({ repo: makeRepo(null) });

      await expect(svc.confirmUpload('media_1', 'user_1', {})).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('completeUpload', () => {
    const uploadResponse = {
      asset_id: 'asset_abc',
      public_id: 'prod/listings/photo/l1/uuid',
      resource_type: 'image' as const,
      version: 1726780800,
      signature: 'valid-cloudinary-signature',
    };

    it('marks the original pending media record READY after signature verification', async () => {
      const repo = makeRepo(makeMedia({ status: 'PENDING' }));
      const storage = makeStorage();
      const svc = makeService({ repo, storage });

      const result = await svc.completeUpload('media_1', 'user_1', uploadResponse);

      expect(storage.verifyUploadResponseSignature).toHaveBeenCalledWith({
        publicId: uploadResponse.public_id,
        version: uploadResponse.version,
        signature: uploadResponse.signature,
      });
      expect(repo.markReady).toHaveBeenCalledWith('media_1', expect.objectContaining({
        assetId: uploadResponse.asset_id,
        version: BigInt(uploadResponse.version),
      }));
      expect(result).toEqual({ media: { id: 'media_1', status: 'READY' } });
    });

    it('returns READY idempotently if the webhook already completed this record', async () => {
      const repo = makeRepo(makeMedia({ status: 'READY', assetId: uploadResponse.asset_id }));
      const svc = makeService({ repo });

      await expect(svc.completeUpload('media_1', 'user_1', uploadResponse)).resolves.toEqual({
        media: { id: 'media_1', status: 'READY' },
      });
      expect(repo.markReady).not.toHaveBeenCalled();
    });

    it('returns READY immediately for an already-completed record even when a stale public_id is resent', async () => {
      const repo = makeRepo(makeMedia({
        status: 'READY',
        assetId: uploadResponse.asset_id,
        publicId: 'prod/listings/photo/l1/original',
      }));
      const svc = makeService({ repo });

      await expect(svc.completeUpload('media_1', 'user_1', {
        ...uploadResponse,
        public_id: 'prod/listings/photo/l1/another-uuid',
      })).resolves.toEqual({
        media: { id: 'media_1', status: 'READY' },
      });
      expect(repo.markReady).not.toHaveBeenCalled();
    });

    it('looks up by SafeCrib media ID and reports a public_id mismatch without completing', async () => {
      const repo = makeRepo(makeMedia());
      const svc = makeService({ repo });

      await expect(svc.completeUpload('media_1', 'user_1', {
        ...uploadResponse,
        public_id: 'another/public-id',
      })).rejects.toThrow('Cloudinary public_id does not match the stored media record');
      expect(repo.findById).toHaveBeenCalledWith('media_1');
      expect(repo.markReady).not.toHaveBeenCalled();
    });

    it('normalizes the stored resource type before completing', async () => {
      const repo = makeRepo(makeMedia({ resourceType: 'video' as Media['resourceType'] }));
      const svc = makeService({ repo });

      await expect(svc.completeUpload('media_1', 'user_1', {
        ...uploadResponse,
        resource_type: 'video',
      })).resolves.toEqual({ media: { id: 'media_1', status: 'READY' } });
      expect(repo.markReady).toHaveBeenCalled();
    });

    it('reports a resource_type mismatch without completing', async () => {
      const repo = makeRepo(makeMedia());
      const svc = makeService({ repo });

      await expect(svc.completeUpload('media_1', 'user_1', {
        ...uploadResponse,
        resource_type: 'video',
      })).rejects.toThrow('Cloudinary resource_type does not match the stored media record');
      expect(repo.markReady).not.toHaveBeenCalled();
    });

    it('rejects an invalid Cloudinary response signature', async () => {
      const storage = makeStorage();
      vi.mocked(storage.verifyUploadResponseSignature).mockReturnValue(false);
      const svc = makeService({ repo: makeRepo(makeMedia()), storage });

      await expect(svc.completeUpload('media_1', 'user_1', uploadResponse)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getAccessUrl', () => {
    it('returns plain CDN URL for public assets', async () => {
      const media = makeMedia({ status: 'READY', deliveryType: 'UPLOAD' });
      const storage = makeStorage();
      const policy = makePolicy();
      vi.mocked(policy.requiresSignedUrl).mockReturnValue(false);
      const svc = makeService({ repo: makeRepo(media), storage, policy });

      const result = await svc.getAccessUrl('media_1', 'user_1', 'AGENT', undefined, undefined);

      expect(storage.getDeliveryUrl).toHaveBeenCalled();
      expect(storage.getSignedUrl).not.toHaveBeenCalled();
      expect(result.url).toContain('cloudinary.com');
    });

    it('returns signed URL for authenticated assets', async () => {
      const media = makeMedia({ status: 'READY', deliveryType: 'AUTHENTICATED', purpose: 'STUDENT_ID' });
      const storage = makeStorage();
      const policy = makePolicy();
      vi.mocked(policy.requiresSignedUrl).mockReturnValue(true);
      const repo = makeRepo(media);
      const svc = makeService({ repo, storage, policy });

      const result = await svc.getAccessUrl('media_1', 'user_1', 'STUDENT', '1.2.3.4', 'ua');

      expect(storage.getSignedUrl).toHaveBeenCalled();
      expect(result.expiresAt).toBeDefined();
      expect(repo.logAccess).toHaveBeenCalledWith(
        expect.objectContaining({ mediaId: 'media_1', accessorId: 'user_1' }),
      );
    });

    it('throws NotFoundException when media not found', async () => {
      const svc = makeService({ repo: makeRepo(null) });
      await expect(
        svc.getAccessUrl('missing', 'user_1', 'ADMIN', undefined, undefined),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when media is not READY', async () => {
      const media = makeMedia({ status: 'PENDING' });
      const svc = makeService({ repo: makeRepo(media) });
      await expect(
        svc.getAccessUrl('media_1', 'user_1', 'ADMIN', undefined, undefined),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteMedia', () => {
    it('marks DELETING and enqueues deletion job', async () => {
      const media = makeMedia({ status: 'READY' });
      const repo = makeRepo(media);
      const deletionQueue = makeQueue();
      const svc = makeService({ repo, deletionQueue });

      await svc.deleteMedia('media_1', 'user_1', 'AGENT');

      expect(repo.markDeleting).toHaveBeenCalledWith('media_1');
      expect(deletionQueue.add).toHaveBeenCalled();
    });

    it('is idempotent when media is already DELETING', async () => {
      const media = makeMedia({ status: 'DELETING' });
      const repo = makeRepo(media);
      const deletionQueue = makeQueue();
      const svc = makeService({ repo, deletionQueue });

      await svc.deleteMedia('media_1', 'user_1', 'AGENT');

      expect(repo.markDeleting).not.toHaveBeenCalled();
      expect(deletionQueue.add).not.toHaveBeenCalled();
    });

    it('allows ADMIN to delete any asset', async () => {
      const media = makeMedia({ ownerId: 'someone_else', status: 'READY' });
      const repo = makeRepo(media);
      const svc = makeService({ repo });

      await expect(svc.deleteMedia('media_1', 'admin_1', 'ADMIN')).resolves.not.toThrow();
    });

    it('throws ForbiddenException for non-owner non-admin', async () => {
      const media = makeMedia({ ownerId: 'user_1', status: 'READY' });
      const svc = makeService({ repo: makeRepo(media) });

      await expect(svc.deleteMedia('media_1', 'other_user', 'STUDENT')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('enqueueWebhookJob', () => {
    it('enqueues webhook payload', async () => {
      const webhookQueue = makeQueue();
      const svc = makeService({ webhookQueue });

      await svc.enqueueWebhookJob({ notification_type: 'upload', public_id: 'abc' });

      expect(webhookQueue.add).toHaveBeenCalledWith(
        'process-webhook',
        expect.objectContaining({ notification_type: 'upload' }),
        expect.any(Object),
      );
    });
  });
});
 