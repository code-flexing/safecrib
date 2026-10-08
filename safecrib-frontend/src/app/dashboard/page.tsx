"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { EmptyListingsIllustration } from "@/components/branding/EmptyListingsIllustration";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { NameHandle } from "@/components/common/NameHandle";
import { RestrictedActionModal } from "@/components/dashboard/RestrictedActionModal";
import { LikeButton } from "@/components/listings/LikeButton";
import { RecommendButton } from "@/components/listings/RecommendButton";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { normalizeVerificationStage } from "@/components/verification/VerificationBadge";
import { useNotify } from "@/components/ui/Toast";
import { useOptimisticToggle, createOptimisticKey } from "@/lib/optimistic";
import { resolveNotificationKey, getNotificationMessage } from "@/lib/toast-messages";
import {
  apiFetch,
  cachedApiFetch,
  cachedCurrentUser,
  clearClientCache,
  clearSession,
  displayName,
  getAuthenticatedDisplayName,
  getCachedApi,
  getCachedCurrentUser,
  getCachedMediaUrl,
  getPersistedVerification,
  isUnauthorizedError,
  normalizeAccountStatus,
  normalizePageStatus,
  primeCurrentUserCache,
  refreshCachedApi,
  resolveMediaUrl,
  setPersistedVerification,
  subscribeClientCacheUpdates,
  unwrapData,
  userSessionClearedEvent,
  getCachedUserAvatar,
  setCachedUserAvatar,
  type AccountStatus,
  type PageStatus,
} from "@/lib/api";

export type ListingPhotoValue =
  | string
  | { id?: string; mediaId?: string; media_id?: string; url?: string; accessUrl?: string; deliveryUrl?: string; imageUrl?: string; src?: string };

export type Listing = {
  id: string;
  ownerId?: string;
  owner?: { displayName?: string | null; profilePicture?: string | null };
  title?: string;
  description?: string;
  price?: number;
  discountAmount?: number | null;
  discountedPrice?: number;
  address?: string;
  campus?: string;
  photos?: ListingPhotoValue[];
  images?: ListingPhotoValue[];
  photo?: ListingPhotoValue;
  image?: ListingPhotoValue;
  video?: { mediaId?: string; url?: string } | null;
  likeCount?: number;
  viewCount?: number;
  commentCount?: number;
  followedPage?: boolean;
  likedByCurrentUser?: boolean;
  providerRecommendationCount?: number;
  providerTrustScore?: number | null;
  providerActiveDays?: number;
  recommendationScore?: number;
};

export type Profile = {
  id?: string;
  displayName?: unknown;
  email?: string;
  role?: string;
  profilePicture?: string;
  username?: string | null;
  studentProfileStatus?: unknown;
  studentProfile?: { profilePicture?: string };
  verification?: { stage?: string; badge?: string; badgeColor?: "green" | "blue" | "gold"; riskBlocked?: boolean; eligible?: boolean } | null;
  verificationStage?: unknown;
};

export type ListingComment = {
  id: string;
  body: string;
  parentId?: string | null;
  createdAt: string;
  user: { id: string; displayName?: string | null; username?: string | null; role?: string };
  mentions?: Array<{ user: { id: string; displayName?: string | null; username?: string | null } }>;
};

export type MentionCandidate = { id: string; displayName?: string | null; username?: string | null; role?: string };
export type StudentProfile = { profilePicture?: string } | null;
export type ProviderPage = { id?: string; status?: string; profilePicture?: string; rejectionReason?: string; reason?: string } | null;

/* ---------------------------------------------------------------------------
 * Feed colors
 *
 * The feed always sits on photos/video, so its UI uses ONE fixed, solid dark
 * palette that never depends on the app theme. Everything is scoped under
 * `.safecrib-feed` and uses !important so global theme rules (light / dark /
 * custom) cannot recolor it.
 *
 * Contrast (WCAG): #f8fafc on #111318 ≈ 17:1, #cbd5e1 on #09090b ≈ 13:1,
 * #022c22 on #10b981 ≈ 7:1.
 * ------------------------------------------------------------------------- */
const FEED_CSS = `
.safecrib-feed {
  --feed-surface: #111318;
  --feed-surface-hover: #1b1e24;
  --feed-card: #09090b;
  --feed-border: #3a3f47;
  --feed-text: #f8fafc;
  --feed-muted: #cbd5e1;
  --feed-accent: #10b981;
  --feed-accent-hover: #34d399;
  --feed-on-accent: #022c22;
}

/* Solid round buttons / pills */
.safecrib-feed .feed-surface {
  background: var(--feed-surface) !important;
  color: var(--feed-text) !important;
  border: 1px solid var(--feed-border) !important;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.5);
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
.safecrib-feed button.feed-surface:hover,
.safecrib-feed a.feed-surface:hover { background: var(--feed-surface-hover) !important; }
.safecrib-feed .feed-surface:focus-within { border-color: #6ee7b7 !important; }
.safecrib-feed .feed-surface[aria-pressed="true"] { color: #fbbf24 !important; border-color: #b45309 !important; }

/* Small chips inside a surface (e.g. clear-search button) */
.safecrib-feed .feed-chip {
  background: #262a31 !important;
  color: var(--feed-text) !important;
}
.safecrib-feed .feed-chip:hover { background: #343942 !important; }

/* Info card */
.safecrib-feed .feed-card {
  background: var(--feed-card) !important;
  color: var(--feed-text) !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
.safecrib-feed .feed-text { color: var(--feed-text) !important; }
.safecrib-feed .feed-muted { color: var(--feed-muted) !important; }
.safecrib-feed a.feed-text:hover { color: #6ee7b7 !important; }

/* Primary action: dark text on emerald for real contrast */
.safecrib-feed .feed-cta {
  background: var(--feed-accent) !important;
  color: var(--feed-on-accent) !important;
}
.safecrib-feed .feed-cta:hover { background: var(--feed-accent-hover) !important; }
.safecrib-feed .feed-badge {
  background: var(--feed-accent) !important;
  color: var(--feed-on-accent) !important;
}
.safecrib-feed .feed-badge-mark {
  color: var(--feed-on-accent) !important;
  stroke: var(--feed-on-accent) !important;
}

/* Counts under the rail sit on the photo, so they get a strong shadow */
.safecrib-feed .feed-count {
  color: #ffffff !important;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9), 0 0 2px rgba(0, 0, 0, 0.9);
}

/* Search input: immune to global input/theme/autofill styles */
.safecrib-feed .feed-input {
  background: transparent !important;
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff;
  caret-color: #6ee7b7;
  border: 0 !important;
  box-shadow: none !important;
  outline: none !important;
}
.safecrib-feed .feed-input::placeholder {
  color: var(--feed-muted) !important;
  -webkit-text-fill-color: var(--feed-muted);
  opacity: 1;
}
.safecrib-feed .feed-input:-webkit-autofill {
  -webkit-text-fill-color: #ffffff;
  box-shadow: 0 0 0 1000px var(--feed-surface) inset !important;
}

/* Like / Recommend buttons come from shared components: force the same look */
.safecrib-feed .dashboard-engagement-shell { border-radius: 9999px; }
.safecrib-feed .dashboard-engagement-shell button {
  width: 36px;
  height: 36px;
  min-height: 36px;
  padding: 0;
  border: 1px solid var(--feed-border) !important;
  border-radius: 9999px;
  color: var(--feed-text) !important;
  background: var(--feed-surface) !important;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.5);
}
.safecrib-feed .dashboard-engagement-shell button svg {
  width: 20px;
  height: 20px;
  color: var(--feed-text) !important;
}
.safecrib-feed .dashboard-engagement-shell button[aria-label="Unlike"],
.safecrib-feed .dashboard-engagement-shell button[aria-label="Unlike"] svg { color: #fb7185 !important; }
.safecrib-feed .dashboard-engagement-shell button[aria-label="Remove recommendation"],
.safecrib-feed .dashboard-engagement-shell button[aria-label="Remove recommendation"] svg { color: #6ee7b7 !important; }
.safecrib-feed .dashboard-engagement-shell button:hover { background: var(--feed-surface-hover) !important; }

/* Navigation (sidebar on desktop, bar on mobile): always a solid surface */
.safecrib-feed :is(nav, aside):not(section *) {
  background: #0b0d10 !important;
  border-color: #2a2f37 !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
`;

function FeedStyles() {
  return <style dangerouslySetInnerHTML={{ __html: FEED_CSS }} />;
}

function accountMessage(status: AccountStatus, action: string) {
  if (status === "pending" || status === "not_submitted")
    return `Your account is still under review. You'll be able to ${action} once it's approved.`;
  if (status === "rejected")
    return "Your account submission wasn't approved. Please update and resubmit your profile.";
  return null;
}

function emailNameFallback(email?: string) {
  const username = email?.split("@")[0]?.split("+")[0]?.replace(/[._-]+/g, " ").trim();
  return username ? username.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) : "";
}

