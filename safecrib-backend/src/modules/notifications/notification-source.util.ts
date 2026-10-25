export type NotificationSource = 'SYSTEM' | 'USER' | 'ADMIN';

const SYSTEM_TYPES = new Set([
  'WELCOME',
  'STUDENT_PROFILE_COMPLETION',
  'STUDENT_PROFILE_APPROVED',
  'STUDENT_PROFILE_REJECTED',
  'PROVIDER_PAGE_APPROVED',
  'PROVIDER_PAGE_REJECTED',
  'LISTING_APPROVED',
  'LISTING_REJECTED',
  'BOOKING_HELD',
  'BOOKING_CONFIRMED',
  'BOOKING_CANCELLED',
  'BOOKING_HOLD_EXPIRED',
  'SUPPORT_MESSAGE',
  'ADMIN_REVIEW_SUBMISSION',
  'SUPPORT_REPLY',
]);

const USER_TYPES = new Set([
  'LISTING_LIKED',
  'LISTING_COMMENT',
  'COMMENT_MENTION',
  'COMMENT_REPLY',
]);

const ADMIN_TYPES = new Set(['ADMIN_MESSAGE']);

export function deriveSourceFromType(type: string): NotificationSource {
  if (ADMIN_TYPES.has(type)) return 'ADMIN';
  if (USER_TYPES.has(type)) return 'USER';
  if (SYSTEM_TYPES.has(type)) return 'SYSTEM';
  return 'SYSTEM';
}
