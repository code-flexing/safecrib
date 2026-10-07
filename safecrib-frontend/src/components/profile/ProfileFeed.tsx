"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { ListingPost } from "@/components/listings/ListingPost";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch, unwrapData } from "@/lib/api";
import type { TabKey } from "./ProfileTabs";

type ListingForFeed = {
  id: string;
  title?: string;
  description?: string | null;
  price?: number;
  discountAmount?: number | null;
  campus?: string | null;
  address?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  propertyType?: string | null;
  photos: Array<{ id: string; mediaId?: string | null; url: string }>;
  video?: { mediaId: string; durationSec?: number | null } | null;
  likeCount: number;
  likedByCurrentUser: boolean;
  commentCount: number;
  shareCount: number;
  viewCount: number;
  isBookmarked: boolean;
  ownerId: string;
  ownerDisplayName: string;
  ownerHandle?: string;
  ownerAvatarMediaId?: string;
  ownerAvatarUrl?: string;
  ownerIsVerified: boolean;
  ownerVerificationBadge?: "green" | "blue" | "gold";
  ownerAgencyName?: string;
  ownerPhone?: string;
  ownerWhatsApp?: string;
  createdAt: string | Date;
  recommendationCount?: number;
  isRecommended?: boolean;
  isRecommendDisabled?: boolean;
  userRole?: string;
};

type FeedResponse = {
  listings: ListingForFeed[];
  nextCursor?: string;
  hasMore: boolean;
};

function FeedSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="divide-y divide-border border-t border-border">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4">
          <Skeleton className="h-10 w-1/4 rounded" />
          <Skeleton className="mt-3 h-6 w-1/2 rounded" />
          <Skeleton className="mt-2 h-4 w-3/4 rounded" />
          <Skeleton className="mt-4 h-44 w-full rounded" />
          <Skeleton className="mt-3 h-10 w-full rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  const messages: Record<TabKey, string> = {
    posts: "No posts yet",
    replies: "No replies yet",
    media: "No media yet",
    reposts: "No reposts yet",
  };
  return (
    <div className="mt-5 border border-dashed border-black/15 bg-white px-5 py-10 text-center text-sm text-black/50">
      {messages[tab] || "No content yet"}
    </div>
  );
}

export function ProfileFeed({ userId, tab }: { userId: string; tab: TabKey }) {
  const [items, setItems] = useState<ListingForFeed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const fetchFeed = useCallback(
    async (pageCursor?: string, isInitial = false) => {
      if (isInitial) setIsLoading(true);
      else setIsFetchingNextPage(true);

      try {
        const params = new URLSearchParams();
        params.set("userId", userId);
        params.set("tab", tab);
        if (pageCursor) params.set("cursor", pageCursor);

        const response = await apiFetch<FeedResponse>(
          `/api/v1/users/${encodeURIComponent(userId)}/feed?${params.toString()}`
        );
        const data = unwrapData<FeedResponse>(response);

        if (isInitial) {
          setItems(data.listings);
        } else {
          setItems((prev) => [...prev, ...data.listings]);
        }
        setHasNextPage(data.hasMore);
        setCursor(data.nextCursor ?? null);
      } catch {
        if (isInitial) setItems([]);
        setHasNextPage(false);
      } finally {
        setIsLoading(false);
        setIsFetchingNextPage(false);
      }
    },
    [userId, tab]
  );

  const fetchNextPage = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && cursor) {
      fetchFeed(cursor, false);
    }
  }, [fetchFeed, hasNextPage, isFetchingNextPage, cursor]);

  useEffect(() => {
    fetchFeed(undefined, true);
  }, [fetchFeed]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const noop = () => {};
  const noopAsync = async () => {};

  if (isLoading) return <FeedSkeleton />;
  if (!items.length) return <EmptyState tab={tab} />;

  return (
    <div className="divide-y divide-black/10 border-t border-black/10">
      {items.map((item) => (
        <ListingPost
          key={item.id}
          listing={item}
          onLike={noopAsync}
          onComment={noop}
          onShare={noopAsync}
          onBookmark={noopAsync}
          onRecommend={noopAsync}
          onCall={noop}
          onWhatsApp={noop}
          onBookInspection={noop}
          onMessageAgent={noop}
        />
      ))}
      <div ref={sentinel} />
      {isFetchingNextPage && <FeedSkeleton count={1} />}
    </div>
  );
}