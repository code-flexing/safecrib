import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type {
  MediaDeliveryType,
  MediaPurpose,
  MediaResourceType,
  MediaStatus,
} from '@prisma/client';

// ─── Enums (re-exported so controllers import from one place) ────────────────

export const MEDIA_PURPOSE_VALUES = [
  'AVATAR',
  'LISTING_PHOTO',
  'LISTING_VIDEO',
  'PROVIDER_LOGO',
  'STUDENT_ID',
  'PROOF_OF_STUDENTSHIP',
  'PROOF_OF_LICENSE',
  'CONTRACT_DOCUMENT',
] as const;

// ─── Request DTOs ────────────────────────────────────────────────────────────

export class RequestUploadSignatureDto {
  @ApiProperty({
    enum: MEDIA_PURPOSE_VALUES,
    example: 'LISTING_PHOTO',
    description: 'Purpose of the media asset',
  })
  @IsEnum(MEDIA_PURPOSE_VALUES)
  purpose: MediaPurpose;

  @ApiProperty({
    example: 'image/jpeg',
    description: 'MIME type of the file to be uploaded',
  })
  @IsString()
  @MaxLength(100)
  contentType: string;

  @ApiProperty({
    example: 2097152,
    description: 'File size in bytes (used for quota/policy check)',
  })
  @IsInt()
  @Min(1)
  @Max(600 * 1024 * 1024) // 600 MB hard cap
  sizeBytes: number;

  @ApiPropertyOptional({
    example: 'listing_abc123',
    description:
      'Entity this media belongs to (e.g. listingId). Defaults to the caller user ID.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  entityId?: string;
}

export class ConfirmUploadDto {
  @ApiPropertyOptional({ example: 'abc123def456' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  assetId?: string;

  @ApiPropertyOptional({ example: 1726780800 })
  @IsOptional()
  @IsNumber()
  version?: number;

  @ApiPropertyOptional({ example: 'jpg' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  format?: string;

  @ApiPropertyOptional({ example: 204800 })
  @IsOptional()
  @IsInt()
  @Min(0)
  bytes?: number;

  @ApiPropertyOptional({ example: 1920 })
  @IsOptional()
  @IsInt()
  @Min(0)
  width?: number;

  @ApiPropertyOptional({ example: 1080 })
  @IsOptional()
  @IsInt()
  @Min(0)
  height?: number;

  @ApiPropertyOptional({ example: 120.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSec?: number;

  @ApiPropertyOptional({ example: 'a1b2c3d4e5f6789012345678901234ab' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  etag?: string;
}

export class GetSignedUrlDto {
  @ApiPropertyOptional({
    example: 'listing_card',
    description: 'Named transformation (for public assets only)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  transformation?: string;
}

// ─── Response types ──────────────────────────────────────────────────────────

export interface MediaResponse {
  id: string;
  ownerId: string;
  purpose: MediaPurpose;
  resourceType: MediaResourceType;
  deliveryType: MediaDeliveryType;
  publicId: string;
  assetId: string | null;
  format: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  status: MediaStatus;
  createdAt: Date;
  readyAt: Date | null;
}

export interface UploadSignatureResponse {
  media: MediaResponse;
  uploadPayload: {
    signature: string;
    timestamp: number;
    api_key: string;
    cloud_name: string;
    public_id: string;
    folder: string;
    upload_preset: string;
    expires_at: number;
    [key: string]: unknown;
  };
}

export interface SignedAccessResponse {
  url: string;
  /** Unix timestamp when the URL expires. Undefined for permanent public URLs. */
  expiresAt?: number;
  mediaId: string;
}

export interface WebhookNotificationPayload {
  notification_type: string;
  asset_id?: string;
  public_id?: string;
  version?: number;
  format?: string;
  bytes?: number;
  width?: number;
  height?: number;
  duration?: number;
  etag?: string;
  secure_url?: string;
  url?: string;
  resource_type?: string;
  type?: string;
  created_at?: string;
}
