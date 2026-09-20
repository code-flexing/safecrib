import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import { CloudinaryStorageProvider } from './cloudinary.provider.js';
import type { ConfigService } from '@nestjs/config';

function makeConfig(): ConfigService {
  return {
    getOrThrow: vi.fn((key: string) => {
      const values: Record<string, string> = {
        CLOUDINARY_CLOUD_NAME: 'test_cloud',
        CLOUDINARY_API_KEY: 'test_key_123',
        CLOUDINARY_API_SECRET: 'test_secret_abc',
      };
      const val = values[key];
      if (!val) throw new Error(`Missing config: ${key}`);
      return val;
    }),
    get: vi.fn(),
  } as unknown as ConfigService;
}

describe('CloudinaryStorageProvider', () => {
  let provider: CloudinaryStorageProvider;

  beforeEach(() => {
    provider = new CloudinaryStorageProvider(makeConfig());
    // Manually set private fields (no onModuleInit side effects in unit tests)
    (provider as any).cloudName = 'test_cloud';
    (provider as any).apiKey = 'test_key_123';
    (provider as any).apiSecret = 'test_secret_abc';
  });

  describe('createUploadSignature', () => {
    it('returns correct api_key and cloud_name', () => {
      const result = provider.createUploadSignature({
        publicId: 'prod/users/avatar/u1/uuid-1',
        folder: 'prod/users/avatar/u1',
        uploadPreset: 'sc_avatar',
        timestamp: 1726780800,
      });

      expect(result.apiKey).toBe('test_key_123');
      expect(result.cloudName).toBe('test_cloud');
      expect(result.publicId).toBe('prod/users/avatar/u1/uuid-1');
      expect(result.uploadPreset).toBe('sc_avatar');
    });

    it('produces a 64-char hex SHA-256 signature', () => {
      const result = provider.createUploadSignature({
        publicId: 'some/path/uuid',
        folder: 'some/path',
        uploadPreset: 'sc_photo',
        timestamp: 1726780800,
      });
      expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
    });

    it('signature is deterministic for the same inputs', () => {
      const params = {
        publicId: 'prod/listings/photo/l1/uuid-2',
        folder: 'prod/listings/photo/l1',
        uploadPreset: 'sc_photo',
        timestamp: 1726780800,
      };
      const r1 = provider.createUploadSignature(params);
      const r2 = provider.createUploadSignature(params);
      expect(r1.signature).toBe(r2.signature);
    });

    it('signature changes when publicId changes', () => {
      const base = {
        folder: 'prod/users/avatar/u1',
        uploadPreset: 'sc_avatar',
        timestamp: 1726780800,
      };
      const r1 = provider.createUploadSignature({ ...base, publicId: 'path/uuid-a' });
      const r2 = provider.createUploadSignature({ ...base, publicId: 'path/uuid-b' });
      expect(r1.signature).not.toBe(r2.signature);
    });

    it('expiresAt is timestamp + 600', () => {
      const ts = 1726780800;
      const result = provider.createUploadSignature({
        publicId: 'p',
        folder: 'f',
        uploadPreset: 'sc_avatar',
        timestamp: ts,
      });
      expect(result.expiresAt).toBe(ts + 600);
    });

    it('includes extra params in the result', () => {
      const result = provider.createUploadSignature({
        publicId: 'p',
        folder: 'f',
        uploadPreset: 'sc_avatar',
        timestamp: 1000,
        extraParams: { context: 'purpose=AVATAR|owner=u1' },
      });
      expect(result.extra).toEqual({ context: 'purpose=AVATAR|owner=u1' });
    });
  });

  describe('verifyWebhook', () => {
    const apiSecret = 'test_secret_abc';

    function makeValidWebhook(body: string, timestamp: string) {
      const sig = crypto
        .createHash('sha1')
        .update(body + timestamp + apiSecret)
        .digest('hex');
      return { body: Buffer.from(body), signature: sig, timestamp };
    }

    it('returns valid=true for correct signature', () => {
      const now = String(Math.floor(Date.now() / 1000));
      const { body, signature, timestamp } = makeValidWebhook(
        '{"notification_type":"upload","public_id":"test"}',
        now,
      );
      expect(provider.verifyWebhook(body, signature, timestamp)).toEqual({
        valid: true,
      });
    });

    it('returns valid=false for wrong signature', () => {
      const now = String(Math.floor(Date.now() / 1000));
      const body = Buffer.from('{"notification_type":"upload"}');
      const result = provider.verifyWebhook(body, 'wrongsig'.padEnd(40, '0'), now);
      expect(result.valid).toBe(false);
    });

    it('rejects stale timestamp (older than 5 min)', () => {
      const oldTs = String(Math.floor(Date.now() / 1000) - 400);
      const { body, signature } = makeValidWebhook('{}', oldTs);
      const result = provider.verifyWebhook(body, signature, oldTs);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('timestamp too old');
    });

    it('rejects non-numeric timestamp', () => {
      const result = provider.verifyWebhook(Buffer.from('{}'), 'abc', 'notanumber');
      expect(result.valid).toBe(false);
      expect(result.reason).toBe('non-numeric timestamp');
    });
  });
});
