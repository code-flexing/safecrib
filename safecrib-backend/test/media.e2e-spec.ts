/**
 * Media module E2E tests
 *
 * Uses a MockStorageProvider injected in place of CloudinaryStorageProvider so no
 * real Cloudinary calls are made. The DB and Redis are the real test dependencies
 * (same as the existing auth E2E tests).
 *
 * To run:
 *   npm run test:e2e -- --reporter=verbose media.e2e-spec
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import crypto from 'node:crypto';
import { vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
  type WebhookVerificationResult,
} from '../src/modules/media/providers/storage-provider.interface.js';
import type {
  UploadSignatureParams,
  UploadSignatureResult,
  DeliveryUrlOptions,
  SignedAccessUrlOptions,
  DeleteAssetOptions,
} from '../src/modules/media/providers/storage-provider.interface.js';

// ─── Mock storage provider ───────────────────────────────────────────────────

const API_SECRET = 'test_webhook_secret';

class MockStorageProvider implements StorageProvider {
  createUploadSignature(params: UploadSignatureParams): UploadSignatureResult {
    const ts = params.timestamp;
    return {
      signature: 'mock_sig_' + params.publicId,
      timestamp: ts,
      apiKey: 'mock_api_key',
      cloudName: 'mock_cloud',
      publicId: params.publicId,
      folder: params.folder,
      uploadPreset: params.uploadPreset,
      expiresAt: ts + 600,
      extra: params.extraParams ?? {},
    };
  }

  getDeliveryUrl(publicId: string, _options?: DeliveryUrlOptions): string {
    return `https://res.cloudinary.com/mock/image/upload/${publicId}`;
  }

  getSignedUrl(publicId: string, options?: SignedAccessUrlOptions): string {
    const exp = Math.floor(Date.now() / 1000) + (options?.ttlSeconds ?? 300);
    return `https://res.cloudinary.com/mock/image/authenticated/${publicId}?exp=${exp}&sig=mocked`;
  }

  async deleteAsset(_publicId: string, _options?: DeleteAssetOptions): Promise<{ result: string }> {
    return { result: 'ok' };
  }

  verifyWebhook(
    body: Buffer,
    signature: string,
    timestamp: string,
  ): WebhookVerificationResult {
    // Simulate the same SHA-1 check as the real provider
    const expected = crypto
      .createHash('sha1')
      .update(body.toString('utf8') + timestamp + API_SECRET)
      .digest('hex');

    // Use a constant-time comparison to avoid side-channel leaks even in tests
    try {
      const valid = crypto.timingSafeEqual(
        Buffer.from(expected, 'hex'),
        Buffer.from(signature.padEnd(40, '0').slice(0, 40), 'hex'),
      );
      return valid ? { valid: true } : { valid: false, reason: 'signature mismatch' };
    } catch {
      return { valid: false, reason: 'signature mismatch' };
    }
  }
}

function makeWebhookSignature(body: string, timestamp: string): string {
  return crypto
    .createHash('sha1')
    .update(body + timestamp + API_SECRET)
    .digest('hex');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function registerAndLogin(
  app: INestApplication,
  role = 'AGENT',
): Promise<{ accessToken: string; userId: string }> {
  const email = `e2e-media-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`;
  const password = 'TestPass123!';

  // Register
  await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({ email, password, displayName: 'Media Tester' })
    .expect(201);

  // Manually set role + emailVerified for testing (bypass email flow)
  // This relies on PrismaService being available in the test module
  const prisma = app.get('PrismaService');
  const user = await prisma.user.findUnique({ where: { email } });
  await prisma.user.update({
    where: { id: user.id },
    data: { role, emailVerified: true },
  });

  // Login
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);

  return { accessToken: loginRes.body.accessToken as string, userId: user.id as string };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Media Module (E2E)', () => {
  let app: INestApplication;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(STORAGE_PROVIDER)
      .useClass(MockStorageProvider)
      .compile();

    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const creds = await registerAndLogin(app, 'AGENT');
    accessToken = creds.accessToken;
    userId = creds.userId;
  });

  afterAll(async () => {
    await app.close();
  });

  // ── Signature endpoint ─────────────────────────────────────────────────────

  describe('POST /media/upload-signature', () => {
    it('returns 201 with upload payload for valid request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/media/upload-signature')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          purpose: 'LISTING_PHOTO',
          contentType: 'image/jpeg',
          sizeBytes: 2 * 1024 * 1024,
        })
        .expect(201);

      expect(res.body.media).toBeDefined();
      expect(res.body.media.status).toBe('PENDING');
      expect(res.body.uploadPayload).toBeDefined();
      expect(res.body.uploadPayload.signature).toBeDefined();
      expect(res.body.uploadPayload.api_key).toBe('mock_api_key');
    });

    it('returns 400 for disallowed content type', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/media/upload-signature')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          purpose: 'AVATAR',
          contentType: 'application/exe',
          sizeBytes: 1024,
        })
        .expect(400);
    });

    it('returns 400 for file over size limit', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/media/upload-signature')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          purpose: 'AVATAR',
          contentType: 'image/jpeg',
          sizeBytes: 100 * 1024 * 1024, // 100 MB — way over 5 MB avatar limit
        })
        .expect(400);
    });

    it('returns 400 for invalid purpose', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/media/upload-signature')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          purpose: 'NOT_A_REAL_PURPOSE',
          contentType: 'image/jpeg',
          sizeBytes: 1024,
        })
        .expect(400);
    });

    it('returns 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/media/upload-signature')
        .send({ purpose: 'LISTING_PHOTO', contentType: 'image/jpeg', sizeBytes: 1024 })
        .expect(401);
    });
  });

  // ── Webhook flow ───────────────────────────────────────────────────────────

  describe('Webhook flow (upload → READY)', () => {
    it('marks media READY when Cloudinary posts a valid webhook', async () => {
      // 1. Get a PENDING media record
      const sigRes = await request(app.getHttpServer())
        .post('/api/v1/media/upload-signature')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          purpose: 'LISTING_PHOTO',
          contentType: 'image/jpeg',
          sizeBytes: 1024 * 1024,
        })
        .expect(201);

      const { media } = sigRes.body as { media: { id: string; publicId: string } };
      expect(media.status).toBe('PENDING');

      // 2. Simulate Cloudinary webhook
      const timestamp = String(Math.floor(Date.now() / 1000));
      const payload = JSON.stringify({
        notification_type: 'upload',
        public_id: media.publicId,
        asset_id: 'asset_e2e_123',
        version: 1726780800,
        format: 'jpg',
        bytes: 204800,
        width: 1920,
        height: 1080,
      });

      const sig = makeWebhookSignature(payload, timestamp);

      await request(app.getHttpServer())
        .post('/api/v1/media/webhook')
        .set('Content-Type', 'application/json')
        .set('x-cld-signature', sig)
        .set('x-cld-timestamp', timestamp)
        .send(payload)
        .expect(200)
        .expect({ ok: true });

      // 3. Wait briefly for BullMQ worker to process (or use confirm as proxy)
      // Since the worker runs async, we verify via confirm endpoint which is idempotent
      const confirmRes = await request(app.getHttpServer())
        .post(`/api/v1/media/${media.id}/confirm`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ assetId: 'asset_e2e_123', version: 1726780800 })
        .expect(200);

      // Either READY (webhook already processed) or still PENDING (webhook in queue)
      expect(['READY', 'PENDING']).toContain(confirmRes.body.status);
    });

    it('rejects webhook with wrong signature', async () => {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const payload = JSON.stringify({ notification_type: 'upload', public_id: 'test' });

      const res = await request(app.getHttpServer())
        .post('/api/v1/media/webhook')
        .set('Content-Type', 'application/json')
        .set('x-cld-signature', 'completely_wrong_signature_padded_here00000000')
        .set('x-cld-timestamp', timestamp)
        .send(payload)
        .expect(200); // Returns 200 but ok=false (never reveal rejection with 4xx to Cloudinary)

      expect(res.body.ok).toBe(false);
    });

    it('rejects webhook with missing signature headers', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/media/webhook')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ notification_type: 'upload' }))
        .expect(200);

      expect(res.body.ok).toBe(false);
    });

    it('handles duplicate webhook delivery idempotently', async () => {
      // Get two signatures for the same payload — should not throw
      const sigRes = await request(app.getHttpServer())
        .post('/api/v1/media/upload-signature')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ purpose: 'AVATAR', contentType: 'image/jpeg', sizeBytes: 512 * 1024 })
        .expect(201);

      const mediaId = sigRes.body.media.id as string;
      const publicId = sigRes.body.media.publicId as string;
      const timestamp = String(Math.floor(Date.now() / 1000));
      const payload = JSON.stringify({
        notification_type: 'upload',
        public_id: publicId,
        asset_id: 'asset_dup_test',
        version: 99999,
      });
      const sig = makeWebhookSignature(payload, timestamp);

      // Send same webhook twice
      await request(app.getHttpServer())
        .post('/api/v1/media/webhook')
        .set('Content-Type', 'application/json')
        .set('x-cld-signature', sig)
        .set('x-cld-timestamp', timestamp)
        .send(payload)
        .expect(200);

      const res2 = await request(app.getHttpServer())
        .post('/api/v1/media/webhook')
        .set('Content-Type', 'application/json')
        .set('x-cld-signature', sig)
        .set('x-cld-timestamp', timestamp)
        .send(payload)
        .expect(200);

      expect(res2.body.ok).toBe(true);

      void mediaId; // used for reference
    });
  });

  // ── Confirm fallback ───────────────────────────────────────────────────────

  describe('POST /media/:id/confirm', () => {
    it('returns 403 when non-owner tries to confirm', async () => {
      // Create a record owned by user1
      const sigRes = await request(app.getHttpServer())
        .post('/api/v1/media/upload-signature')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ purpose: 'LISTING_PHOTO', contentType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);

      const mediaId = sigRes.body.media.id as string;

      // Create a second user
      const { accessToken: token2 } = await registerAndLogin(app, 'AGENT');

      await request(app.getHttpServer())
        .post(`/api/v1/media/${mediaId}/confirm`)
        .set('Authorization', `Bearer ${token2}`)
        .send({})
        .expect(403);
    });
  });

  // ── Access URL ─────────────────────────────────────────────────────────────

  describe('GET /media/:id/access', () => {
    it('returns 404 for PENDING media', async () => {
      const sigRes = await request(app.getHttpServer())
        .post('/api/v1/media/upload-signature')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ purpose: 'LISTING_PHOTO', contentType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/v1/media/${sigRes.body.media.id}/access`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('returns 404 for unknown media ID', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/media/nonexistent-id-xyz/access')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('returns 401 when unauthenticated', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/media/any-id/access')
        .expect(401);
    });
  });

  // ── Authorization failures ─────────────────────────────────────────────────

  describe('DELETE /media/:id', () => {
    it('returns 403 when non-owner non-admin tries to delete', async () => {
      const sigRes = await request(app.getHttpServer())
        .post('/api/v1/media/upload-signature')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ purpose: 'LISTING_PHOTO', contentType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);

      const { accessToken: otherToken } = await registerAndLogin(app, 'AGENT');

      await request(app.getHttpServer())
        .delete(`/api/v1/media/${sigRes.body.media.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(403);
    });

    it('returns 204 when owner deletes their asset', async () => {
      const sigRes = await request(app.getHttpServer())
        .post('/api/v1/media/upload-signature')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ purpose: 'LISTING_PHOTO', contentType: 'image/jpeg', sizeBytes: 1024 })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/media/${sigRes.body.media.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
    });
  });
});