function resolveAccountName(profile: Profile | null) {
  return displayName(profile) || getAuthenticatedDisplayName() || emailNameFallback(profile?.email);
}

function isUsableImageSource(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !value.includes("undefined") && !value.includes("null");
}

function extractListingImageReference(value: unknown): string | null {
  if (typeof value === "string" && isUsableImageSource(value)) return value.trim();
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const direct = candidate.accessUrl ?? candidate.deliveryUrl ?? candidate.imageUrl ?? candidate.url ?? candidate.src;
  if (typeof direct === "string" && isUsableImageSource(direct)) return direct.trim();
  const mediaId = candidate.mediaId ?? candidate.media_id ?? candidate.id;
  if (typeof mediaId === "string" && isUsableImageSource(mediaId)) return mediaId.trim();
  return null;
}

function getListingImageReference(listing: Listing): string | null {
  const collection = Array.isArray(listing.photos) && listing.photos.length > 0
    ? listing.photos
    : Array.isArray(listing.images) && listing.images.length > 0
    ? listing.images
    : null;
  if (collection) {
    for (const item of collection) {
      const reference = extractListingImageReference(item);
      if (reference) return reference;
    }
  }
  return extractListingImageReference(listing.photo) ?? extractListingImageReference(listing.image);
}

function getListingImageUrl(listing: Listing): string | null {
  const direct = [listing.photo, listing.image, ...(listing.photos ?? []), ...(listing.images ?? [])]
    .map(extractListingImageReference)
    .find((candidate): candidate is string => Boolean(candidate && candidate.startsWith("http")));
  if (direct) return direct;
  const ref = getListingImageReference(listing);
  return ref && ref.startsWith("http") ? ref : null;
}

function formatListingPrice(listing: Listing) {
  if (typeof listing.price !== "number") return "Contact for pricing";
  const price = typeof listing.discountedPrice === "number" && listing.discountedPrice < listing.price
    ? listing.discountedPrice
    : listing.price;
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(price);
}

function hasDiscount(listing: Listing) {
  return typeof listing.discountAmount === "number" && listing.discountAmount > 0;
}

function formatOriginalPrice(listing: Listing) {
  if (typeof listing.price !== "number") return "";
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(listing.price);
}

