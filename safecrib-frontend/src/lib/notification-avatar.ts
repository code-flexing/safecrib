import type { NotificationItem } from "@/lib/notifications";

const BOT_AVATAR = "/cribbot-avatar.png";
const SYSTEM_TYPES = new Set([
  "WELCOME",
  "STUDENT_PROFILE_COMPLETION",
  "STUDENT_PROFILE_APPROVED",
  "STUDENT_PROFILE_REJECTED",
  "PROVIDER_PAGE_APPROVED",
  "PROVIDER_PAGE_REJECTED",
  "LISTING_APPROVED",
  "LISTING_REJECTED",
  "BOOKING_HELD",
  "BOOKING_CONFIRMED",
  "BOOKING_CANCELLED",
  "BOOKING_HOLD_EXPIRED",
  "SUPPORT_MESSAGE",
  "ADMIN_REVIEW_SUBMISSION",
  "SUPPORT_REPLY",
]);
const USER_TYPES = new Set([
  "LISTING_LIKED",
  "LISTING_COMMENT",
  "COMMENT_MENTION",
  "COMMENT_REPLY",
]);
const ADMIN_TYPES = new Set(["ADMIN_MESSAGE"]);

function deriveSource(n: NotificationItem): "SYSTEM" | "USER" | "ADMIN" {
  if (n.type === "ADMIN_MESSAGE") return "ADMIN";
  const data = n.data as Record<string, unknown> | null;
  if (data && typeof data.source === "string") return data.source as any;
  if (USER_TYPES.has(n.type)) return "USER";
  if (SYSTEM_TYPES.has(n.type)) return "SYSTEM";
  return "SYSTEM";
}

export function getNotificationAvatar(n: NotificationItem): { src: string | null; isBot: boolean; actorId?: string | null } {
  const source = deriveSource(n);
  if (source === "SYSTEM") {
    return { src: BOT_AVATAR, isBot: true };
  }
  if (source === "ADMIN") {
    const actor = (n as any).actor;
    const data = n.data as any;
    return {
      src: actor?.avatarUrl ?? data?.senderAvatarSnapshot ?? BOT_AVATAR,
      isBot: false,
      actorId: actor?.id ?? data?.senderAdminId ?? null,
    };
  }
  // USER
  const actor: any = (n as any).actor;
  const data: any = n.data as any;
  return {
    src: actor?.avatarUrl ?? data?.actorProfilePicture ?? null,
    isBot: false,
    actorId: actor?.id ?? data?.actorId ?? null,
  };
}

export function getNotificationActorName(n: NotificationItem): string | null {
  const source = deriveSource(n);
  const actor = (n as any).actor;
  const data = n.data as any;
  if (source === "SYSTEM") return "CribBot";
  if (source === "ADMIN") return actor?.displayName ?? data?.senderNameSnapshot ?? "SafeCribs Team";
  return actor?.displayName ?? actor?.username ?? data?.actorName ?? data?.actorUsername ?? null;
}
