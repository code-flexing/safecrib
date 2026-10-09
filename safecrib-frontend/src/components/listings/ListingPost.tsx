"use client";

import { PostHeader } from "./PostHeader";
import { PostMedia } from "./PostMedia";
import { PostActions } from "./PostActions";
import { Icon } from "@/components/ui/Icon";

type ListingForPost = {
  id: string;
  title?: string;
  description?: string | null;
  price?: number;
  discountAmount?: number | null;
  campus?: string | null;
  address?: string | null;
  // Optional — backend does not currently return these fields.
  // Hide the UI chip entirely when absent; never show fake values.
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
  // Recommend (provider-level)
  recommendationCount?: number;
  isRecommended?: boolean;
  isRecommendDisabled?: boolean;
  userRole?: string;
};

function formatPrice(price: number, discountAmount?: number | null) {
  const finalPrice = discountAmount && discountAmount > 0 ? price - discountAmount : price;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(finalPrice);
}

export function ListingPost({
  listing,
  onLike,
  onComment,
  onCommentPrefetch,
  onView,
  onShare,
  onBookmark,
  onRecommend,
  onCall,
  onWhatsApp,
  onBookInspection,
  onMessageAgent,
}: {
  listing: ListingForPost;
  onLike: (listingId: string, liked: boolean) => Promise<void>;
  onComment: (listingId: string) => void;
  onCommentPrefetch?: (listingId: string) => void;
  onView?: (listingId: string) => void;
  onShare?: (listingId: string) => Promise<void>;
  onBookmark: (listingId: string) => Promise<void>;
  onRecommend?: (providerId: string, recommended: boolean) => Promise<void>;
  onCall?: () => void;
  onWhatsApp?: () => void;
  onBookInspection?: () => void;
  onMessageAgent?: () => void;
}) {
  const displayTitle = listing.title ?? "Untitled listing";

  const mediaItems = [
    ...listing.photos.map((photo, index) => ({
      id: photo.id,
      mediaId: photo.mediaId ?? undefined,
      url: photo.url,
      type: "image" as const,
      alt: `${displayTitle} - Photo ${index + 1}`,
    })),
    ...(listing.video
      ? [
          {
            id: listing.video.mediaId,
            mediaId: listing.video.mediaId,
            type: "video" as const,
            durationSec: listing.video.durationSec ?? undefined,
            posterMediaId: listing.photos[0]?.mediaId ?? undefined,
            posterUrl: listing.photos[0]?.url,
            alt: `${displayTitle} - Video`,
          },
        ]
      : []),
  ];

  return (
    <article className="overflow-hidden rounded-[22px] border border-black/8 bg-[#FFFFFF] shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <PostHeader
        agent={{
          id: listing.ownerId,
          displayName: listing.ownerDisplayName,
          handle: listing.ownerHandle,
          avatarMediaId: listing.ownerAvatarMediaId,
          avatarUrl: listing.ownerAvatarUrl,
          isVerified: listing.ownerIsVerified,
          verificationBadge: listing.ownerVerificationBadge,
          agencyName: listing.ownerAgencyName,
        }}
        postedAt={listing.createdAt}
        isOwnListing={false}
      />

      {/* Body */}
      <div className="px-4 pb-2 pt-3">
        {/* Title */}
        <h2 className="text-[1.05rem] font-semibold leading-snug text-safecrib-black">
          {displayTitle}
        </h2>

        {/* Location */}
        {(listing.campus ?? listing.address) && (
          <div className="mt-1.5 flex items-center gap-1.5 text-sm text-black/55">
            <Icon name="map-pin" className="h-3.5 w-3.5 shrink-0" />
            <span>{listing.campus ?? listing.address}</span>
          </div>
        )}

        {/* Feature chips */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {typeof listing.bedrooms === "number" && listing.bedrooms > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/[0.02] px-2.5 py-1 text-[11px] font-medium text-black/70">
              <Icon name="bed" className="h-3 w-3" />
              <span>{listing.bedrooms}</span>
            </span>
          )}

          {typeof listing.bathrooms === "number" && listing.bathrooms > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-black/10 bg-black/[0.02] px-2.5 py-1 text-[11px] font-medium text-black/70">
              <Icon name="droplet" className="h-3 w-3" />
              <span>{listing.bathrooms}</span>
            </span>
          )}

          {listing.propertyType && (
            <span className="inline-flex items-center rounded-full border border-black/10 bg-black/[0.02] px-2.5 py-1 text-[11px] font-medium text-black/70">
              {listing.propertyType}
            </span>
          )}
        </div>

      </div>

      {/* Media */}
      {mediaItems.length > 0 && (
        <div className="relative px-4 pb-3">
          <div className="relative overflow-hidden rounded-[18px] border border-black/6 bg-black/5 shadow-[0_18px_36px_rgba(15,23,42,0.08)]">
            <PostMedia media={mediaItems} />
            {listing.price != null ? (
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 inline-flex items-center gap-2 rounded-full border border-white/90 bg-white/88 px-3 py-1.5 shadow-[0_12px_32px_rgba(17,24,39,0.18)] backdrop-blur-sm">
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-black/45">From</span>
                <span className="text-base font-semibold text-safecrib-black">{formatPrice(listing.price, listing.discountAmount)}</span>
                <span className="text-[11px] text-black/45">/yr</span>
              </div>
            ) : (
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 rounded-full border border-white/90 bg-white/88 px-3 py-1.5 text-sm font-medium text-black/70 shadow-[0_12px_32px_rgba(17,24,39,0.18)] backdrop-blur-sm">
                Price on request
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 pb-4 pt-1">
        <PostActions
          listingId={listing.id}
          likeCount={listing.likeCount}
          isLiked={listing.likedByCurrentUser}
          commentCount={listing.commentCount}
          viewCount={listing.viewCount}
          isBookmarked={listing.isBookmarked}
          agentPhone={listing.ownerPhone}
          agentWhatsApp={listing.ownerWhatsApp}
          providerId={listing.ownerId}
          recommendationCount={listing.recommendationCount}
          isRecommended={listing.isRecommended}
          isRecommendDisabled={listing.isRecommendDisabled}
          userRole={listing.userRole}
          onLike={onLike}
          onComment={onComment}
          onCommentPrefetch={onCommentPrefetch}
          onView={onView}
          onBookmark={onBookmark}
          onRecommend={onRecommend}
          onCall={onCall}
          onWhatsApp={onWhatsApp}
          onBookInspection={onBookInspection}
          onMessageAgent={onMessageAgent}
        />
      </div>
    </article>
  );
}
