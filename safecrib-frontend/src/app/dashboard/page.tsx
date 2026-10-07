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
import { normalizeVerificationStage, VerificationBadge, type VerificationStageResult } from "@/components/verification/VerificationBadge";
import { apiFetch, cachedApiFetch, cachedCurrentUser, clearClientCache, clearSession, displayName, getAuthenticatedDisplayName, getCachedApi, getCachedCurrentUser, getCachedMediaUrl, getPersistedVerification, isUnauthorizedError, normalizeAccountStatus, normalizePageStatus, primeCurrentUserCache, refreshCachedApi, resolveMediaUrl, setPersistedVerification, subscribeClientCacheUpdates, unwrapData, userSessionClearedEvent, getCachedUserAvatar, setCachedUserAvatar, type AccountStatus, type PageStatus } from "@/lib/api";

type ListingPhotoValue = string | { id?: string; mediaId?: string; media_id?: string; url?: string; accessUrl?: string; deliveryUrl?: string; imageUrl?: string; src?: string };
type Listing = { id: string; ownerId?: string; owner?: { displayName?: string | null; profilePicture?: string | null }; title?: string; description?: string; price?: number; discountAmount?: number | null; discountedPrice?: number; address?: string; campus?: string; photos?: ListingPhotoValue[]; images?: ListingPhotoValue[]; photo?: ListingPhotoValue; image?: ListingPhotoValue; video?: { mediaId?: string; url?: string } | null; likeCount?: number; viewCount?: number; commentCount?: number; followedPage?: boolean; likedByCurrentUser?: boolean; providerRecommendationCount?: number; providerTrustScore?: number | null; providerActiveDays?: number; recommendationScore?: number };
type Profile = { id?: string; displayName?: unknown; email?: string; role?: string; profilePicture?: string; username?: string | null; studentProfileStatus?: unknown; studentProfile?: { profilePicture?: string }; verification?: { stage?: string; badge?: string; badgeColor?: "green" | "blue" | "gold"; riskBlocked?: boolean; eligible?: boolean } | null; verificationStage?: unknown };
type ListingComment = {
  id: string;
  body: string;
  parentId?: string | null;
  createdAt: string;
  user: { id: string; displayName?: string | null; username?: string | null; role?: string };
  mentions?: Array<{ user: { id: string; displayName?: string | null; username?: string | null } }>;
};
type MentionCandidate = { id: string; displayName?: string | null; username?: string | null; role?: string };
type StudentProfile = { profilePicture?: string } | null;
type ProviderPage = { id?: string; status?: string; profilePicture?: string; rejectionReason?: string; reason?: string } | null;

function accountMessage(status: AccountStatus, action: string) {
  if (status === "pending" || status === "not_submitted") return `Your account is still under review. You'll be able to ${action} once it's approved.`;
  if (status === "rejected") return "Your account submission wasn't approved. Please update and resubmit your profile.";
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
  return typeof value === "string" && value.trim() !== "" && /^(https?:|data:|blob:)/i.test(value.trim());
}

