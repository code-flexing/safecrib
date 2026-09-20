import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  TooManyRequestsException,
} from '@nestjs/common';
import type { MediaPurpose } from '@prisma/client';
import {
  ALLOWED_TRANSFORMATION_NAMES,
  PURPOSE_POLICIES,
  type PurposePolicy,
} from '../policies/purpose-policies.js';
import type { MediaRepository } from '../media.repository.js';

@Injectable()
export class MediaPolicyService {
  constructor(private readonly mediaRepo: MediaRepository) {}

  /**
   * Validate a new upload request against the purpose policy.
   * Throws HTTP exceptions if the request violates any policy.
   */
  async validateUploadRequest(
    ownerId: string,
    purpose: MediaPurpose,
    contentType: string,
    sizeBytes: number,
  ): Promise<PurposePolicy> {
    const policy = this.getPolicy(purpose);

    if (!policy.allowedMimeTypes.includes(contentType)) {
      throw new BadRequestException(
        `Content type "${contentType}" is not allowed for purpose "${purpose}". ` +
          `Allowed: ${policy.allowedMimeTypes.join(', ')}`,
      );
    }

    if (sizeBytes > policy.maxBytes) {
      const maxMB = (policy.maxBytes / (1024 * 1024)).toFixed(0);
      throw new BadRequestException(
        `File size ${sizeBytes} bytes exceeds the ${maxMB} MB limit for ${policy.label}`,
      );
    }

    const pendingCount = await this.mediaRepo.countPendingForUser(ownerId, purpose);
    if (pendingCount >= policy.maxPendingPerUser) {
      throw new TooManyRequestsException(
        `You have ${pendingCount} pending uploads for "${purpose}". ` +
          `Maximum is ${policy.maxPendingPerUser}. ` +
          `Wait for them to complete or cancel them before uploading more.`,
      );
    }

    return policy;
  }

  /**
   * Validate a requested named transformation.
   */
  validateTransformation(name: string | undefined): string | undefined {
    if (!name) return undefined;
    if (!ALLOWED_TRANSFORMATION_NAMES.includes(name)) {
      throw new BadRequestException(
        `Unknown transformation "${name}". Allowed: ${ALLOWED_TRANSFORMATION_NAMES.join(', ')}`,
      );
    }
    return name;
  }

  /**
   * Returns true if the delivery type requires a signed URL (never a plain CDN URL).
   */
  requiresSignedUrl(purpose: MediaPurpose): boolean {
    const { deliveryType } = this.getPolicy(purpose);
    return deliveryType === 'AUTHENTICATED' || deliveryType === 'PRIVATE';
  }

  /**
   * Check whether a user is allowed to read a given media item.
   * Owners can always read their own. Admins can read everything.
   * For private documents, only owner + admin.
   */
  assertCanRead(
    requesterId: string,
    requesterRole: string,
    ownerId: string,
    purpose: MediaPurpose,
  ): void {
    if (requesterRole === 'ADMIN') return;
    if (requesterId === ownerId) return;

    const policy = this.getPolicy(purpose);
    if (policy.deliveryType === 'PRIVATE' || policy.deliveryType === 'AUTHENTICATED') {
      throw new ForbiddenException('Access denied to this protected media asset');
    }
  }

  getPolicy(purpose: MediaPurpose): PurposePolicy {
    const policy = PURPOSE_POLICIES[purpose];
    if (!policy) {
      throw new BadRequestException(`Unknown media purpose: ${purpose}`);
    }
    return policy;
  }
}
