/**
 * StorageProvider — the abstraction layer between business logic and Cloudinary.
 * Business modules depend on this interface only; tests inject a mock.
 */
export interface UploadSignatureParams {
  publicId: string;
  folder: string;
  uploadPreset: string;
  timestamp: number;
  /** Extra params to include in the signature (context, tags, etc.) */
  extraParams?: Record<string, string | number>;
}

export interface UploadSignatureResult {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  publicId: string;
  folder: string;
  uploadPreset: string;
  /** Expiry as Unix seconds */
  expiresAt: number;
  /** Any extra signed params forwarded verbatim to the client */
  extra: Record<string, string | number>;
}

export interface DeliveryUrlOptions {
  /** Named transformation to apply, e.g. "listing_card" */
  transformation?: string;
  /** Override resource type if needed */
  resourceType?: 'image' | 'video' | 'raw';
}

export interface SignedAccessUrlOptions {
  /** TTL in seconds, default 300 */
  ttlSeconds?: number;
  resourceType?: 'image' | 'video' | 'raw';
}

export interface DeleteAssetOptions {
  resourceType?: 'image' | 'video' | 'raw';
  deliveryType?: 'upload' | 'authenticated' | 'private';
}

export interface UploadAssetOptions {
  /** Explicit public_id (must be unique). Defaults to a Cloudinary-generated name. */
  publicId?: string;
  /** Cloudinary folder to store the asset under */
  folder?: string;
  /** resource_type passed straight to Cloudinary */
  resourceType?: 'image' | 'video' | 'raw';
  /** Tags applied to the asset */
  tags?: string[];
  /** Context metadata (key=value) stored on the asset */
  context?: Record<string, string>;
}

export interface UploadAssetResult {
  publicId: string;
  url: string;
  assetId: string;
  format: string;
  bytes: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  etag: string | null;
}

export interface WebhookVerificationResult {
  valid: boolean;
  /** Reason for rejection when valid=false */
  reason?: string;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

export interface StorageProvider {
  /**
   * Generate a short-lived signed upload payload.
   * Never calls the Cloudinary Admin API — all computed locally.
   */
  createUploadSignature(params: UploadSignatureParams): UploadSignatureResult;

  /**
   * Build a public CDN delivery URL without any network call.
   * For "upload" delivery type assets.
   */
  getDeliveryUrl(publicId: string, options?: DeliveryUrlOptions): string;

  /**
   * Generate a short-lived signed URL for private/authenticated assets.
   * Uses the SDK's local URL builder — no Admin API call.
   */
  getSignedUrl(publicId: string, options?: SignedAccessUrlOptions): string;

  /**
   * Upload an asset directly from the server using the Cloudinary SDK
   * (authenticated with the API secret — no upload preset required).
   */
  uploadAsset(
    buffer: Buffer,
    mimeType: string,
    options?: UploadAssetOptions,
  ): Promise<UploadAssetResult>;

  /**
   * Delete an asset via the Cloudinary Destroy API.
   * Should only be called from background workers, never in the request path.
   */
  deleteAsset(publicId: string, options?: DeleteAssetOptions): Promise<{ result: string }>;

  /**
   * Verify a Cloudinary webhook notification signature.
   * Uses the raw request body; timestamp staleness checked here.
   */
  verifyWebhook(
    body: Buffer,
    signature: string,
    timestamp: string,
  ): WebhookVerificationResult;
}
