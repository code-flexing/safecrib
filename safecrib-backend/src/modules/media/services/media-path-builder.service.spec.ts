import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { MediaPathBuilder } from './media-path-builder.service.js';
import type { MediaPurpose } from '@prisma/client';

function makeConfig(prefix: string) {
  return {
    get: vi.fn((key: string) => (key === 'CLOUDINARY_ENV_PREFIX' ? prefix : undefined)),
  } as unknown as ConfigService;
}

describe('MediaPathBuilder', () => {
  let builder: MediaPathBuilder;

  beforeEach(() => {
    builder = new MediaPathBuilder(makeConfig('prod'));
  });

  describe('buildFolder', () => {
    it.each([
      ['AVATAR', 'prod/users/avatar/user_123'],
      ['LISTING_PHOTO', 'prod/listings/photo/listing_xyz'],
      ['LISTING_VIDEO', 'prod/listings/video/listing_xyz'],
      ['PROVIDER_LOGO', 'prod/providers/logo/provider_abc'],
      ['STUDENT_ID', 'prod/verification/student-id/user_999'],
      ['PROOF_OF_STUDENTSHIP', 'prod/verification/proof-of-studentship/user_999'],
      ['PROOF_OF_LICENSE', 'prod/verification/proof-of-license/user_999'],
      ['CONTRACT_DOCUMENT', 'prod/contracts/contract/user_999'],
    ] as [MediaPurpose, string][])(
      'builds correct folder for purpose %s',
      (purpose, expected) => {
        const entityId = expected.split('/').at(-1)!;
        expect(builder.buildFolder(purpose, entityId)).toBe(expected);
      },
    );

    it('uses dev prefix when no env configured', () => {
      const devBuilder = new MediaPathBuilder(makeConfig('dev'));
      expect(devBuilder.buildFolder('AVATAR', 'u1')).toBe('dev/users/avatar/u1');
    });
  });

  describe('buildPublicId', () => {
    it('starts with the correct folder', () => {
      const publicId = builder.buildPublicId('AVATAR', 'user_1');
      expect(publicId).toMatch(/^prod\/users\/avatar\/user_1\/.+$/);
    });

    it('generates unique ids on each call', () => {
      const a = builder.buildPublicId('LISTING_PHOTO', 'listing_1');
      const b = builder.buildPublicId('LISTING_PHOTO', 'listing_1');
      expect(a).not.toBe(b);
    });

    it('includes a UUID-like segment at the end', () => {
      const publicId = builder.buildPublicId('AVATAR', 'user_2');
      const uuidRegex =
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(publicId).toMatch(uuidRegex);
    });
  });

  describe('uploadPresetName', () => {
    it.each([
      ['AVATAR', 'sc_avatar'],
      ['LISTING_PHOTO', 'sc_photo'],
      ['LISTING_VIDEO', 'sc_video'],
      ['PROOF_OF_STUDENTSHIP', 'sc_proof_of_studentship'],
      ['CONTRACT_DOCUMENT', 'sc_contract'],
    ] as [MediaPurpose, string][])(
      'returns correct preset name for %s',
      (purpose, expected) => {
        expect(builder.uploadPresetName(purpose)).toBe(expected);
      },
    );
  });
});
