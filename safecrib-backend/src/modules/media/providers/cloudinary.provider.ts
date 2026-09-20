import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import crypto from 'node:crypto';
import type {
  DeleteAssetOptions,
  DeliveryUrlOptions,
  SignedAccessUrlOptions,
  StorageProvider,
  UploadSignatureParams,
  UploadSignatureResult,
  WebhookVerificationResult,
} from './storage-provider.interface.js';

/** Signature TTL in seconds. Cloudinary rejects requests older than this. */
const SIGNATURE_TTL_SECONDS = 600; // 10 minutes

/** Maximum clock drift we accept for incoming webhook timestamps */
const WEBHOOK_MAX_AGE_SECONDS = 300; // 5 minutes

@Injectable()
export class CloudinaryStorageProvider implements StorageProvider, OnModuleInit {
  private readonly logger = new Logger(CloudinaryStorageProvider.name);
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly cloudName: string;

  constructor(private readonly config: ConfigService) {
    this.cloudName = config.getOrThrow<string>('CLOUDINARY_CLOUD_NAME');
    this.apiKey = config.getOrThrow<string>('CLOUDINARY_API_KEY');
    this.apiSecret = config.getOrThrow<string>('CLOUDINARY_API_SECRET');
  }

  onModuleInit(): void {
    cloudinary.config({
      cloud_name: this.cloudName,
      api_key: this.apiKey,
      api_secret: this.apiSecret,
      secure: true,
    });
    this.logger.log(`Cloudinary configured for cloud: ${this.cloudName}`);
  }

  createUploadSignature(params: UploadSignatureParams): UploadSignatureResult {
    const timestamp = params.timestamp;
    const expiresAt = timestamp + SIGNATURE_TTL_SECONDS;

    // All params that must be signed (must match what Cloudinary checks server-side)
    const paramsToSign: Record<string, string | number> = {
      timestamp,
      public_id: params.publicId,
      folder: params.folder,
      upload_preset: params.uploadPreset,
      ...params.extraParams,
    };

    // Build the string-to-sign: sorted key=value pairs joined by &, then apiSecret
    const signatureString =
      Object.keys(paramsToSign)
        .sort()
        .map((k) => `${k}=${paramsToSign[k]}`)
        .join('&') + this.apiSecret;

    const signature = crypto
      .createHash('sha256')
      .update(signatureString)
      .digest('hex');

    return {
      signature,
      timestamp,
      apiKey: this.apiKey,
      cloudName: this.cloudName,
      publicId: params.publicId,
      folder: params.folder,
      uploadPreset: params.uploadPreset,
      expiresAt,
      extra: params.extraParams ?? {},
    };
  }

  getDeliveryUrl(publicId: string, options: DeliveryUrlOptions = {}): string {
    const transformation = options.transformation
      ? [{ transformation: options.transformation }]
      : undefined;

    const url = cloudinary.url(publicId, {
      resource_type: options.resourceType ?? 'image',
      type: 'upload',
      secure: true,
      ...(transformation ? { transformation } : {}),
    });

    return url;
  }

  getSignedUrl(publicId: string, options: SignedAccessUrlOptions = {}): string {
    const ttl = options.ttlSeconds ?? 300;
    const expireAt = Math.floor(Date.now() / 1000) + ttl;

    const url = cloudinary.url(publicId, {
      resource_type: options.resourceType ?? 'image',
      type: 'authenticated',
      secure: true,
      sign_url: true,
      expires_at: expireAt,
    });

    return url;
  }

  async deleteAsset(
    publicId: string,
    options: DeleteAssetOptions = {},
  ): Promise<{ result: string }> {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: options.resourceType ?? 'image',
      type: options.deliveryType ?? 'upload',
    });
    return { result: result.result as string };
  }

  verifyWebhook(
    body: Buffer,
    signature: string,
    timestamp: string,
  ): WebhookVerificationResult {
    // Reject stale timestamps first (replay protection)
    const ts = parseInt(timestamp, 10);
    if (Number.isNaN(ts)) {
      return { valid: false, reason: 'non-numeric timestamp' };
    }
    const age = Math.floor(Date.now() / 1000) - ts;
    if (age > WEBHOOK_MAX_AGE_SECONDS || age < -60) {
      return { valid: false, reason: `timestamp too old (age=${age}s)` };
    }

    // Cloudinary webhook signature = SHA-1(body_as_string + timestamp + api_secret)
    const bodyStr = body.toString('utf8');
    const expected = crypto
      .createHash('sha1')
      .update(bodyStr + timestamp + this.apiSecret)
      .digest('hex');

    const valid = crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(signature, 'hex'),
    );

    return valid ? { valid: true } : { valid: false, reason: 'signature mismatch' };
  }
}