function extractListingImageReference(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  for (const key of ["mediaId", "media_id"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  for (const key of ["url", "accessUrl", "deliveryUrl", "imageUrl", "src"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  for (const key of ["mediaId", "media_id", "id"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return null;
}

function getListingImageReference(listing: Listing): string | null {
  const candidates: unknown[] = [
    ...(Array.isArray(listing.photos) ? listing.photos : []),
    ...(Array.isArray(listing.images) ? listing.images : []),
    listing.photo,
    listing.image,
  ];

  for (const candidate of candidates) {
    const extracted = extractListingImageReference(candidate);
    if (extracted) return extracted;
  }

  return null;
}

function getListingImageUrl(listing: Listing): string | null {
  const candidates: unknown[] = [
    ...(Array.isArray(listing.photos) ? listing.photos : []),
    ...(Array.isArray(listing.images) ? listing.images : []),
    listing.photo,
    listing.image,
  ];

  for (const candidate of candidates) {
    if (isUsableImageSource(candidate)) return candidate;
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    for (const key of ["url", "accessUrl", "deliveryUrl", "imageUrl", "src"]) {
      if (isUsableImageSource(record[key])) return record[key];
    }
  }
  return null;
}

function formatListingPrice(listing: Listing) {
  if (typeof listing.price !== "number") return "See details";
  const price = listing.discountedPrice ?? Math.max(0, listing.price - (listing.discountAmount ?? 0));
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(price);
}

function hasDiscount(listing: Listing) {
  if (typeof listing.price !== "number") return false;
  const price = listing.discountedPrice ?? Math.max(0, listing.price - (listing.discountAmount ?? 0));
  return price < listing.price;
}

function formatOriginalPrice(listing: Listing) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(listing.price ?? 0);
}

function formatEngagementCount(count: number) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(count);
}

function ListingPriceTag({ listing }: { listing: Listing }) {
  const priced = typeof listing.price === "number";
  return (
    <div className="flex min-w-0 items-baseline gap-2 leading-tight">
      <span className={`font-display font-bold text-white ${priced ? "text-xl" : "text-sm"}`}>{formatListingPrice(listing)}</span>
      {priced && hasDiscount(listing) && (
        <span className="text-xs text-white/60 line-through">{formatOriginalPrice(listing)}</span>
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
    <div className="absolute inset-0 bg-neutral-900">
      {loadedSrc !== imageSrc && <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-white/10" />}
      <Image
        src={imageSrc}
        alt={alt}
        fill
        priority={priority}
        sizes="100vw"
        quality={90}
        onLoad={() => setLoadedSrc(imageSrc)}
        className={`object-cover transition-opacity duration-200 ${loadedSrc === imageSrc ? "opacity-100" : "opacity-0"}`}
        onError={() => {
          if (fallbackSrc && fallbackSrc !== src) setUseFallback(true);
        }}
      />
    </div>
  );
}

function formatVideoTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainingSeconds}`;
}

function ListingCardVideo({ video, poster, fallbackSrc, alt, onProgress }: { video: Listing["video"]; poster: string | null; fallbackSrc: string | null; alt: string; onProgress?: (currentTime: number, duration: number) => void }) {
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

  return (
    <div ref={containerRef} className="absolute inset-0 bg-neutral-900">
      {videoUrl && !videoFailed ? (
        <video
          ref={videoRef}
          src={videoUrl}
          poster={poster ?? fallbackSrc ?? undefined}
          role="button"
          tabIndex={0}
          aria-label={`${alt} video. ${isPlaying ? "Playing" : "Paused"}. Press Space to toggle playback.`}
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
          onClick={(event) => { const element = event.currentTarget; if (element.paused) void element.play().catch(() => undefined); else element.pause(); }}
          onKeyDown={(event) => {
            if (event.key !== " " && event.key !== "Enter") return;
            event.preventDefault();
            const element = event.currentTarget;
            if (element.paused) void element.play().catch(() => undefined);
            else element.pause();
          }}
          className="h-full w-full cursor-pointer object-cover"
        />
      ) : poster || fallbackSrc ? (
        <ListingCardImage src={poster ?? fallbackSrc!} fallbackSrc={fallbackSrc} alt={alt} />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-white/10" />
      )}
      {videoUrl && !videoFailed && (
        <div className="absolute right-4 top-20 z-40">
          <button
            type="button"
            onClick={() => setIsMuted((muted) => !muted)}
            aria-label={isMuted ? "Unmute video" : "Mute video"}
            title={isMuted ? "Unmute" : "Mute"}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-black/45 text-white shadow-md backdrop-blur-xl hover:bg-black/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <Icon name={isMuted ? "volume-x" : "volume-2"} className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Comments open straight into the discussion sheet (one tap from the feed icon).
 * Closing the sheet calls onClose so the feed can reset the icon state.
 */
function ListingComments({ listingId, ownerId, onCountChange, onClose }: { listingId: string; ownerId?: string; onCountChange: (count: number) => void; onClose: (listingId: string) => void }) {
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
        if (active) setCommentError("We could not load home comments. Please refresh to retry.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId]);

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
      clearClientCache(`/api/v1/listings/${encodeURIComponent(listingId)}/comments`);
      const next = [unwrapData<ListingComment>(response), ...comments];
      setComments(next);
      onCountChange(next.length);
      setCommentBody("");
      setCommentMentionIds([]);
      setReplyParentId(null);
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : "We could not post your comment.");
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
      ? "Unknown time"
      : formatDistanceToNow(createdAt, { addSuffix: true, includeSeconds: true });
    return (
      <li key={item.id} className="py-3" style={{ marginLeft: `${Math.min(depth, 5) * 16}px` }}>
        <p className="text-sm font-semibold text-safecrib-black">
          <Link href={`/profile/${encodeURIComponent(item.user.id)}`} className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-safecrib-green">
            <NameHandle displayName={item.user.displayName} username={item.user.username} />
          </Link>
          {isCreatorReply && <span className="ml-2 font-bold text-safecrib-green">Creator</span>}
          <time dateTime={item.createdAt} className="ml-2 text-xs font-normal text-black/45">{commentTime}</time>
        </p>
        {item.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-black/70">{item.body}</p>}
        {item.mentions?.length ? <p className="mt-1 text-xs text-black/45">Tagged: {item.mentions.map((mention) => `@${mention.user.username ?? mention.user.displayName ?? "member"}`).join(", ")}</p> : null}
        <button
          type="button"
          onClick={() => { setReplyParentId(item.id); setCommentBody(""); setCommentError(""); document.getElementById(inputId)?.focus(); }}
          className="mt-1.5 text-xs font-semibold text-safecrib-green hover:underline"
        >
          Reply
        </button>
        {replies.length > 0 && <ul className="mt-1 divide-y divide-black/10 border-l-2 border-black/10 pl-3">{replies.map((reply) => renderComment(reply, depth + 1))}</ul>}
      </li>
    );
  };

  const topLevel = comments.filter((comment) => !comment.parentId);

  return createPortal(
    <Modal open onClose={closeDiscussion} titleId={titleId}>
      <div className="flex max-h-[85dvh] min-h-0 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-black/10 px-4 py-3 sm:px-6">
          <h2 id={titleId} className="text-base font-bold text-safecrib-black">
            Comments{comments.length > 0 ? ` (${comments.length})` : ""}
          </h2>
          <button type="button" onClick={closeDiscussion} aria-label="Close comments" className="flex h-9 w-9 items-center justify-center rounded-full text-black/55 hover:bg-black/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-safecrib-green">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m18 6-12 12M6 6l12 12" /></svg>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
          {loading ? (
            <div className="space-y-3 py-4" aria-hidden="true">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <ul className="divide-y divide-black/10">
              {topLevel.map((comment) => renderComment(comment))}
              {!comments.length && !commentError && <li className="py-6 text-center text-sm text-black/50">No comments yet. Start the conversation.</li>}
            </ul>
          )}
          <Link href={`/dashboard/listings/${listingId}#comments`} className="my-4 inline-block text-xs font-semibold text-safecrib-green hover:underline">Open full post</Link>
        </div>
        <div className="shrink-0 border-t border-black/10 px-4 py-3 sm:px-6">
          <label htmlFor={inputId} className="sr-only">{replyParentId ? "Write a reply" : "Write a comment about this home"}</label>
          <textarea
            id={inputId}
            value={commentBody}
            onChange={(event) => updateCommentBody(event.target.value)}
            maxLength={1000}
            rows={2}
            placeholder={replyParentId ? "Write a reply..." : "Ask a question or share a helpful note..."}
            className="w-full resize-none rounded-xl border border-black/15 bg-white px-4 py-3 text-sm text-safecrib-black focus:border-safecrib-green focus:outline-none"
          />
          {mentionCandidates.length > 0 && (
            <ul aria-label="Tag a user" className="mt-2 max-h-44 overflow-auto rounded-xl border border-black/10 bg-white shadow-lg">
              {mentionCandidates.map((person) => (
                <li key={person.id}>
                  <button type="button" onClick={() => selectMention(person)} className="w-full px-4 py-2 text-left text-sm hover:bg-safecrib-green/5">
                    <NameHandle displayName={person.displayName} username={person.username} /> <span className="text-xs text-black/45">{person.role?.toLowerCase()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {replyParentId && <button type="button" onClick={() => setReplyParentId(null)} className="mt-2 text-xs font-medium text-safecrib-green hover:underline">Cancel reply</button>}
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-black/45">{commentBody.length > 0 ? `${commentBody.length}/1000` : ""}</span>
            <Button type="button" loading={commentSubmitting} onClick={() => void submitComment()}>{replyParentId ? "Post reply" : "Post comment"}</Button>
          </div>
          {commentError && <p role="alert" className="mt-3 text-sm text-red-700">{commentError}</p>}
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

function ListingActionTray({ listing, isOpen, isSaved, isRecommended, canRecommend, menuOpen, isStudent, commentCount, recommendationDisabled, role, onToggle, onClose, onLike, onComment, onRecommend, onSave, onMore, onCloseMenu }: ListingActionTrayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const restoreFocusRef = useRef(true);
  const trayId = `listing-actions-${listing.id}`;

  useEffect(() => {
    let frame = 0;
    if (isOpen) {
      restoreFocusRef.current = true;
      frame = requestAnimationFrame(() => trayRef.current?.querySelector<HTMLButtonElement>("button")?.focus());
    } else if (wasOpenRef.current && restoreFocusRef.current) {
      triggerRef.current?.focus({ preventScroll: true });
    }
    wasOpenRef.current = isOpen;
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !rootRef.current?.contains(target)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!menuOpen) return;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLAnchorElement>("a")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [menuOpen]);

  const itemClass = (open: boolean) => `flex items-center gap-2 transition-all duration-150 ease-out motion-reduce:translate-y-0 motion-reduce:transition-opacity ${open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`;
  const delay = (index: number): React.CSSProperties => ({ transitionDelay: isOpen ? `${index * 40}ms` : "0ms" });
  const countChip = (text: string) => <span className="rounded-full border border-white/20 bg-black/65 px-2.5 py-1 text-xs font-semibold leading-none text-white shadow-sm backdrop-blur-md">{text}</span>;
  const iconButtonClass = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/60 bg-white/95 text-safecrib-black shadow-lg transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-safecrib-green";

  return (
    <div ref={rootRef} className="relative z-40 flex h-12 w-12 shrink-0 items-center justify-center" data-listing-menu-open={menuOpen ? "true" : undefined}>
      {menuOpen && (
        <div ref={menuRef} role="menu" aria-label="More listing options" className="absolute bottom-full right-0 z-50 mb-3 w-52 overflow-hidden rounded-2xl border border-white/20 bg-white text-safecrib-black shadow-xl">
          <Link role="menuitem" href={`/dashboard/listings/${listing.id}`} onClick={onCloseMenu} className="block border-b border-black/5 px-4 py-3 text-sm font-medium text-black/75 transition hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-safecrib-green">Open post</Link>
          {listing.ownerId && <Link role="menuitem" href={`/profile/${encodeURIComponent(listing.ownerId)}`} onClick={onCloseMenu} className="block px-4 py-3 text-sm font-medium text-black/75 transition hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-safecrib-green">View provider</Link>}
        </div>
      )}
      <div
        ref={trayRef}
        id={trayId}
        role="group"
        aria-label="Listing actions"
        aria-hidden={!isOpen}
        inert={!isOpen}
        className={`absolute bottom-full right-0 mb-3 flex flex-col-reverse items-end gap-3 transition-opacity duration-150 ease-out ${isOpen ? "visible opacity-100" : "invisible opacity-0"}`}
      >
        <div className={itemClass(isOpen)} style={delay(0)}>
          {countChip(formatEngagementCount(listing.likeCount ?? 0))}
          <LikeButton
            listingId={listing.id}
            initialLikeCount={listing.likeCount ?? 0}
            initialIsLiked={listing.likedByCurrentUser ?? false}
            onLike={onLike}
            size="lg"
            showLabel={false}
          />
        </div>
        <div className={itemClass(isOpen)} style={delay(1)}>
          {countChip(formatEngagementCount(commentCount))}
          <button type="button" onClick={() => { restoreFocusRef.current = false; onComment(); onClose(); }} aria-label={`Comments, ${commentCount}`} title="Comments" className={iconButtonClass}>
            <Icon name="message-circle" className="h-5 w-5" />
          </button>
        </div>
        {canRecommend && (
          <div className={itemClass(isOpen)} style={delay(2)}>
            {countChip(formatEngagementCount(listing.providerRecommendationCount ?? 0))}
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
        )}
        {isStudent && (
          <div className={itemClass(isOpen)} style={delay(3)}>
            {countChip(isSaved ? "Saved" : "Save")}
            <button type="button" onClick={onSave} aria-pressed={isSaved} aria-label={isSaved ? "Remove from saved listings" : "Save listing"} title={isSaved ? "Saved" : "Save"} className={`${iconButtonClass} ${isSaved ? "text-safecrib-green" : ""}`}>
              <Icon name="bookmark" className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className={itemClass(isOpen)} style={delay(4)}>
          {countChip("More")}
          <button type="button" onClick={() => { restoreFocusRef.current = false; onMore(); onClose(); }} aria-label="More listing options" title="More" className={iconButtonClass}>
            <Icon name="more-horizontal" className="h-5 w-5" />
          </button>
        </div>
      </div>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={trayId}
        aria-label={isOpen ? "Close listing actions" : "Open listing actions"}
        title={isOpen ? "Close actions" : "More actions"}
        onClick={onToggle}
        className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/70 bg-safecrib-green text-white shadow-xl transition-all duration-150 ease-out hover:bg-safecrib-green/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-opacity ${isOpen ? "rotate-45" : "rotate-0"}`}
      >
        <Icon name={isOpen ? "x" : "zap"} className="h-5 w-5" />
        {!isOpen && (listing.likedByCurrentUser || isSaved) && <span aria-hidden="true" className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border border-white bg-white" />}
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [verification, setVerification] = useState<VerificationStageResult | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("not_submitted");
  const [pageStatus, setPageStatus] = useState<PageStatus>("none");
  const [listings, setListings] = useState<Listing[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [recommendedProviderIds, setRecommendedProviderIds] = useState<string[]>([]);
  const [recommendationsLoaded, setRecommendationsLoaded] = useState(false);
  const [pendingEngagement, setPendingEngagement] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [resolvedProviderAvatars, setResolvedProviderAvatars] = useState<Record<string, string | null>>({});
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [openSupportCount, setOpenSupportCount] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(() => {
    // Show skeleton only on first load (no cache). On navigation returns, render instantly.
    if (typeof window === "undefined") return true;
    try {
      const token = localStorage.getItem("safecrib_access_token");
      if (!token) return false;
      return localStorage.getItem("safecrib_cache:/api/v1/users/me") === null &&
             localStorage.getItem("safecrib_cache:/api/v1/auth/me") === null;
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
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});

  useEffect(() => subscribeClientCacheUpdates(({ path, value }) => {
    if (path === "/api/v1/users/me" || path === "/api/v1/auth/me") {
      const currentUser = unwrapData<Profile | null>(value);
      if (!currentUser) return;
      setProfile({ ...currentUser, displayName: displayName(currentUser) || getAuthenticatedDisplayName() });
      const userVerification = currentUser.verification ?? getPersistedVerification(currentUser.id);
      if (userVerification) {
        const normalized = normalizeVerificationStage(userVerification);
        if (normalized) setVerification(normalized);
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
      if (picture) void resolveMediaUrl(picture).then((url) => { if (url) { setProfileImage(url); if (currentUser.id) setCachedUserAvatar(currentUser.id, url, picture); } });
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
      if (picture) void resolveMediaUrl(picture).then((url) => { if (url) { setProfileImage(url); if (currentUser?.id) setCachedUserAvatar(currentUser.id, url, picture); } });
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
      if (picture) void resolveMediaUrl(picture).then((url) => { if (url) { setProfileImage(url); if (currentUser?.id) setCachedUserAvatar(currentUser.id, url, picture); } });
      return;
    }

    if (path === "/api/v1/listings") {
      const listings = unwrapData<Listing[]>(value);
      setListings(Array.isArray(listings) ? listings : []);
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
      setOpenSupportCount(Array.isArray(conversations)
        ? conversations.filter((conversation) => typeof conversation === "object" && conversation !== null && "status" in conversation && String(conversation.status).toUpperCase() === "OPEN").length
        : 0);
    }
  }), []);

  useEffect(() => {
    const handleSessionCleared = () => {
      setProfile(null);
      setVerification(null);
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
    if (!localStorage.getItem("safecrib_access_token")) {
      router.replace("/login");
      return;
    }

    const cachedProfile = getCachedCurrentUser<Profile>();
    // Only show the skeleton on first load (no cached data). On subsequent navigations
    // we have cached data so we render instantly with no flash.
    const hasCachedData = cachedProfile !== null;
    if (!hasCachedData) setDashboardLoading(true);

    // Pre-populate listings from cache so the feed shows immediately on navigation.
    const cachedListings = getCachedApi<unknown>("/api/v1/listings");
    const cachedListingItems = cachedListings === null ? null : unwrapData<Listing[]>(cachedListings);
    if (cachedListings) {
      const items = Array.isArray(cachedListingItems) ? cachedListingItems : [];
      setListings(items);
      void refreshCachedApi<unknown>("/api/v1/listings")
        .then((response) => {
          const refreshedListings = unwrapData<Listing[]>(response);
          if (Array.isArray(refreshedListings)) setListings(refreshedListings);
        })
        .catch(() => undefined);
    }
    if (cachedProfile) {
      setProfile({ ...cachedProfile, displayName: resolveAccountName(cachedProfile) });
      setVerification(normalizeVerificationStage(getPersistedVerification(cachedProfile.id)));
      if (cachedProfile.id) {
        const cachedAvatar = getCachedUserAvatar(cachedProfile.id);
        if (cachedAvatar) setProfileImage(cachedAvatar);
      }
      const cachedPicture = getCachedMediaUrl(cachedProfile.profilePicture ?? cachedProfile.studentProfile?.profilePicture);
      if (cachedPicture) {
        setProfileImage(cachedPicture);
        if (cachedProfile.id) setCachedUserAvatar(cachedProfile.id, cachedPicture, cachedProfile.profilePicture ?? cachedProfile.studentProfile?.profilePicture);
      }
    }
    else {
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
        const normalized = normalizeVerificationStage(immediateVerification);
        if (normalized) setVerification((current) => current ?? normalized);
      } else {
        setVerification((current) => current ?? normalizeVerificationStage(getPersistedVerification(user.id)));
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
      const homesRequest = cachedListingItems !== null
        ? Promise.resolve(null)
        : cachedApiFetch<Listing[]>("/api/v1/listings").catch(() => []);
      const verificationRequest = ["STUDENT", "AGENT", "LANDLORD", "ADMIN"].includes(role) && !user.verification
        ? apiFetch<unknown>("/api/v1/trust/me/verification-stage")
            .then((response) => {
              const stage = normalizeVerificationStage(response);
              if (stage) setPersistedVerification(user.id, response);
              return stage;
            })
            .catch(() => null)
        : Promise.resolve(null);
      void verificationRequest.then((stage) => {
        if (stage) setVerification(stage);
      });
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
      if (Array.isArray(homes)) setListings(homes);
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
      setVerification(null);
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
    listings.forEach((listing) => {
      const picture = listing.owner?.profilePicture;
      if (!picture) return;
      if (isUsableImageSource(picture)) {
        setResolvedProviderAvatars((current) => ({ ...current, [listing.id]: picture }));
        return;
      }
      const cachedPicture = getCachedMediaUrl(picture);
      if (cachedPicture) {
        setResolvedProviderAvatars((current) => ({ ...current, [listing.id]: cachedPicture }));
        return;
      }
      void resolveMediaUrl(picture).then((url) => {
        if (url && isUsableImageSource(url)) {
          setResolvedProviderAvatars((current) => ({ ...current, [listing.id]: url }));
        }
      }).catch(() => undefined);
    });
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
        // Keep the current dashboard state if a temporary status check fails.
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

  const toggleLike = async (listing: Listing) => {
    const actionKey = `like:${listing.id}`;
    if (pendingEngagement.has(actionKey)) return;
    const liked = listing.likedByCurrentUser === true;
    setPendingEngagement((current) => new Set(current).add(actionKey));
    try {
      await apiFetch(`/api/v1/listings/${encodeURIComponent(listing.id)}/like`, { method: liked ? "DELETE" : "POST" });
      setListings((current) => current.map((item) => item.id === listing.id
        ? { ...item, likedByCurrentUser: !liked, likeCount: Math.max(0, (item.likeCount ?? 0) + (liked ? -1 : 1)) }
        : item));
    } catch {
      setActionMessage("We could not update your like. Please try again.");
    } finally {
      setPendingEngagement((current) => {
        const next = new Set(current);
        next.delete(actionKey);
        return next;
      });
    }
  };
  void toggleLike;

  // Scroll-position restore/save for the snap feed (the feed container scrolls, not the window).
  // Restore waits until listings exist, otherwise the saved offset would be clamped to 0.
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

  // Background "new posts" polling: every 60s while tab is visible, check if there are
  // newer listings than the top of the current feed. If so, show the pill.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const check = async () => {
      if (document.visibilityState === "hidden") return;
      const topId = listings[0]?.id;
      if (!topId) return;
      try {
        const result = await apiFetch<unknown>("/api/v1/listings?limit=1");
        const items = Array.isArray(result) ? result : (result as Record<string, unknown>)?.data as Listing[] ?? [];
        if (items.length > 0 && items[0].id !== topId) setNewPostsAvailable(true);
      } catch {
        // Silent failure — don't surface polling errors to the user.
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
    feedRef.current?.scrollTo({ top: 0 });
    try {
      const result = await apiFetch<unknown>("/api/v1/listings");
      const items = Array.isArray(result) ? result : (result as Record<string, unknown>)?.data as Listing[] ?? [];
      setListings(items);
    } catch {
      // Keep current feed if refresh fails.
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
    } catch {
      setActionMessage("We could not update your saved listings. Please try again.");
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
    } catch {
      setActionMessage("We could not update your recommendation. Please try again.");
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
  const setCommentCount = (listingId: string, count: number) => {
    setCommentCounts((current) => current[listingId] === count ? current : { ...current, [listingId]: count });
  };

  const openPage = () => router.push(pageStatus === "none" ? "/page/new" : "/page");
  const accountName = resolveAccountName(profile);
  const canCreateProviderPage = ["AGENT", "LANDLORD"].includes(String(profile?.role ?? "").toUpperCase());
  const isStudent = String(profile?.role ?? "").toUpperCase() === "STUDENT";

  if (dashboardLoading) {
    // Mirrors the real full-screen layout so nothing jumps when content arrives.
    return (
      <main className="relative h-[100dvh] overflow-hidden bg-neutral-900 md:pl-72" aria-busy="true">
        <DashboardNav onCreatePage={openPage} pageStatus={pageStatus} canManagePage={canCreateProviderPage} supportCount={openSupportCount} />
        <section className="relative h-full w-full overflow-hidden" aria-label="Loading homes">
          <div className="absolute left-4 right-4 top-12 mx-auto flex max-w-2xl items-center gap-3">
            <div className="h-12 flex-1 animate-pulse rounded-full border border-white/10 bg-white/10" />
            <div className="h-10 w-10 animate-pulse rounded-full bg-white/10" />
          </div>
          <div className="absolute bottom-24 left-16 right-4 max-w-xl space-y-3 md:bottom-8 md:left-24 md:right-8">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 animate-pulse rounded-full bg-white/10" />
              <div className="space-y-2">
                <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
                <div className="h-3 w-40 animate-pulse rounded bg-white/10" />
              </div>
            </div>
            <div className="h-6 w-2/3 animate-pulse rounded bg-white/10" />
            <div className="h-4 w-full animate-pulse rounded bg-white/10" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-white/10" />
          </div>
          <div className="absolute left-3 top-1/2 h-52 w-12 -translate-y-1/2 animate-pulse rounded-full border border-white/20 bg-white/15 md:left-6" />
        </section>
      </main>
    );
  }

  const submitSearch = () => {
    const query = searchQuery.trim();
    router.push(query ? `/connect?q=${encodeURIComponent(query)}` : "/connect");
  };

  return (
    <main className="relative h-[100dvh] overflow-hidden bg-black md:pl-72">
      <DashboardNav onCreatePage={openPage} pageStatus={pageStatus} canManagePage={canCreateProviderPage} supportCount={openSupportCount} />
      <section className="relative h-full w-full overflow-hidden bg-black">
        <div className="absolute left-4 right-4 top-12 z-40 mx-auto flex max-w-2xl items-center gap-3">
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
            className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full border border-black/10 bg-white/95 pl-4 pr-2 text-black shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-md focus-within:ring-2 focus-within:ring-safecrib-green"
          >
            <Icon name="search" className="h-5 w-5 shrink-0 text-black/45" />
            <input
              type="search"
              enterKeyHint="search"
              aria-label="Search homes, people, and pages"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search homes, people, and pages"
              className="min-w-0 flex-1 bg-transparent text-sm text-safecrib-black placeholder:text-black/45 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {searchQuery.length > 0 && (
              <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear search" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-black/45 transition hover:bg-black/5 hover:text-black/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-safecrib-green">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m18 6-12 12M6 6l12 12" /></svg>
              </button>
            )}
          </form>
          <Link href="/profile" aria-label="View your profile" title={accountName || "View your profile"} className="shrink-0 rounded-full border-2 border-white/80 shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            <ProfileAvatar src={profileImage} seed={profile?.id ?? profile?.email ?? "safecrib-member-avatar"} alt={`${accountName || "Your"} profile photo`} size="small" />
          </Link>
        </div>

        {listings.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-100 px-5 pb-10 pt-28 text-center" aria-label="No listings are available yet">
            <EmptyListingsIllustration />
            <h2 className="mt-4 font-display text-lg font-bold text-safecrib-black">No homes listed yet</h2>
            <p className="mt-1 max-w-xs text-sm text-black/55">New listings from verified providers will show up here as soon as they&apos;re posted.</p>
          </div>
        )}

        <div ref={feedRef} className="absolute inset-0 snap-y snap-mandatory overflow-x-hidden overflow-y-auto overscroll-y-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* New posts pill — appears when background polling detects newer listings */}
          {newPostsAvailable && (
            <div className="pointer-events-none sticky top-[7.5rem] z-30 flex h-0 justify-center">
              <button
                type="button"
                onClick={() => void refreshFeed()}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-safecrib-green px-4 py-2 text-sm font-semibold text-white shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                aria-live="polite"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7-7 7 7" /></svg>
                New posts
              </button>
            </div>
          )}
          {listings.map((listing, index) => {
            const imageReference = getListingImageReference(listing);
            const fallbackImage = getListingImageUrl(listing) ?? (isUsableImageSource(imageReference) ? imageReference : null);
            const image = isUsableImageSource(resolvedListingImages[listing.id])
              ? resolvedListingImages[listing.id]
              : fallbackImage;
            const ownerLabel = listing.ownerId ? "Verified provider" : "Verified home";
            const providerName = listing.owner?.displayName ?? "Provider";
            const location = listing.address ?? listing.campus ?? null;
            const isSaved = bookmarkedIds.includes(listing.id);
            const commentsOpen = openCommentIds.has(listing.id);
            const commentCount = commentCounts[listing.id] ?? listing.commentCount ?? 0;
            const hasMedia = Boolean(image || listing.video);
            // Videos have a control bar near the bottom, so the text block sits higher only for them.
            const infoPosition = listing.video ? "bottom-44 md:bottom-20" : "bottom-24 md:bottom-8";
            return (
              <article
                key={listing.id}
                className={`relative h-full min-h-full w-full snap-start snap-always overflow-hidden text-white ${hasMedia ? "bg-black" : "bg-gradient-to-br from-safecrib-green to-black"}`}
              >
                {hasMedia && (
                  <div className="absolute inset-0">
                    {listing.video ? (
                      <ListingCardVideo video={listing.video} poster={image ?? null} fallbackSrc={fallbackImage} alt={listing.title ?? "Listing"} />
                    ) : image ? (
                      <Link href={`/dashboard/listings/${listing.id}`} aria-label={`Open ${listing.title ?? "listing"}`} className="absolute inset-0">
                        <ListingCardImage src={image} fallbackSrc={fallbackImage} alt={listing.title ?? "Listing"} priority={index === 0} />
                      </Link>
                    ) : null}
                  </div>
                )}
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/50" />

                <div className={`absolute left-16 right-4 z-20 max-w-xl text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.45)] md:left-24 md:right-8 ${infoPosition}`}>
                  <div className="mb-3 flex items-center gap-3">
                    <ProfileAvatar src={resolvedProviderAvatars[listing.id] ?? null} alt={`${providerName} profile photo`} size="small" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <p className="truncate text-sm font-bold">{providerName}</p>
                        <span role="img" title={ownerLabel} aria-label={ownerLabel} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-safecrib-green text-white shadow-sm">
                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 10 3.5 3.5 7.5-7.5" /></svg>
                        </span>
                      </div>
                      {location && <p className="truncate text-xs text-white/80">{location}</p>}
                    </div>
                    <div className="relative shrink-0" data-listing-menu-open={openMenuId === listing.id ? "true" : undefined}>
                      <button
                        type="button"
                        aria-label="More options"
                        aria-haspopup="menu"
                        aria-expanded={openMenuId === listing.id}
                        onClick={() => setOpenMenuId((current) => current === listing.id ? null : listing.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm hover:bg-black/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
                      </button>
                      {openMenuId === listing.id && (
                        <div role="menu" className="absolute bottom-full right-0 z-30 mb-2 w-52 overflow-hidden rounded-xl border border-black/10 bg-white text-black shadow-[0_18px_45px_rgba(15,23,42,0.25)] [text-shadow:none]">
                          <Link role="menuitem" href={`/dashboard/listings/${listing.id}`} onClick={() => setOpenMenuId(null)} className="block border-b border-black/5 px-3 py-2.5 text-sm text-black/75 transition hover:bg-black/[0.03]">Open post</Link>
                          {listing.ownerId && <Link role="menuitem" href={`/profile/${encodeURIComponent(listing.ownerId)}`} onClick={() => setOpenMenuId(null)} className="block px-3 py-2.5 text-sm text-black/75 transition hover:bg-black/[0.03]">View provider</Link>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <Link href={`/dashboard/listings/${listing.id}`} className="min-w-0 flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
                      <h2 className="line-clamp-2 text-lg font-bold leading-snug text-white hover:underline sm:text-xl">{listing.title ?? "Verified home"}</h2>
                      {listing.description && <p className="mt-2 line-clamp-3 text-sm leading-5 text-white/90">{listing.description}</p>}
                    </Link>
                    <div className="shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-safecrib-black shadow-lg [text-shadow:none]"><ListingPriceTag listing={listing} /></div>
                  </div>
                </div>

                <div role="group" aria-label="Listing actions" className="absolute left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-full border border-white/60 bg-white/60 px-1 py-2 text-black shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-2xl md:left-6">
                  <div className="flex w-10 flex-col items-center">
                    <LikeButton
                      listingId={listing.id}
                      initialLikeCount={listing.likeCount ?? 0}
                      initialIsLiked={listing.likedByCurrentUser ?? false}
                      onLike={async (id, liked) => {
                        await apiFetch(`/api/v1/listings/${encodeURIComponent(id)}/like`, { method: liked ? "POST" : "DELETE" });
                        setListings((current) => current.map((item) => item.id === id
                          ? { ...item, likedByCurrentUser: liked, likeCount: Math.max(0, (item.likeCount ?? 0) + (liked ? 1 : -1)) }
                          : item));
                      }}
                      size="md"
                      showLabel={false}
                    />
                    <span className="text-[11px] font-semibold leading-3 text-black/75">{formatEngagementCount(listing.likeCount ?? 0)}</span>
                  </div>

                  <div className="flex w-10 flex-col items-center">
                    <button
                      type="button"
                      onClick={() => toggleComments(listing.id)}
                      aria-haspopup="dialog"
                      aria-expanded={commentsOpen}
                      aria-label={`Comments, ${commentCount}`}
                      title="Comments"
                      className={`flex h-9 w-10 items-center justify-center rounded-full text-black/75 transition hover:bg-white/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-safecrib-green ${commentsOpen ? "bg-white/70 text-safecrib-green" : ""}`}
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /></svg>
                    </button>
                    <span className="text-[11px] font-semibold leading-3 text-black/75">{formatEngagementCount(commentCount)}</span>
                  </div>

                  {listing.ownerId && listing.ownerId !== profile?.id && (
                    <div className="flex w-10 flex-col items-center">
                      <RecommendButton
                        providerId={listing.ownerId}
                        initialRecommendationCount={listing.providerRecommendationCount ?? 0}
                        initialIsRecommended={recommendedProviderIds.includes(listing.ownerId)}
                        onRecommend={async (pId, recommended) => { await toggleRecommendation(pId); void recommended; }}
                        disabled={String(profile?.role ?? "").toUpperCase() !== "STUDENT" || !recommendationsLoaded || pendingEngagement.has(`recommend:${listing.ownerId}`)}
                        role={String(profile?.role ?? "").toUpperCase()}
                        size="md"
                        showLabel={false}
                      />
                      <span className="text-[11px] font-semibold leading-3 text-black/75">{formatEngagementCount(listing.providerRecommendationCount ?? 0)}</span>
                    </div>
                  )}

                  {isStudent && (
                    <div className="flex w-10 flex-col items-center">
                      <button
                        type="button"
                        onClick={() => void toggleBookmark(listing.id)}
                        aria-pressed={isSaved}
                        aria-label={isSaved ? "Remove from saved listings" : "Save listing"}
                        title={isSaved ? "Saved" : "Save"}
                        className={`flex h-9 w-10 items-center justify-center rounded-full transition hover:bg-white/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-safecrib-green ${isSaved ? "text-safecrib-green" : "text-black/75"}`}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1Z" /></svg>
                      </button>
                      <span className="text-[11px] font-semibold leading-3 text-black/75">{isSaved ? "Saved" : "Save"}</span>
                    </div>
                  )}
                </div>

                {commentsOpen && (
                  <ListingComments
                    listingId={listing.id}
                    ownerId={listing.ownerId}
                    onClose={closeComments}
                    onCountChange={(count) => setCommentCount(listing.id, count)}
                  />
                )}
              </article>
            );
          })}
        </div>
      </section>
      <RestrictedActionModal message={actionMessage} onClose={() => setActionMessage(null)} />
    </main>
  );
}