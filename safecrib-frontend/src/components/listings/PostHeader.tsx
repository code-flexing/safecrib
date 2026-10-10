"use client";

import Link from "next/link";
import { MediaImage } from "./MediaImage";
import { PostMenu } from "./PostMenu";
import { formatDistanceToNow } from "date-fns";
import { UserName } from "@/components/common/UserName";
import type { VerificationCriterion } from "@/components/verification/VerificationBadge";

type AgentInfo = {
  id: string;
  displayName: string;
  handle?: string;
  /** Media UUID for the agent avatar — passed to /api/v1/media/:id/access */
  avatarMediaId?: string;
  /** Already-resolved CDN URL (e.g. from Cloudinary); used as fallback if no mediaId */
  avatarUrl?: string;
  isVerified?: boolean;
  verificationBadge?: "green" | "blue" | "gold";
  agencyName?: string;
};

type PostHeaderProps = {
  agent: AgentInfo;
  postedAt: string | Date;
  isOwnListing?: boolean;
  onShare?: () => void;
  onDownload?: () => void;
  onSave?: () => void;
  onCopyLink?: () => void;
  onReport?: () => void;
  onContactAgent?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

function formatRelativeTime(date: string | Date) {
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: false })
      .replace("about ", "")
      .replace("less than a minute", "just now")
      .replace(" minutes", "m")
      .replace(" minute", "m")
      .replace(" hours", "h")
      .replace(" hour", "h")
      .replace(" days", "d")
      .replace(" day", "d")
      .replace(" months", "mo")
      .replace(" month", "mo")
      .replace(" years", "y")
      .replace(" year", "y");
  } catch {
    return "";
  }
}

function agentToUser(agent: AgentInfo) {
  const badgeMap: Record<string, "GREEN_CHECK" | "BLUE_SHIELD" | "GOLD_CROWN"> = {
    green: "GREEN_CHECK",
    blue: "BLUE_SHIELD",
    gold: "GOLD_CROWN",
  };
  const colorMap: Record<string, "green" | "blue" | "gold"> = {
    green: "green",
    blue: "blue",
    gold: "gold",
  };
  const isBadgeColor = (badge: string): badge is "green" | "blue" | "gold" =>
    badge === "green" || badge === "blue" || badge === "gold";

  const verification =
    agent.isVerified && agent.verificationBadge && isBadgeColor(agent.verificationBadge)
      ? {
          eligible: true as const,
          stage: (
            agent.verificationBadge === "gold" ?"TRUST_CROWN"
              : agent.verificationBadge === "blue" ?"AGENT_VERIFIED" :"PROFILE_VERIFIED" ) as"PROFILE_VERIFIED" | "AGENT_VERIFIED" | "TRUST_CROWN",
          badge: badgeMap[agent.verificationBadge] as "GREEN_CHECK" | "BLUE_SHIELD" | "GOLD_CROWN",
          badgeColor: colorMap[agent.verificationBadge] as "green" | "blue" | "gold",
          riskBlocked: false,
          nextMilestone: null,
          criteria: [] as VerificationCriterion[],
        }
      : null;

  return {
    id: agent.id,
    displayName: agent.displayName,
    username: agent.handle,
    verification,
    isVerified: agent.isVerified,
    role: "AGENT",
  };
}

export function PostHeader({
  agent,
  postedAt,
  isOwnListing = false,
  onShare,
  onDownload,
  onSave,
  onCopyLink,
  onReport,
  onContactAgent,
  onEdit,
  onDelete,
}: PostHeaderProps) {
  const menuItems = [
    { label: "Share", icon: "share-2", onClick: onShare ?? (() => {}) },
    { label: "Download media", icon: "download", onClick: onDownload ?? (() => {}) },
    { label: "Save", icon: "bookmark", onClick: onSave ?? (() => {}) },
    { label: "Copy link", icon: "copy", onClick: onCopyLink ?? (() => {}) },
    { label: "Report listing", icon: "flag", onClick: onReport ?? (() => {}), danger: true },
    { label: "Contact agent", icon: "message-circle", onClick: onContactAgent ?? (() => {}) },
    ...(isOwnListing
      ? [
          { label: "Edit", icon: "edit-2", onClick: onEdit ?? (() => {}) },
          { label: "Delete", icon: "trash-2", onClick: onDelete ?? (() => {}), danger: true },
        ]
      : []),
  ];

  // Determine whether to use mediaId-based fetch or direct URL.
  // avatarMediaId is a UUID → pass as mediaId for /api/v1/media/:id/access?transformation=avatar_sm
  // avatarUrl may be a plain https:// CDN URL → passed as url (used directly by MediaImage)
  // If avatarUrl looks like a UUID (no slashes, no protocol), treat it as a mediaId.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const avatarUrlIsUuid = agent.avatarUrl ? UUID_RE.test(agent.avatarUrl.trim()) : false;
  const avatarUrlIsDirect = agent.avatarUrl ? /^https?:\/\//.test(agent.avatarUrl) : false;

  // mediaId: prefer avatarMediaId (UUID); fall back to avatarUrl if it looks like a UUID
  const effectiveMediaId = agent.avatarMediaId ?? (avatarUrlIsUuid ? agent.avatarUrl : undefined);
  // url: always pass the direct CDN URL when available — MediaImage uses it as fallback on API failure
  const effectiveUrl = avatarUrlIsDirect ? agent.avatarUrl : undefined;

  const initials = agent.displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const user = agentToUser(agent);

  return (
    <div className="flex items-start gap-3 px-4 pt-4">
      <Link
        href={`/profile/${agent.id}`}
        aria-label={`View ${agent.displayName}'s profile`}
        className="shrink-0"
      >
        <div className="h-10 w-10 overflow-hidden rounded-full border border-black/10">
          <MediaImage
            mediaId={effectiveMediaId}
            url={effectiveUrl}
            alt={`${agent.displayName}'s profile photo`}
            className="h-10 w-10 rounded-full"
            width={40}
            height={40}
            transformation="avatar_sm"
            fallbackInitials={initials}
            fallbackBgColor="#0C7355"
          />
        </div>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <UserName user={user} size="sm" showHandle={true} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-black/50">
          {agent.agencyName && (
            <>
              <span aria-hidden="true">·</span>
              <span>{agent.agencyName}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <time dateTime={new Date(postedAt).toISOString()}>{formatRelativeTime(postedAt)}</time>
        </div>
      </div>
      <PostMenu items={menuItems} triggerLabel="Post options" />
    </div>
  );
}