function formatEngagementCount(count: number) {
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

/* ---------- Price ---------- */
function ListingPriceTag({ listing }: { listing: Listing }) {
  const priced = typeof listing.price === "number";
  const isDiscounted = priced && hasDiscount(listing);
  return (
    <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
      <span className={`feed-text font-display font-extrabold ${priced ? "text-xl" : "text-sm font-semibold"}`}>
        {formatListingPrice(listing)}
      </span>
      {priced && <span className="feed-muted text-xs font-medium">/ yr</span>}
      {isDiscounted && (
        <span className="feed-muted text-xs font-medium line-through">{formatOriginalPrice(listing)}</span>
      )}
    </div>
  );
}

function ListingCardImage({ src, fallbackSrc, alt, priority = false }: { src: string; fallbackSrc: string | null; alt: string; priority?: boolean }) {
  const [useFallback, setUseFallback] = useState(false);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  useEffect(() => {
    setUseFallback(false);
    setLoadedSrc(null);
  }, [src]);

  const imageSrc = useFallback && fallbackSrc ? fallbackSrc : src;

  return (
    <div className="absolute inset-0 overflow-hidden bg-neutral-950">
      {loadedSrc !== imageSrc && <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-white/5" />}
      <Image
        src={imageSrc}
        alt={alt}
        fill
        priority={priority}
        sizes="100vw"
        quality={90}
        onLoad={() => setLoadedSrc(imageSrc)}
        className={`object-cover transition-all duration-700 ease-out ${loadedSrc === imageSrc ? "scale-100 opacity-100" : "scale-105 opacity-0"}`}
        onError={() => {
          if (fallbackSrc && fallbackSrc !== src) setUseFallback(true);
        }}
      />
    </div>
  );
}

function ListingCardVideo({
  video,
  poster,
  fallbackSrc,
  alt,
  onProgress,
}: {
  video: Listing["video"];
  poster: string | null;
  fallbackSrc: string | null;
  alt: string;
  onProgress?: (currentTime: number, duration: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const directVideoUrl = video?.url && isUsableImageSource(video.url) ? video.url.trim() : null;
  const [isActive, setIsActive] = useState(false);
  const [isNear, setIsNear] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(directVideoUrl);
  const [videoFailed, setVideoFailed] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showPlayIcon, setShowPlayIcon] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof IntersectionObserver === "undefined") {
      setIsActive(true);
      setIsNear(true);
      return;
    }

    const activeObserver = new IntersectionObserver(([entry]) => {
      setIsActive((entry?.intersectionRatio ?? 0) >= 0.7);
    }, { threshold: [0, 0.7] });
    const preloadMargin = `${window.innerHeight}px 0px`;
    const warmObserver = new IntersectionObserver(([entry]) => {
      setIsNear(Boolean(entry?.isIntersecting));
    }, { rootMargin: preloadMargin });
    activeObserver.observe(container);
    warmObserver.observe(container);
    return () => {
      activeObserver.disconnect();
      warmObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isNear || videoUrl || videoFailed) return;
    if (!video?.mediaId) {
      setVideoFailed(true);
      return;
    }

    let active = true;
    void resolveMediaUrl(video.mediaId)
      .then((resolvedUrl) => {
        if (!active) return;
        if (resolvedUrl && isUsableImageSource(resolvedUrl)) setVideoUrl(resolvedUrl);
        else setVideoFailed(true);
      })
      .catch(() => {
        if (active) setVideoFailed(true);
      });
    return () => { active = false; };
  }, [isNear, video?.mediaId, videoFailed, videoUrl]);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    if (isActive && videoUrl && !videoFailed) {
      void element.play().catch(() => undefined);
    } else {
      element.pause();
    }
  }, [isActive, videoFailed, videoUrl]);

  const togglePlayback = () => {
    const element = videoRef.current;
    if (!element) return;
    if (element.paused) {
      void element.play().catch(() => undefined);
      setIsPlaying(true);
    } else {
      element.pause();
      setIsPlaying(false);
    }
    setShowPlayIcon(true);
    setTimeout(() => setShowPlayIcon(false), 600);
  };

  return (
    <div ref={containerRef} className="absolute inset-0 select-none overflow-hidden bg-neutral-950">
      {videoUrl && !videoFailed ? (
        <>
          <video
            ref={videoRef}
            src={videoUrl}
            poster={poster ?? fallbackSrc ?? undefined}
            role="button"
            tabIndex={0}
            aria-label={`${alt} video. ${isPlaying ? "Playing" : "Paused"}. Tap to toggle.`}
            data-playing={isPlaying}
            data-current-time={currentTime}
            data-duration={duration}
            autoPlay={isActive}
            muted={isMuted}
            loop
            playsInline
            preload={isActive ? "auto" : isNear ? "metadata" : "none"}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={(event) => {
              const time = event.currentTarget.currentTime;
              setCurrentTime(time);
              onProgress?.(time, duration);
            }}
            onLoadedMetadata={(event) => {
              const mediaDuration = event.currentTarget.duration;
              setDuration(mediaDuration);
              onProgress?.(currentTime, mediaDuration);
            }}
            onError={() => setVideoFailed(true)}
            onClick={togglePlayback}
            onKeyDown={(event) => {
              if (event.key !== " " && event.key !== "Enter") return;
              event.preventDefault();
              togglePlayback();
            }}
            className="h-full w-full cursor-pointer object-cover"
          />
          {showPlayIcon && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center animate-out fade-out duration-500">
              <div className="feed-surface flex h-20 w-20 items-center justify-center rounded-full">
                <Icon name={isPlaying ? "play" : "pause"} className="h-10 w-10 fill-current" />
              </div>
            </div>
          )}
        </>
      ) : poster || fallbackSrc ? (
        <ListingCardImage src={poster ?? fallbackSrc!} fallbackSrc={fallbackSrc} alt={alt} />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-white/5" />
      )}

      {/* Audio toggle */}
      {videoUrl && !videoFailed && (
        <div className="absolute right-3 top-20 z-40 transition-transform active:scale-95">
          <button
            type="button"
            onClick={() => setIsMuted((muted) => !muted)}
            aria-label={isMuted ? "Unmute video" : "Mute video"}
            title={isMuted ? "Unmute sound" : "Mute sound"}
            className="feed-surface flex h-9 w-9 items-center justify-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300"
          >
            <Icon name={isMuted ? "volume-x" : "volume-2"} className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function ListingComments({
  listingId,
  ownerId,
  onCountChange,
  onClose,
}: {
  listingId: string;
  ownerId?: string;
  onCountChange: (count: number) => void;
  onClose: (listingId: string) => void;
}) {
  const [comments, setComments] = useState<ListingComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentBody, setCommentBody] = useState("");
  const [commentMentionIds, setCommentMentionIds] = useState<string[]>([]);
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [taggedUsers, setTaggedUsers] = useState<MentionCandidate[]>([]);
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [commentError, setCommentError] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const inputId = `home-comment-${listingId}`;
  const titleId = useId();
  const closeDiscussion = useCallback(() => onClose(listingId), [listingId, onClose]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void cachedApiFetch<unknown>(`/api/v1/listings/${encodeURIComponent(listingId)}/comments`)
      .then((response) => {
        if (!active) return;
        const list = unwrapData<ListingComment[]>(response);
        const items = Array.isArray(list) ? list : [];
        setComments(items);
        onCountChange(items.length);
      })
      .catch(() => {
        if (active) setCommentError("We could not load comments. Please refresh to retry.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [listingId, onCountChange]);

  const submitComment = async () => {
    const body = commentBody.trim();
    if (!body || body.length > 1000) {
      setCommentError("Write a comment up to 1,000 characters.");
      return;
    }
    setCommentSubmitting(true);
    setCommentError("");
    try {
      const response = await apiFetch<ListingComment>(`/api/v1/listings/${encodeURIComponent(listingId)}/comments`, {
        method: "POST",
        body: JSON.stringify({
          body,
          parentId: replyParentId ?? undefined,
          mentionUserIds: commentMentionIds,
        }),
      });
      const newComment = unwrapData<ListingComment>(response);
      setComments((current) => [...current, newComment]);
      onCountChange(comments.length + 1);
      setCommentBody("");
      setReplyParentId(null);
      setCommentMentionIds([]);
      setTaggedUsers([]);
    } catch {
      setCommentError("Could not post comment. Please try again.");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const updateCommentBody = (value: string) => {
    setCommentBody(value);
    setCommentMentionIds((current) => current.filter((mentionId) => {
      const person = taggedUsers.find((user) => user.id === mentionId);
      const handle = person?.username ?? "";
      return person ? value.toLocaleLowerCase().includes(`@${handle.toLocaleLowerCase()}`) : false;
    }));
    const match = value.match(/(?:^|\s)@([^@\n]*)$/);
    if (!match) {
      setMentionCandidates([]);
      return;
    }
    const query = (match[1] ?? "").trim();
    if (!query) {
      setMentionCandidates([]);
      return;
    }
    void apiFetch<{ users: MentionCandidate[] }>(`/api/v1/users/discover?q=${encodeURIComponent(query)}`)
      .then((response) => setMentionCandidates(unwrapData<{ users: MentionCandidate[] }>(response).users.slice(0, 5)))
      .catch(() => setMentionCandidates([]));
  };

  const selectMention = (person: MentionCandidate) => {
    const mentionStart = commentBody.lastIndexOf("@");
    const handle = person.username ?? person.displayName ?? "member";
    setCommentBody(`${commentBody.slice(0, mentionStart)}@${handle} `);
    setCommentMentionIds((current) => current.includes(person.id) ? current : [...current, person.id]);
    setTaggedUsers((current) => current.some((item) => item.id === person.id) ? current : [...current, person]);
    setMentionCandidates([]);
  };

  const renderComment = (item: ListingComment, depth = 0): ReactNode => {
    const replies = comments.filter((candidate) => candidate.parentId === item.id);
    const isCreatorReply = Boolean(item.parentId && item.user.id === ownerId);
    const createdAt = new Date(item.createdAt);
    const commentTime = Number.isNaN(createdAt.getTime())
      ? "Just now"
      : formatDistanceToNow(createdAt, { addSuffix: true });

    return (
      <li key={item.id} className="py-3.5" style={{ marginLeft: `${Math.min(depth, 4) * 16}px` }}>
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-700">
            {(item.user.displayName?.[0] ?? item.user.username?.[0] ?? "?").toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Link href={`/profile/${encodeURIComponent(item.user.id)}`} className="font-semibold text-neutral-900 transition hover:text-emerald-600">
                <NameHandle displayName={item.user.displayName} username={item.user.username} />
              </Link>
              {isCreatorReply && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  Host
                </span>
              )}
              <time dateTime={item.createdAt} className="font-normal text-neutral-400">
                • {commentTime}
              </time>
            </div>
            {item.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">{item.body}</p>}
            {item.mentions && item.mentions.length > 0 && (
              <p className="mt-1 text-xs text-neutral-400">
                Tagged: {item.mentions.map((m) => `@${m.user.username ?? m.user.displayName ?? "member"}`).join(", ")}
              </p>
            )}
            <div className="mt-2 flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  setReplyParentId(item.id);
                  setCommentBody("");
                  setCommentError("");
                  document.getElementById(inputId)?.focus();
                }}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
              >
                Reply
              </button>
            </div>
          </div>
        </div>
        {replies.length > 0 && (
          <ul className="mt-2 space-y-2 border-l-2 border-neutral-100 pl-3">
            {replies.map((reply) => renderComment(reply, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const topLevel = comments.filter((comment) => !comment.parentId);

  return createPortal(
    <Modal open onClose={closeDiscussion} titleId={titleId}>
      <div className="flex max-h-[85dvh] min-h-[50dvh] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-neutral-200 sm:hidden" />
        <header className="flex shrink-0 items-center justify-between border-b border-neutral-100 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <h2 id={titleId} className="text-base font-bold text-neutral-900">
              Comments
            </h2>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-600">
              {comments.length}
            </span>
          </div>
          <button
            type="button"
            onClick={closeDiscussion}
            aria-label="Close comments"
            className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6">
          {loading ? (
            <div className="space-y-4 py-4" aria-hidden="true">
              <Skeleton className="h-4 w-40 rounded-full" />
              <Skeleton className="h-12 w-full rounded-2xl" />
              <Skeleton className="h-12 w-4/5 rounded-2xl" />
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {topLevel.map((comment) => renderComment(comment))}
              {!comments.length && !commentError && (
                <li className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
                    <Icon name="message-circle" className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-neutral-700">No comments yet</p>
                  <p className="mt-0.5 text-xs text-neutral-400">Be the first to share your thoughts about this crib.</p>
                </li>
              )}
            </ul>
          )}
          <div className="pb-2 pt-4">
            <Link href={`/dashboard/listings/${listingId}#comments`} className="text-xs font-semibold text-emerald-600 hover:underline">
              Open full discussion thread →
            </Link>
          </div>
        </div>

        <div className="shrink-0 border-t border-neutral-100 bg-neutral-50/50 p-4 sm:px-6">
          {replyParentId && (
            <div className="mb-2 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-neutral-500">
              <span>Replying to comment...</span>
              <button type="button" onClick={() => setReplyParentId(null)} className="font-semibold text-emerald-700 hover:underline">
                Cancel
              </button>
            </div>
          )}
          <label htmlFor={inputId} className="sr-only">{replyParentId ? "Write a reply" : "Write a comment"}</label>
          <div className="relative">
            <textarea
              id={inputId}
              value={commentBody}
              onChange={(event) => updateCommentBody(event.target.value)}
              maxLength={1000}
              rows={2}
              placeholder={replyParentId ? "Write your reply..." : "Ask a question or leave a note..."}
              className="w-full resize-none rounded-2xl border border-neutral-200 bg-white p-3.5 text-sm text-neutral-900 placeholder:text-neutral-400 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
            {mentionCandidates.length > 0 && (
              <ul aria-label="Tag a user" className="absolute bottom-full left-0 z-20 mb-2 max-h-44 w-full overflow-auto rounded-2xl border border-neutral-200 bg-white p-1 shadow-xl">
                {mentionCandidates.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      onClick={() => selectMention(person)}
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition hover:bg-emerald-50"
                    >
                      <NameHandle displayName={person.displayName} username={person.username} />
                      <span className="text-xs font-medium text-neutral-400">{person.role?.toLowerCase()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-[11px] font-medium text-neutral-400">
              {commentBody.length > 0 ? `${commentBody.length}/1000` : ""}
            </span>
            <Button
              type="button"
              loading={commentSubmitting}
              onClick={() => void submitComment()}
              className="rounded-full bg-emerald-600 px-5 py-2 font-semibold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95"
            >
              {replyParentId ? "Post Reply" : "Post Comment"}
            </Button>
          </div>
          {commentError && <p role="alert" className="mt-2 text-xs font-medium text-rose-600">{commentError}</p>}
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

type ListingActionTrayProps = {
  listing: Listing;
  isOpen: boolean;
  isSaved: boolean;
  isRecommended: boolean;
  canRecommend: boolean;
  menuOpen: boolean;
  isStudent: boolean;
  commentCount: number;
  recommendationDisabled: boolean;
  role: string;
  onToggle: () => void;
  onClose: () => void;
  onLike: (listingId: string, liked: boolean) => Promise<void>;
  onComment: () => void;
  onRecommend: (providerId: string, recommended: boolean) => Promise<void>;
  onSave: () => void;
  onMore: () => void;
  onCloseMenu: () => void;
};

/* 36px solid buttons (was 40px) */
const railBtn =
  "feed-surface flex h-9 w-9 items-center justify-center rounded-full transition-transform active:scale-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300";
const railCount = "feed-count text-[11px] font-semibold leading-none";

/* ---------- Right-hand engagement rail ---------- */
function ListingActionTray({
  listing,
  isSaved,
  isRecommended,
  canRecommend,
  menuOpen,
  isStudent,
  commentCount,
  recommendationDisabled,
  role,
  onLike,
  onComment,
  onRecommend,
  onSave,
  onMore,
  onCloseMenu,
}: ListingActionTrayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        onCloseMenu();
      }
    };
    const closeOnEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMenu();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEsc);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEsc);
    };
  }, [menuOpen, onCloseMenu]);

  const copyListingLink = async () => {
    try {
      const url = `${window.location.origin}/dashboard/listings/${listing.id}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      onCloseMenu();
    } catch {
      // ignore
    }
  };

  return (
    <div
      ref={rootRef}
      className="relative flex select-none flex-col items-center gap-3"
      data-listing-menu-open={menuOpen ? "true" : undefined}
    >
      {/* Like */}
      <div className="flex flex-col items-center gap-1">
        <div className="dashboard-engagement-shell transition-transform active:scale-90">
          <LikeButton
            listingId={listing.id}
            initialLikeCount={listing.likeCount ?? 0}
            initialIsLiked={listing.likedByCurrentUser ?? false}
            onLike={onLike}
            size="lg"
            showLabel={false}
          />
        </div>
        <span className={railCount}>{formatEngagementCount(listing.likeCount ?? 0)}</span>
      </div>

      {/* Comments */}
      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={onComment}
          aria-label={`Open comments, ${commentCount} total`}
          className={railBtn}
        >
          <Icon name="message-circle" className="h-5 w-5" />
        </button>
        <span className={railCount}>{formatEngagementCount(commentCount)}</span>
      </div>

      {/* Recommend (trust) */}
      {listing.ownerId && canRecommend && (
        <div className="flex flex-col items-center gap-1">
          <div className="dashboard-engagement-shell transition-transform active:scale-90">
            <RecommendButton
              providerId={listing.ownerId}
              initialRecommendationCount={listing.providerRecommendationCount ?? 0}
              initialIsRecommended={isRecommended}
              onRecommend={onRecommend}
              disabled={recommendationDisabled}
              role={role}
              size="lg"
              showLabel={false}
            />
          </div>
          <span className={railCount}>{formatEngagementCount(listing.providerRecommendationCount ?? 0)}</span>
        </div>
      )}

      {/* Save */}
      {isStudent && (
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={onSave}
            aria-pressed={isSaved}
            aria-label={isSaved ? "Remove from bookmarks" : "Save to bookmarks"}
            className={railBtn}
          >
            <Icon name="bookmark" className={`h-5 w-5 ${isSaved ? "fill-current" : ""}`} />
          </button>
          <span className={railCount}>{isSaved ? "Saved" : "Save"}</span>
        </div>
      )}

      {/* Share = copy link */}
      <div className="flex flex-col items-center gap-1">
        <button type="button" onClick={() => void copyListingLink()} aria-label="Copy link" className={railBtn}>
          <Icon name="share-2" className="h-5 w-5" />
        </button>
        <span className={railCount}>{copied ? "Copied" : "Share"}</span>
      </div>

      {/* More */}
      <div className="relative">
        <button
          type="button"
          onClick={onMore}
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={railBtn}
        >
          <Icon name="more-horizontal" className="h-5 w-5" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="feed-surface absolute bottom-0 right-11 z-50 w-44 overflow-hidden rounded-xl p-1 animate-in fade-in zoom-in-95 duration-150"
          >
            <Link
              role="menuitem"
              href={`/dashboard/listings/${listing.id}`}
              onClick={onCloseMenu}
              className="feed-text flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition hover:bg-white/10"
            >
              <Icon name="external-link" className="h-4 w-4" />
              Open post
            </Link>
            {listing.ownerId && (
              <Link
                role="menuitem"
                href={`/profile/${encodeURIComponent(listing.ownerId)}`}
                onClick={onCloseMenu}
                className="feed-text flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition hover:bg-white/10"
              >
                <Icon name="user" className="h-4 w-4" />
                View provider
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function extractListings(value: unknown): Listing[] {
  const unwrapped = unwrapData<unknown>(value);
  if (Array.isArray(unwrapped)) return unwrapped as Listing[];
  if (typeof unwrapped === "object" && unwrapped !== null && "items" in unwrapped && Array.isArray((unwrapped as { items: unknown }).items)) {
    return (unwrapped as { items: Listing[] }).items;
  }
  return [];
}

export default function DashboardPage() {
  const router = useRouter();
  const { notifyError, notifySuccess } = useNotify();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("not_submitted");
  const [pageStatus, setPageStatus] = useState<PageStatus>("none");
  const [listings, setListings] = useState<Listing[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [recommendedProviderIds, setRecommendedProviderIds] = useState<string[]>([]);
  const [recommendationsLoaded, setRecommendationsLoaded] = useState(false);
  const [pendingEngagement, setPendingEngagement] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [resolvedProviderAvatars, setResolvedProviderAvatars] = useState<Record<string, string | null>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [openSupportCount, setOpenSupportCount] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      const token = localStorage.getItem("safecrib_access_token");
      if (!token) return false;
      return (
        localStorage.getItem("safecrib_cache:/api/v1/users/me") === null &&
        localStorage.getItem("safecrib_cache:/api/v1/auth/me") === null
      );
    } catch {
      return true;
    }
  });
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [openActionTrayId, setOpenActionTrayId] = useState<string | null>(null);
  const [videoProgress, setVideoProgress] = useState<{ listingId: string; currentTime: number; duration: number } | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const scrollRestoredRef = useRef(false);
  const [resolvedListingImages, setResolvedListingImages] = useState<Record<string, string | null>>({});
  const [newPostsAvailable, setNewPostsAvailable] = useState(false);
  const [openCommentIds, setOpenCommentIds] = useState<Set<string>>(() => new Set());
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});

  useEffect(() =>
    subscribeClientCacheUpdates(({ path, value }) => {
      if (path === "/api/v1/users/me" || path === "/api/v1/auth/me") {
        const currentUser = unwrapData<Profile | null>(value);
        if (!currentUser) return;
        setProfile({ ...currentUser, displayName: displayName(currentUser) || getAuthenticatedDisplayName() });
        const userVerification = currentUser.verification ?? getPersistedVerification(currentUser.id);
        if (userVerification) {
          normalizeVerificationStage(userVerification);
        }
        if (["STUDENT", "UNVERIFIED"].includes(String(currentUser.role ?? "").toUpperCase())) {
          setAccountStatus(normalizeAccountStatus(currentUser.studentProfileStatus));
        }
        const picture = currentUser.profilePicture ?? currentUser.studentProfile?.profilePicture;
        if (currentUser.id) {
          const cachedAvatar = getCachedUserAvatar(currentUser.id);
          if (cachedAvatar) setProfileImage(cachedAvatar);
        }
        const cachedPicture = getCachedMediaUrl(picture);
        if (cachedPicture) {
          setProfileImage(cachedPicture);
          if (currentUser.id) setCachedUserAvatar(currentUser.id, cachedPicture, picture);
        }
        if (picture) void resolveMediaUrl(picture).then((url) => {
          if (url) {
            setProfileImage(url);
            if (currentUser.id) setCachedUserAvatar(currentUser.id, url, picture);
          }
        });
        return;
      }

      if (path === "/api/v1/student-profiles/me") {
        const student = unwrapData<StudentProfile>(value);
        const currentUser = getCachedCurrentUser<Profile>();
        const picture = currentUser?.profilePicture ?? student?.profilePicture;
        if (currentUser?.id) {
          const cachedAvatar = getCachedUserAvatar(currentUser.id);
          if (cachedAvatar) setProfileImage(cachedAvatar);
        }
        const cachedPicture = getCachedMediaUrl(picture);
        if (cachedPicture) {
          setProfileImage(cachedPicture);
          if (currentUser?.id) setCachedUserAvatar(currentUser.id, cachedPicture, picture);
        }
        if (picture) void resolveMediaUrl(picture).then((url) => {
          if (url) {
            setProfileImage(url);
            if (currentUser?.id) setCachedUserAvatar(currentUser.id, url, picture);
          }
        });
        return;
      }

      if (path === "/api/v1/provider-pages/me") {
        const page = unwrapData<ProviderPage>(value);
        setPageStatus(normalizePageStatus(page?.status));
        const currentUser = getCachedCurrentUser<Profile>();
        const picture = currentUser?.profilePicture ?? page?.profilePicture;
        if (currentUser?.id) {
          const cachedAvatar = getCachedUserAvatar(currentUser.id);
          if (cachedAvatar) setProfileImage(cachedAvatar);
        }
        const cachedPicture = getCachedMediaUrl(picture);
        if (cachedPicture) {
          setProfileImage(cachedPicture);
          if (currentUser?.id) setCachedUserAvatar(currentUser.id, cachedPicture, picture);
        }
        if (picture) void resolveMediaUrl(picture).then((url) => {
          if (url) {
            setProfileImage(url);
            if (currentUser?.id) setCachedUserAvatar(currentUser.id, url, picture);
          }
        });
        return;
      }

      if (path === "/api/v1/listings") {
        setListings(extractListings(value));
        return;
      }

      if (path === "/api/v1/listings/bookmarks") {
        const bookmarks = unwrapData<Listing[]>(value);
        setBookmarkedIds(Array.isArray(bookmarks) ? bookmarks.map((listing) => listing.id) : []);
        return;
      }

      if (path === "/api/v1/trust/me/recommendations") {
        const recommendations = unwrapData<string[]>(value);
        setRecommendedProviderIds(Array.isArray(recommendations) ? recommendations : []);
        setRecommendationsLoaded(true);
        return;
      }

      if (path === "/api/v1/support/conversations") {
        const conversations = unwrapData<unknown[]>(value);
        setOpenSupportCount(
          Array.isArray(conversations)
            ? conversations.filter(
                (conversation) =>
                  typeof conversation === "object" &&
                  conversation !== null &&
                  "status" in conversation &&
                  String(conversation.status).toUpperCase() === "OPEN",
              ).length
            : 0,
        );
      }
    }), []);

  useEffect(() => {
    const handleSessionCleared = () => {
      setProfile(null);
      setAccountStatus("not_submitted");
      setPageStatus("none");
      setListings([]);
      setBookmarkedIds([]);
      setRecommendedProviderIds([]);
      setRecommendationsLoaded(false);
      setOpenSupportCount(0);
      setProfileImage(null);
      setResolvedListingImages({});
    };

    window.addEventListener(userSessionClearedEvent, handleSessionCleared);
    return () => window.removeEventListener(userSessionClearedEvent, handleSessionCleared);
  }, []);

  useEffect(() => {
    const cachedProfile = getCachedCurrentUser<Profile>();
    const hasCachedData = cachedProfile !== null;
    if (!hasCachedData) setDashboardLoading(true);

    const cachedListings = getCachedApi<unknown>("/api/v1/listings");
    if (cachedListings) {
      setListings(extractListings(cachedListings));
      void refreshCachedApi<unknown>("/api/v1/listings")
        .then((response) => {
          setListings(extractListings(response));
        })
        .catch(() => undefined);
    }
    if (cachedProfile) {
      setProfile({ ...cachedProfile, displayName: resolveAccountName(cachedProfile) });
      normalizeVerificationStage(getPersistedVerification(cachedProfile.id));
      if (cachedProfile.id) {
        const cachedAvatar = getCachedUserAvatar(cachedProfile.id);
        if (cachedAvatar) setProfileImage(cachedAvatar);
      }
      const cachedPicture = getCachedMediaUrl(cachedProfile.profilePicture ?? cachedProfile.studentProfile?.profilePicture);
      if (cachedPicture) {
        setProfileImage(cachedPicture);
        if (cachedProfile.id) setCachedUserAvatar(cachedProfile.id, cachedPicture, cachedProfile.profilePicture ?? cachedProfile.studentProfile?.profilePicture);
      }
    } else {
      const tokenName = getAuthenticatedDisplayName();
      if (tokenName) setProfile({ displayName: tokenName });
    }

    void cachedCurrentUser<Profile>().then(async (currentUser) => {
      let user = currentUser;
      if (!displayName(user)) user = { ...user, displayName: resolveAccountName(user) };
      primeCurrentUserCache(user);
      setProfile({ ...user, displayName: displayName(user) || getAuthenticatedDisplayName() });
      const role = String(user.role ?? "").toUpperCase();
      const immediateVerification = user.verification ?? getPersistedVerification(user.id);
      if (immediateVerification) {
        normalizeVerificationStage(immediateVerification);
      } else {
        normalizeVerificationStage(getPersistedVerification(user.id));
      }
      if (["AGENT", "LANDLORD"].includes(role) && user.id) {
        const today = new Date().toISOString().slice(0, 10);
        const activityKey = `safecrib-provider-active-day:${user.id}`;
        if (localStorage.getItem(activityKey) !== today) {
          void apiFetch("/api/v1/trust/me/activity", { method: "POST" })
            .then(() => localStorage.setItem(activityKey, today))
            .catch(() => setActionMessage("We could not record today’s activity. Please refresh to retry."));
        }
      }
      const studentMode = ["STUDENT", "UNVERIFIED"].includes(role);
      const studentStatusRequest = studentMode
        ? apiFetch<unknown>("/api/v1/student-profiles/status")
            .then(unwrapData<unknown>)
            .then(normalizeAccountStatus)
            .catch(() => null)
        : Promise.resolve(null);
      const cachedListingsRaw = getCachedApi<unknown>("/api/v1/listings");
      const homesRequest = cachedListingsRaw !== null
        ? Promise.resolve(null)
        : cachedApiFetch<unknown>("/api/v1/listings").then(extractListings).catch(() => []);
      const verificationRequest = ["STUDENT", "AGENT", "LANDLORD", "ADMIN"].includes(role) && !user.verification
        ? apiFetch<unknown>("/api/v1/trust/me/verification-stage")
            .then((response) => {
              const stage = normalizeVerificationStage(response);
              if (stage) setPersistedVerification(user.id, response);
              return stage;
            })
            .catch(() => null)
        : Promise.resolve(null);
      void verificationRequest.then(() => undefined);
      const [studentProfile, providerPage, homes, bookmarks, conversations, recommendations] = await Promise.all([
        studentMode ? cachedApiFetch<StudentProfile>("/api/v1/student-profiles/me").catch(() => null) : Promise.resolve(null),
        cachedApiFetch<ProviderPage>("/api/v1/provider-pages/me").catch(() => null),
        homesRequest,
        role === "STUDENT" ? cachedApiFetch<Listing[]>("/api/v1/listings/bookmarks").catch(() => []) : Promise.resolve([]),
        cachedApiFetch<unknown>("/api/v1/support/conversations").catch(() => []),
        role === "STUDENT"
          ? cachedApiFetch<string[]>("/api/v1/trust/me/recommendations")
              .then((value) => {
                setRecommendationsLoaded(true);
                return value;
              })
              .catch((error: unknown) => {
                setActionMessage(error instanceof Error ? error.message : "We could not load your recommendations.");
                return [];
              })
          : Promise.resolve([]),
      ]);
      return { user, studentProfile, studentStatusRequest, providerPage, homes, bookmarks, conversations, recommendations };
    }).then(({ user, studentProfile, studentStatusRequest, providerPage, homes, bookmarks, conversations, recommendations }) => {
      setProfile({ ...user, displayName: displayName(user) || getAuthenticatedDisplayName() });
      const role = String(user.role ?? "").toUpperCase();
      const studentMode = ["STUDENT", "UNVERIFIED"].includes(role);
      const profileStatus = normalizeAccountStatus(user.studentProfileStatus);
      const providerVerified = ["AGENT", "LANDLORD"].includes(role) && String(providerPage?.status ?? "").toUpperCase() === "VERIFIED";
      const studentProfileData = unwrapData<StudentProfile>(studentProfile);
      const pictureReference = user.profilePicture ?? user.studentProfile?.profilePicture ?? studentProfileData?.profilePicture ?? providerPage?.profilePicture;
      setAccountStatus(providerVerified ? "approved" : ["AGENT", "LANDLORD"].includes(role) ? "pending" : normalizeAccountStatus(profileStatus));
      if (studentMode) {
        void studentStatusRequest.then((latestStatus) => {
          if (!latestStatus) return;
          clearClientCache("/api/v1/student-profiles/status");
          setAccountStatus(latestStatus);
          if (latestStatus === "not_submitted") {
            void apiFetch("/api/v1/notifications/student-profile-reminder", { method: "POST" })
              .catch((reminderError: unknown) => console.error("Could not add the student profile reminder to notifications.", reminderError));
          }
        });
      }
      if (user.id) {
        const cachedAvatar = getCachedUserAvatar(user.id);
        if (cachedAvatar) setProfileImage(cachedAvatar);
      }
      if (pictureReference) {
        const cachedPicture = getCachedMediaUrl(pictureReference);
        if (cachedPicture) {
          setProfileImage(cachedPicture);
          if (user.id) setCachedUserAvatar(user.id, cachedPicture, pictureReference);
        }
        void resolveMediaUrl(pictureReference).then((url) => {
          if (url) {
            setProfileImage(url);
            if (user.id) setCachedUserAvatar(user.id, url, pictureReference);
          }
        }).catch(() => undefined);
      }
      setPageStatus(normalizePageStatus(providerPage?.status));
      if (homes) setListings(extractListings(homes));
      setBookmarkedIds(Array.isArray(bookmarks) ? bookmarks.map((listing) => listing.id) : []);
      setRecommendedProviderIds(Array.isArray(recommendations) ? recommendations : []);
      const conversationList = Array.isArray(conversations) ? conversations : [];
      setOpenSupportCount(conversationList.filter((conversation) => typeof conversation === "object" && conversation !== null && "status" in conversation && String(conversation.status).toUpperCase() === "OPEN").length);
    }).catch((loadError: unknown) => {
      if (isUnauthorizedError(loadError)) {
        clearSession();
        router.replace("/login?reason=session-expired");
        setDashboardLoading(false);
        return;
      }
      setProfile(null);

      setAccountStatus("not_submitted");
      setPageStatus("none");
      setListings([]);
      setBookmarkedIds([]);
    }).finally(() => {
      setDashboardLoading(false);
    });
  }, [router]);

  useEffect(() => {
    const nextImageMap: Record<string, string | null> = {};
    listings.forEach((listing) => {
      const imageReference = getListingImageReference(listing);
      if (!imageReference) return;
      const fallbackUrl = getListingImageUrl(listing);
      if (isUsableImageSource(imageReference)) {
        nextImageMap[listing.id] = imageReference;
        return;
      }

      const cachedImage = getCachedMediaUrl(imageReference, "listing_hero");
      if (cachedImage) {
        nextImageMap[listing.id] = cachedImage;
        return;
      }
      if (fallbackUrl) nextImageMap[listing.id] = fallbackUrl;
      void resolveMediaUrl(imageReference, "listing_hero")
        .catch(() => null)
        .then((resolvedUrl) => resolvedUrl ?? resolveMediaUrl(imageReference))
        .then((resolvedUrl) => {
          if (resolvedUrl && isUsableImageSource(resolvedUrl)) {
            setResolvedListingImages((current) => ({ ...current, [listing.id]: resolvedUrl }));
          }
        }).catch(() => undefined);
    });
    if (Object.keys(nextImageMap).length > 0) {
      setResolvedListingImages((current) => ({ ...current, ...nextImageMap }));
    }
  }, [listings]);

  useEffect(() => {
    let active = true;
    const resolveProviderAvatar = (listingId: string, picture?: string | null) => {
      const reference = picture?.trim();
      if (!reference) return;
      const setAvatar = (url: string) => {
        if (active && isUsableImageSource(url)) {
          setResolvedProviderAvatars((current) => ({ ...current, [listingId]: url }));
        }
      };

      if (/^(https?:|data:|blob:|\/)/i.test(reference)) {
        setAvatar(reference);
        return;
      }
      const cachedPicture = getCachedMediaUrl(reference, "avatar_sm");
      if (cachedPicture) {
        setAvatar(cachedPicture);
        return;
      }
      void resolveMediaUrl(reference, "avatar_sm").then((url) => {
        if (url) setAvatar(url);
      }).catch(() => undefined);
    };

    listings.forEach((listing) => {
      if (!listing.ownerId) return;
      if (listing.owner?.profilePicture) {
        resolveProviderAvatar(listing.id, listing.owner.profilePicture);
        return;
      }
      void apiFetch<unknown>(`/api/v1/users/${encodeURIComponent(listing.ownerId)}/public-profile`)
        .then((response) => unwrapData<{ profilePicture?: string | null } | null>(response))
        .then((publicProfile) => resolveProviderAvatar(listing.id, publicProfile?.profilePicture))
        .catch(() => undefined);
    });
    return () => { active = false; };
  }, [listings]);

  useEffect(() => {
    if (!openMenuId) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('[data-listing-menu-open="true"]')) {
        setOpenMenuId(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (accountStatus !== "pending" || !["STUDENT", "UNVERIFIED"].includes(String(profile?.role ?? "").toUpperCase())) return;

    let checkingStatus = false;
    let active = true;
    const refreshStatus = async () => {
      if (!active || checkingStatus || document.visibilityState === "hidden") return;
      checkingStatus = true;
      try {
        const response = unwrapData<unknown>(
          await apiFetch<unknown>("/api/v1/student-profiles/status"),
        );
        const latestStatus = normalizeAccountStatus(response);
        if (active && latestStatus !== "pending") {
          clearClientCache("/api/v1/users/me", "/api/v1/auth/me");
          setAccountStatus(latestStatus);
        }
      } catch {
        // Keep current state on temporary failure
      } finally {
        checkingStatus = false;
      }
    };

    window.addEventListener("focus", refreshStatus);
    document.addEventListener("visibilitychange", refreshStatus);
    const interval = window.setInterval(refreshStatus, 30_000);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshStatus);
      document.removeEventListener("visibilitychange", refreshStatus);
      window.clearInterval(interval);
    };
  }, [accountStatus, profile?.role]);

  useEffect(() => {
    if (dashboardLoading || listings.length === 0 || scrollRestoredRef.current) return;
    const feed = feedRef.current;
    if (!feed) return;
    scrollRestoredRef.current = true;
    const savedY = Number(sessionStorage.getItem("safecrib_dashboard_scroll") ?? "0");
    if (savedY > 0 && feed.clientHeight > 0) {
      const snapped = Math.round(savedY / feed.clientHeight) * feed.clientHeight;
      const id = requestAnimationFrame(() => feed.scrollTo({ top: snapped, behavior: "instant" }));
      return () => cancelAnimationFrame(id);
    }
  }, [dashboardLoading, listings.length]);

  useEffect(() => {
    if (dashboardLoading) return;
    const feed = feedRef.current;
    if (!feed) return;
    let frame = 0;
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => sessionStorage.setItem("safecrib_dashboard_scroll", String(Math.round(feed.scrollTop))));
    };
    feed.addEventListener("scroll", save, { passive: true });
    return () => {
      feed.removeEventListener("scroll", save);
      cancelAnimationFrame(frame);
    };
  }, [dashboardLoading]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      if (document.visibilityState === "hidden") return;
      const topId = listings[0]?.id;
      if (!topId) return;
      try {
        const result = await apiFetch<unknown>("/api/v1/listings?take=1");
        const items = extractListings(result);
        if (items.length > 0 && items[0]?.id !== topId) setNewPostsAvailable(true);
      } catch {
        // Silent failure
      }
    };
    const schedule = () => { timer = setTimeout(() => { void check(); schedule(); }, 60_000); };
    schedule();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [listings]);

  const refreshFeed = async () => {
    setNewPostsAvailable(false);
    clearClientCache("/api/v1/listings");
    sessionStorage.removeItem("safecrib_dashboard_scroll");
    feedRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const result = await apiFetch<unknown>("/api/v1/listings");
      setListings(extractListings(result));
    } catch {
      // Keep feed
    }
  };

  const toggleBookmark = async (listingId: string) => {
    const isSaved = bookmarkedIds.includes(listingId);
    const message = accountMessage(accountStatus, isSaved ? "remove this saved listing" : "save this listing");
    if (message) {
      setActionMessage(message);
      return;
    }
    try {
      await apiFetch(`/api/v1/listings/${listingId}/bookmark`, { method: isSaved ? "DELETE" : "POST" });
      setBookmarkedIds((current) => isSaved ? current.filter((id) => id !== listingId) : [...current, listingId]);
      notifySuccess("Saved!");
    } catch {
      notifyError("Couldn't save that. Try again?", { action: { label: "Try again", onClick: () => toggleBookmark(listingId) } });
    }
  };

  const toggleProviderFollow = async (listing: Listing) => {
    const ownerId = listing.ownerId;
    if (!ownerId || ownerId === profile?.id) return;

    const actionKey = `follow:${ownerId}`;
    if (pendingEngagement.has(actionKey)) return;
    const following = Boolean(listing.followedPage);
    setPendingEngagement((current) => new Set(current).add(actionKey));
    try {
      const publicProfile = unwrapData<{ providerPageId?: string } | null>(
        await apiFetch<unknown>(`/api/v1/users/${encodeURIComponent(ownerId)}/public-profile`),
      );
      if (!publicProfile?.providerPageId) throw new Error("This provider page is unavailable.");

      await apiFetch(`/api/v1/users/pages/${encodeURIComponent(publicProfile.providerPageId)}/follow`, {
        method: following ? "DELETE" : "POST",
      });
      setListings((current) => current.map((item) => (
        item.ownerId === ownerId ? { ...item, followedPage: !following } : item
      )));
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "We could not update your follow. Please try again.");
    } finally {
      setPendingEngagement((current) => {
        const next = new Set(current);
        next.delete(actionKey);
        return next;
      });
    }
  };

  const toggleRecommendation = async (providerId: string) => {
    const actionKey = `recommend:${providerId}`;
    if (pendingEngagement.has(actionKey)) return;
    const recommended = recommendedProviderIds.includes(providerId);
    setPendingEngagement((current) => new Set(current).add(actionKey));
    try {
      await apiFetch(`/api/v1/trust/users/${encodeURIComponent(providerId)}/recommendation`, { method: recommended ? "DELETE" : "POST" });
      clearClientCache("/api/v1/listings", "/api/v1/trust/me/recommendations");
      setRecommendedProviderIds((current) => recommended
        ? current.filter((id) => id !== providerId)
        : [...current, providerId]);
      setListings((current) => current.map((item) => {
        if (item.ownerId !== providerId) return item;
        const recommendationCount = Math.max(0, (item.providerRecommendationCount ?? 0) + (recommended ? -1 : 1));
        const trust = Math.max(0, Math.min(100, item.providerTrustScore ?? 50));
        const activeDays = Math.max(0, Math.min(30, item.providerActiveDays ?? 0));
        const recommendationSignal = Math.min(100, Math.log1p(recommendationCount) / Math.log1p(50) * 100);
        return {
          ...item,
          providerRecommendationCount: recommendationCount,
          recommendationScore: Math.round(trust * 0.45 + activeDays / 30 * 25 + recommendationSignal * 0.3),
        };
      }).sort((a, b) => (b.recommendationScore ?? 0) - (a.recommendationScore ?? 0)));
      notifySuccess("Recommendation saved!");
    } catch (error) {
      const { key } = resolveNotificationKey(error, "recommend");
      const { message, action } = getNotificationMessage(key);
      notifyError(message, { action: action ? { label: action.label, onClick: () => toggleRecommendation(providerId) } : undefined });
    } finally {
      setPendingEngagement((current) => {
        const next = new Set(current);
        next.delete(actionKey);
        return next;
      });
    }
  };

  const toggleComments = (listingId: string) => {
    setOpenCommentIds((current) => {
      const next = new Set(current);
      if (next.has(listingId)) next.delete(listingId);
      else next.add(listingId);
      return next;
    });
  };

  const closeComments = useCallback((listingId: string) => {
    setOpenCommentIds((current) => {
      if (!current.has(listingId)) return current;
      const next = new Set(current);
      next.delete(listingId);
      return next;
    });
  }, []);

  const closeActionTray = useCallback(() => setOpenActionTrayId(null), []);

  const toggleDescriptionExpand = (listingId: string) => {
    setExpandedDescriptions((prev) => ({ ...prev, [listingId]: !prev[listingId] }));
  };

  const openPage = () => router.push(pageStatus === "none" ? "/page/new" : "/page");
  const accountName = resolveAccountName(profile);
  const canCreateProviderPage = ["AGENT", "LANDLORD"].includes(String(profile?.role ?? "").toUpperCase());
  const isStudent = String(profile?.role ?? "").toUpperCase() === "STUDENT";

  if (dashboardLoading) {
    return (
      <main className="safecrib-feed relative min-h-[100dvh] overflow-x-hidden md:pl-72" style={{ backgroundColor: 'var(--theme-bg)' }} aria-busy="true">
        <FeedStyles />
        <DashboardNav onCreatePage={openPage} pageStatus={pageStatus} canManagePage={canCreateProviderPage} supportCount={openSupportCount} darkMode />
        <section className="relative w-full min-h-[100dvh] flex items-center justify-center overflow-x-hidden" aria-label="Loading homes">
          <div className="relative w-full max-w-[480px] h-[calc(100dvh-48px)] max-h-[calc(100dvh-48px)] rounded-none overflow-hidden bg-neutral-950 md:rounded-2xl md:shadow-2xl md:border md:border-white/10">
            {/* Top bar skeleton */}
            <div className="absolute inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-40 mx-auto flex h-11 max-w-xl items-center justify-between px-4">
              <div className="h-9 w-9 animate-pulse rounded-full bg-white/10" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-white/15" />
              <div className="h-9 w-9 animate-pulse rounded-full bg-white/10" />
            </div>

            {/* Bottom card + rail skeleton */}
            <div className="absolute inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-xl items-end gap-3 pl-2.5 pr-2 md:bottom-8">
              <div className="min-w-0 flex-1 space-y-2.5 rounded-xl border border-white/10 bg-[#09090b] p-3">
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 animate-pulse rounded-full bg-white/15" />
                  <div className="h-4 w-28 animate-pulse rounded-full bg-white/20" />
                </div>
                <div className="h-4 w-3/4 animate-pulse rounded-full bg-white/20" />
                <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/10" />
                <div className="flex items-center justify-between pt-2">
                  <div className="h-7 w-28 animate-pulse rounded-lg bg-white/20" />
                  <div className="h-9 w-24 animate-pulse rounded-md bg-emerald-500/50" />
                </div>
              </div>
              <div className="flex -translate-y-10 flex-col items-center gap-4">
                <div className="h-9 w-9 animate-pulse rounded-full bg-[#111318]" />
                <div className="h-9 w-9 animate-pulse rounded-full bg-[#111318]" />
                <div className="h-9 w-9 animate-pulse rounded-full bg-[#111318]" />
                <div className="h-9 w-9 animate-pulse rounded-full bg-[#111318]" />
              </div>
            </div>
          </div>
        </section>
      </main>
    );
  } 

  const submitSearch = () => {
    const query = searchQuery.trim();
    router.push(query ? `/connect?q=${encodeURIComponent(query)}` : "/connect");
  };

  return (
    <main className="safecrib-feed relative min-h-[100dvh] overflow-x-hidden md:pl-72" style={{ backgroundColor: 'var(--theme-bg)' }}>
      <FeedStyles />
      <DashboardNav onCreatePage={openPage} pageStatus={pageStatus} canManagePage={canCreateProviderPage} supportCount={openSupportCount} darkMode />
      <section className="relative w-full min-h-[100dvh] flex items-center justify-center overflow-x-hidden">
        <div className="relative w-full max-w-[480px] h-[calc(100dvh-48px)] max-h-[calc(100dvh-48px)] rounded-none overflow-hidden bg-neutral-950 md:rounded-2xl md:shadow-2xl md:border md:border-white/10">
        {/* Top bar: avatar | For You | search */}
        <div className="pointer-events-none absolute inset-x-4 top-4 z-40">
          <div className="pointer-events-auto mx-auto flex h-11 max-w-full items-center justify-between gap-3">
            {searchOpen ? (
              <form
                role="search"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitSearch();
                }}
                className="feed-surface flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full pl-4 pr-1.5"
              >
                <Icon name="search" className="h-4 w-4 shrink-0" />
                <input
                  autoFocus
                  type="search"
                  enterKeyHint="search"
                  aria-label="Search verified student cribs, hostels, or providers"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search cribs, campus, host"
                  className="feed-input min-w-0 flex-1 text-sm [&::-webkit-search-cancel-button]:hidden"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSearchOpen(false);
                  }}
                  aria-label="Close search"
                  className="feed-chip flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                >
                  <Icon name="x" className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <>
                <Link
                  href="/profile"
                  aria-label="View your profile"
                  title={accountName || "Your Profile"}
                  className="h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 border-white/80 shadow-lg active:scale-95"
                >
                  <ProfileAvatar
                    src={profileImage}
                    seed={profile?.id ?? profile?.email ?? "safecrib-member-avatar"}
                    alt={`${accountName || "Your"} profile photo`}
                    size="small"
                    className="h-full w-full object-cover"
                  />
                </Link>

                <h1 className="feed-count relative text-[17px] font-bold">
                  For You
                  <span aria-hidden="true" className="absolute -bottom-1.5 left-1/2 h-[3px] w-6 -translate-x-1/2 rounded-full bg-white" />
                </h1>

                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Search"
                  className="feed-surface flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:scale-90"
                >
                  <Icon name="search" className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Empty state when no listings exist */}
        {listings.length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-neutral-950 px-6 pb-12 pt-28 text-center" aria-label="No listings available">
            <div className="feed-card flex max-w-sm flex-col items-center rounded-3xl p-8 shadow-2xl">
              <EmptyListingsIllustration />
              <h2 className="feed-text mt-5 font-display text-xl font-bold">No homes listed yet</h2>
              <p className="feed-muted mt-2 text-sm leading-relaxed">
                Verified student accommodation and listings from trusted landlords will show up here as soon as they go live.
              </p>
              <button
                type="button"
                onClick={() => void refreshFeed()}
                className="feed-cta mt-6 inline-flex h-10 items-center rounded-full px-6 text-sm font-bold transition active:scale-95"
              >
                Refresh feed
              </button>
            </div>
          </div>
        )}

        {/* Vertical snap feed */}
        <div
          ref={feedRef}
          onScroll={() => {
            if (openActionTrayId) setOpenActionTrayId(null);
            if (openMenuId) setOpenMenuId(null);
          }}
          className="absolute inset-0 snap-y snap-mandatory overflow-x-hidden overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Floating pill: new posts available */}
          {newPostsAvailable && (
            <div className="pointer-events-none sticky top-20 z-40 flex h-0 justify-center">
              <button
                type="button"
                onClick={() => void refreshFeed()}
                className="feed-cta pointer-events-auto inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold shadow-[0_10px_25px_rgba(16,185,129,0.4)] transition hover:scale-105 active:scale-95"
                aria-live="polite"
              >
                <Icon name="arrow-up" className="h-3.5 w-3.5 animate-bounce" />
                New homes posted
              </button>
            </div>
          )}

          {listings.map((listing, index) => {
            const image = resolvedListingImages[listing.id] ?? getListingImageUrl(listing);
            const fallbackImage = getListingImageUrl(listing);
            const providerName = listing.owner?.displayName || "Verified Host";
            const location = listing.campus || listing.address;
            const isSaved = bookmarkedIds.includes(listing.id);
            const commentsOpen = openCommentIds.has(listing.id);
            const commentCount = listing.commentCount ?? 0;
            const hasMedia = Boolean(image || listing.video);
            const isDescExpanded = Boolean(expandedDescriptions[listing.id]);

            return (
              <article
                key={listing.id}
                className={`relative h-full min-h-full w-full snap-start snap-always overflow-hidden text-white ${
                  hasMedia ? "bg-neutral-950" : "bg-gradient-to-br from-emerald-950 via-neutral-900 to-black"
                }`}
              >
                {/* Media layer (video or image) */}
                {hasMedia && (
                  <div className="absolute inset-0">
                    {listing.video ? (
                      <ListingCardVideo
                        video={listing.video}
                        poster={image ?? null}
                        fallbackSrc={fallbackImage}
                        alt={listing.title ?? "Listing"}
                        onProgress={(currentTime, duration) =>
                          setVideoProgress({ listingId: listing.id, currentTime, duration })
                        }
                      />
                    ) : image ? (
                      <Link href={`/dashboard/listings/${listing.id}`} aria-label={`Open ${listing.title ?? "listing"}`} className="absolute inset-0">
                        <ListingCardImage
                          src={image}
                          fallbackSrc={fallbackImage}
                          alt={listing.title ?? "Listing"}
                          priority={index === 0}
                        />
                      </Link>
                    ) : null}
                  </div>
                )}

                {/* Soft bottom fade only, so the media stays visible */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent via-40% to-transparent"
                />

                {/* Video progress: thin line at the bottom of the card */}
                {listing.video && videoProgress?.listingId === listing.id && videoProgress.duration > 0 && (
                  <div
                    aria-label="Video progress"
                    className="absolute inset-x-0 bottom-0 z-30 h-[3px] bg-white/25"
                  >
                    <div
                      className="h-full bg-white transition-all duration-150"
                      style={{ width: `${Math.min(100, (videoProgress.currentTime / videoProgress.duration) * 100)}%` }}
                    />
                  </div>
                )}

                {/* Bottom UI: listing card on the left, engagement rail on the right */}
                <div className="pointer-events-none absolute inset-x-4 bottom-4 top-auto z-30 flex max-w-full items-end gap-3 md:bottom-8">
                  {/* Left: everything starts at the same left edge */}
                  <div className="feed-card pointer-events-auto min-w-0 flex-1 origin-bottom-left scale-x-100 scale-y-[0.9] rounded-xl p-3 text-left shadow-xl">
                    {/* Row 1: avatar + name */}
                    <div className="flex min-w-0 items-center justify-start gap-2">
                      {listing.ownerId ? (
                        <div className="relative h-9 w-9 shrink-0">
                          <Link
                            href={`/profile/${encodeURIComponent(listing.ownerId)}`}
                            aria-label="View provider profile"
                            className="absolute inset-0 overflow-hidden rounded-full border border-white/30"
                          >
                            <ProfileAvatar
                              src={resolvedProviderAvatars[listing.id] ?? null}
                              seed={listing.ownerId}
                              alt={`${providerName} avatar`}
                              size="small"
                              className="h-full w-full object-cover"
                            />
                          </Link>
                          <button
                            type="button"
                            onClick={() => void toggleProviderFollow(listing)}
                            disabled={listing.ownerId === profile?.id || pendingEngagement.has(`follow:${listing.ownerId}`)}
                            aria-label={listing.followedPage ? "Unfollow provider" : "Follow provider"}
                            aria-pressed={Boolean(listing.followedPage)}
                            title={listing.followedPage ? "Unfollow provider" : "Follow provider"}
                            className="feed-badge absolute -bottom-1 -right-1 z-10 flex h-4 w-4 items-center justify-center rounded-full border-2 border-[#09090b] text-xs font-bold leading-none disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {listing.followedPage ? (
                              <Icon name="check" className="feed-badge-mark h-2 w-2 stroke-[3]" />
                            ) : (
                              <span className="feed-badge-mark">+</span>
                            )}
                          </button>
                        </div>
                      ) : null}
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="feed-text truncate text-[15px] font-bold">
                          {providerName}
                        </span>
                        <span
                          title="Verified Host"
                          className="feed-badge inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full"
                        >
                          <Icon name="check" className="feed-badge-mark h-2 w-2 stroke-[3]" />
                        </span>
                      </div>
                    </div>

                    {/* Row 2: title + description underneath, same left edge as the avatar */}
                    <Link href={`/dashboard/listings/${listing.id}`} className="mt-2 block">
                      <h2 className="feed-text line-clamp-2 text-left text-[15px] font-semibold leading-snug">
                        {listing.title ?? "Verified Campus Home"}
                      </h2>
                    </Link>
                    {listing.description && (
                      <p className="feed-muted mt-0.5 text-left text-sm leading-snug">
                        <span className={isDescExpanded ? "" : "line-clamp-1"}>{listing.description}</span>
                        {listing.description.length > 60 && (
                          <button
                            type="button"
                            onClick={() => toggleDescriptionExpand(listing.id)}
                            className="feed-text mt-0.5 text-sm font-semibold underline-offset-2 hover:underline"
                          >
                            {isDescExpanded ? "less" : "more"}
                          </button>
                        )}
                      </p>
                    )}

                    {/* Location */}
                    {location && (
                      <p className="feed-muted mt-2 flex items-center justify-start gap-1.5 text-sm font-medium">
                        <Icon name="map-pin" className="h-4 w-4 shrink-0" />
                        <span className="truncate">{location}</span>
                      </p>
                    )}

                    {/* Price + one clear action */}
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <ListingPriceTag listing={listing} />
                      <Link
                        href={`/dashboard/listings/${listing.id}`}
                        className="feed-cta inline-flex h-9 shrink-0 items-center rounded-md px-4 text-sm font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-white active:scale-95"
                      >
                        View crib
                      </Link>
                    </div>
                  </div>

                  {/* Right: Vertical Interaction Rail */}
                  <div className="pointer-events-auto flex flex-col items-center gap-3">
                    <ListingActionTray
                      listing={listing}
                      isOpen={openActionTrayId === listing.id}
                      isSaved={isSaved}
                      isRecommended={Boolean(listing.ownerId && recommendedProviderIds.includes(listing.ownerId))}
                      canRecommend={Boolean(listing.ownerId && listing.ownerId !== profile?.id)}
                      menuOpen={openMenuId === listing.id}
                      isStudent={isStudent}
                      commentCount={commentCount}
                      recommendationDisabled={
                        String(profile?.role ?? "").toUpperCase() !== "STUDENT" ||
                        !recommendationsLoaded ||
                        pendingEngagement.has(`recommend:${listing.ownerId}`)
                      }
                      role={String(profile?.role ?? "").toUpperCase()}
                      onToggle={() => setOpenActionTrayId((current) => (current === listing.id ? null : listing.id))}
                      onClose={closeActionTray}
                      onLike={async (id, liked) => {
                        try {
                          await apiFetch(`/api/v1/listings/${encodeURIComponent(id)}/like`, {
                            method: liked ? "POST" : "DELETE",
                          });
                          setListings((current) =>
                            current.map((item) =>
                              item.id === id
                                ? {
                                    ...item,
                                    likedByCurrentUser: liked,
                                    likeCount: Math.max(0, (item.likeCount ?? 0) + (liked ? 1 : -1)),
                                  }
                                : item,
                            ),
                          );
                          if (liked) notifySuccess("Liked! 👍");
                        } catch (error) {
                          const { key } = resolveNotificationKey(error, "like");
                          const { message, action } = getNotificationMessage(key);
                          notifyError(message, { action: action ? { label: action.label, onClick: () => { /* re-trigger via LikeButton */ } } : undefined });
                          // Rollback handled by LikeButton's optimistic toggle
                        }
                      }}
                      onComment={() => toggleComments(listing.id)}
                      onRecommend={async (providerId, recommended) => {
                        await toggleRecommendation(providerId);
                        void recommended;
                      }}
                      onSave={() => void toggleBookmark(listing.id)}
                      onMore={() => setOpenMenuId((current) => (current === listing.id ? null : listing.id))}
                      onCloseMenu={() => setOpenMenuId(null)}
                    />
                  </div>
                </div>

                {/* Comments modal drawer */}
                {commentsOpen && (
                  <ListingComments
                    listingId={listing.id}
                    ownerId={listing.ownerId}
                    onClose={closeComments}
                    onCountChange={() => {}}
                  />
                )}
              </article>
            );
          })}
</div>
        </div>
      </section>
      <RestrictedActionModal message={actionMessage} onClose={() => setActionMessage(null)} />
    </main>
  );
}