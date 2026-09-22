import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { MediaPurpose } from '@prisma/client';

/**
 * MediaPathBuilder
 *
 * Centralises all public_id / folder construction so that no other file
 * builds Cloudinary paths by hand.
 *
 * Pattern:
 *   {env}/{domain}/{purpose}/{ownerId|entityId}/{uuid}
 *
 * Examples:
 *   prod/users/avatar/user_abc123/01J9X4V…
 *   prod/listings/photo/listing_xyz/01J9X4W…
 *   prod/verification/document/user_abc123/01J9X4Y…
 */
@Injectable()
export class MediaPathBuilder {
  private readonly envPrefix: string;

  /** Maps each purpose to the domain segment of the path */
  private static readonly PURPOSE_DOMAIN: Record<MediaPurpose, string> = {
    AVATAR: 'users',
    COVER_PHOTO: 'users',
    LISTING_PHOTO: 'listings',
    LISTING_VIDEO: 'listings',
    PROVIDER_LOGO: 'providers',
    STUDENT_ID: 'verification',
    PROOF_OF_STUDENTSHIP: 'verification',
    PROOF_OF_LICENSE: 'verification',
    CONTRACT_DOCUMENT: 'contracts',
  };

  /** Maps each purpose to the sub-folder within the domain */
  private static readonly PURPOSE_SLUG: Record<MediaPurpose, string> = {
    AVATAR: 'avatar',
    COVER_PHOTO: 'cover-photo',
    LISTING_PHOTO: 'photo',
    LISTING_VIDEO: 'video',
    PROVIDER_LOGO: 'logo',
    STUDENT_ID: 'student-id',
    PROOF_OF_STUDENTSHIP: 'proof-of-studentship',
    PROOF_OF_LICENSE: 'proof-of-license',
    CONTRACT_DOCUMENT: 'contract',
  };

  constructor(config: ConfigService) {
    this.envPrefix = config.get<string>('CLOUDINARY_ENV_PREFIX') || 'dev';
  }

  /**
   * Build the Cloudinary folder (without the final uuid segment).
   * Used as the `folder` parameter in upload presets / signature params.
   */
  buildFolder(purpose: MediaPurpose, entityId: string): string {
    const domain = MediaPathBuilder.PURPOSE_DOMAIN[purpose];
    const slug = MediaPathBuilder.PURPOSE_SLUG[purpose];
    return `${this.envPrefix}/${domain}/${slug}/${entityId}`;
  }

  /**
   * Build a collision-free public_id for a new upload.
   * Includes the full path so Cloudinary's folder is populated correctly.
   */
  buildPublicId(purpose: MediaPurpose, entityId: string): string {
    const uuid = randomUUID();
    return `${this.buildFolder(purpose, entityId)}/${uuid}`;
  }

  /**
   * Extract the named upload preset name for this purpose.
   * The preset is created / synced via `npm run cloudinary:sync-presets`.
   */
  uploadPresetName(purpose: MediaPurpose): string {
    return `sc_${MediaPathBuilder.PURPOSE_SLUG[purpose].replace(/-/g, '_')}`;
  }
}
