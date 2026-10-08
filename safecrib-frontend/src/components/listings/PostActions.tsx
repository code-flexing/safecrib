"use client";

import { useState, useCallback } from "react";
import { LikeButton } from "./LikeButton";
import { RecommendButton } from "./RecommendButton";
import { Icon } from "@/components/ui/Icon";
import { useOptimisticToggle } from "@/lib/optimistic";
import { useNotify } from "@/components/ui/Toast";
import { resolveNotificationKey, getNotificationMessage } from "@/lib/toast-messages";

type PostActionsProps = {
  listingId: string;
  likeCount: number;
  isLiked: boolean;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  isBookmarked: boolean;
  agentPhone?: string;
  agentWhatsApp?: string;
  providerId?: string;
  recommendationCount?: number;
  isRecommended?: boolean;
  isRecommendDisabled?: boolean;
  userRole?: string;
  onLike: (listingId: string, liked: boolean) => Promise<void>;
  onComment: (listingId: string) => void;
  onCommentPrefetch?: (listingId: string) => void;
  onShare: (listingId: string) => Promise<void>;
  onBookmark: (listingId: string) => Promise<void>;
  onRecommend?: (providerId: string, recommended: boolean) => Promise<void>;
  onCall?: () => void;
  onWhatsApp?: () => void;
  onBookInspection?: () => void;
  onMessageAgent?: () => void;
};

export function PostActions({
  listingId,
  likeCount,
  isLiked,
  commentCount,
  shareCount,
  viewCount,
  isBookmarked,
  agentPhone,
  agentWhatsApp,
  providerId,
  recommendationCount = 0,
  isRecommended = false,
  isRecommendDisabled = false,
  userRole,
  onLike,
  onComment,
  onCommentPrefetch,
  onShare,
  onBookmark,
  onRecommend,
  onCall,
  onWhatsApp,
  onBookInspection,
  onMessageAgent,
}: PostActionsProps) {
  const { notifyError } = useNotify();

  const { value: bookmarkState, state: bookmarkStatus, toggle: toggleBookmark } = useOptimisticToggle({
    key: `bookmark:${listingId}`,
    initialValue: isBookmarked,
    getNextValue: (current) => !current,
    onToggle: async (next) => {
      await onBookmark(listingId);
    },
    onError: (error, rollback) => {
      const { key } = resolveNotificationKey(error, "bookmark");
      const { message, action } = getNotificationMessage(key);
      notifyError(message, { action: action ? { label: action.label, onClick: () => toggleBookmark() } : undefined });
    },
    equals: (a, b) => a === b,
  });

  const handleLike = useCallback(async (id: string, liked: boolean) => {
    await onLike(id, liked);
  }, [onLike]);

  const handleRecommend = useCallback(async (pId: string, recommended: boolean) => {
    if (onRecommend) await onRecommend(pId, recommended);
  }, [onRecommend]);

  return (
    <div className="border-t border-black/10 pt-3">
      {/* Reaction summary */}
      <div className="flex items-center gap-4 mb-3 text-sm text-black/60">
        <LikeButton
          listingId={listingId}
          initialLikeCount={likeCount}
          initialIsLiked={isLiked}
          onLike={handleLike}
          size="md"
        />
        <button
          type="button"
          onClick={() => onComment(listingId)}
          onMouseEnter={() => onCommentPrefetch?.(listingId)}
          onFocus={() => onCommentPrefetch?.(listingId)}
          aria-label={`View ${commentCount} comments`}
          className="flex items-center gap-2 rounded-full px-2.5 py-1.5 text-sm transition-colors hover:bg-black/[0.03]"
        >
          <Icon name="message-circle" className="h-4 w-4" />
          <span>{commentCount.toLocaleString()}</span>
        </button>
        <span className="flex items-center gap-2 rounded-full px-2.5 py-1.5" aria-label={`${shareCount} shares`}>
          <Icon name="share-2" className="h-4 w-4" />
          <span>{shareCount.toLocaleString()}</span>
        </span>
        <span className="flex items-center gap-2 rounded-full px-2.5 py-1.5" aria-label={`${viewCount} views`}>
          <Icon name="eye" className="h-4 w-4" />
          <span>{viewCount.toLocaleString()}</span>
        </span>
        {providerId && onRecommend && (
          <RecommendButton
            providerId={providerId}
            initialRecommendationCount={recommendationCount}
            initialIsRecommended={isRecommended}
            onRecommend={handleRecommend}
            disabled={isRecommendDisabled}
            role={userRole}
            size="md"
          />
        )}
        <button
          type="button"
          onClick={toggleBookmark}
          disabled={bookmarkStatus === "pending"}
          aria-pressed={bookmarkState}
          aria-label={bookmarkState ? "Remove from saved" : "Save listing"}
          className="ml-auto flex items-center gap-2 rounded-full px-3 py-1.5 text-sm text-black/60 transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Icon name="bookmark" className={`h-4 w-4 ${bookmarkState ? "fill-current text-safecrib-green" : ""}`} />
          <span>{bookmarkState ? "Saved" : "Save"}</span>
        </button>
      </div>

      {/* Primary CTAs */}
      <div className="flex flex-wrap gap-2">
        {onCall && agentPhone && (
          <button
            type="button"
            onClick={onCall}
            className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 rounded-full border border-black/15 px-4 py-2.5 text-sm font-medium text-black/70 transition-colors hover:bg-black/[0.03]"
            aria-label={`Call ${agentPhone}`}
          >
            <Icon name="phone" className="h-4 w-4" />
            <span>Call</span>
          </button>
        )}
        {onWhatsApp && agentWhatsApp && (
          <button
            type="button"
            onClick={onWhatsApp}
            className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 rounded-full bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
            aria-label={`Chat on WhatsApp`}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.472.099-.174.05-.372-.025-.52-.075-.148-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.372-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.57-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378 9.86 9.86 0 01-.397-.272 10.35 10.35 0 01-.455-.347l-.006-.006A20.17 20.17 0 012.436 11.05a10.34 10.34 0 01.262-3.593 10.21 10.21 0 012.03-3.47 10.43 10.43 0 013.582-1.288 9.94 9.94 0 015.016.004c1.643.09 2.956.755 3.846 1.927.89 1.17 1.276 2.61 1.128 3.696-.149 1.052-.926 2.178-2.438 2.936-.61.307-1.243.51-1.902.625-.712.124-1.378.149-2.064.124z"/>
            </svg>
            <span>WhatsApp</span>
          </button>
        )}
        {(onBookInspection || onMessageAgent) && (
          <button
            type="button"
            onClick={onBookInspection ?? onMessageAgent}
            className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 rounded-full bg-safecrib-green px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0a5f47]"
            aria-label={onBookInspection ? "Book inspection" : "Message agent"}
          >
            <Icon name={onBookInspection ? "calendar-plus" : "message-circle"} className="h-4 w-4" />
            <span>{onBookInspection ? "Book inspection" : "Message agent"}</span>
          </button>
        )}
      </div>
    </div>
  );
}