export type NotificationType =
  | 'WELCOME'
  | 'STUDENT_PROFILE_COMPLETION'
  | 'PROVIDER_PAGE_APPROVED'
  | 'PROVIDER_PAGE_REJECTED'
  | 'STUDENT_PROFILE_APPROVED'
  | 'STUDENT_PROFILE_REJECTED'
  | 'LISTING_APPROVED'
  | 'LISTING_REJECTED'
  | 'BOOKING_HELD'
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_HOLD_EXPIRED'
  | 'SUPPORT_MESSAGE'
  | 'LISTING_LIKED'
  | 'LISTING_COMMENT'
  | 'COMMENT_MENTION'
  | 'SUPPORT_REPLY';

export type NotificationInput = {
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  data?: Record<string, unknown>;
  dedupeKey: string;
};

export type NotificationQueuePayload = NotificationInput & {
  userId: string;
};
