"use client";

/**
 * ListingCard — image-led editorial card with TrustBadge.
 * The trust signal is never more than one glance away from any listing.
 */

import Image from "next/image";
import Link from "next/link";
import { MapPinIcon, CalendarIcon } from "lucide-react";
import { TrustBadge } from "@/components/trust/TrustBadge";
import type { Listing } from "@/lib/api/listings";

interface ListingCardProps {
  listing: Listing;
  /** If true, renders as a compact row instead of a card */
  compact?: boolean;
}

export function ListingCard({ listing, compact = false }: ListingCardProps) {
  const photo = listing.photos?.[0]?.url;
  const availableFrom = new Date(listing.availableFrom).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short", year: "numeric" },
  );

  if (compact) {
    return (
      <Link
        href={`/listings/${listing.id}`}
        className="flex gap-4 py-4 border-b border-[#E5E5E5] hover:bg-[#FAFAFA] transition-colors group"
      >
        {photo && (
          <div className="relative w-20 h-16 shrink-0 overflow-hidden">
            <Image
              src={photo}
              alt={listing.title}
              fill
              sizes="80px"
              className="object-cover"
              loading="lazy"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink truncate group-hover:underline">
            {listing.title}
          </p>
          <p className="text-xs text-muted mt-0.5">{listing.address}</p>
          <p className="text-sm font-display font-bold text-ink mt-1">
            £{listing.price.toLocaleString()}<span className="text-xs font-body font-normal text-muted">/mo</span>
          </p>
        </div>
        <TrustBadge
          score={listing.owner.trustScore}
          identityVerified={listing.owner.identityVerified}
          size="sm"
          showLabel={false}
          className="shrink-0 self-start mt-0.5"
        />
      </Link>
    );
  }

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="block group card"
      aria-label={`${listing.title} — £${listing.price}/mo`}
    >
      {/* Photo — carries the visual weight */}
      <div className="relative aspect-[4/3] overflow-hidden bg-[#F0F0F0]">
        {photo ? (
          <Image
            src={photo}
            alt={listing.title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#D4D4D4]">
            <span className="text-xs font-body">No photo</span>
          </div>
        )}

        {/* Status pill — AVAILABLE listings are standard, others flagged */}
        {listing.status !== "AVAILABLE" && (
          <span className={`absolute top-3 left-3 status-pill status-${listing.status.toLowerCase()}`}>
            {listing.status}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="px-0 py-4">
        {/* Price + trust badge on same line */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <p className="font-display text-xl font-bold text-ink">
            £{listing.price.toLocaleString()}
            <span className="text-sm font-body font-normal text-muted">/mo</span>
          </p>
          <TrustBadge
            score={listing.owner.trustScore}
            identityVerified={listing.owner.identityVerified}
            size="sm"
            showLabel={false}
          />
        </div>

        <h3 className="text-sm font-medium text-ink mb-1 group-hover:underline line-clamp-2">
          {listing.title}
        </h3>

        <div className="flex items-center gap-1 text-xs text-muted mb-1">
          <MapPinIcon size={11} aria-hidden />
          <span className="truncate">{listing.address}</span>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted">
          <CalendarIcon size={11} aria-hidden />
          <span>Available {availableFrom}</span>
        </div>

        {/* Agent name */}
        <p className="text-xs text-muted mt-3 pt-3 border-t border-[#F0F0F0]">
          Listed by{" "}
          <span className="text-ink font-medium">
            {listing.owner.displayName ?? "Agent"}
          </span>
        </p>
      </div>
    </Link>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

export function ListingCardSkeleton() {
  return (
    <div className="card" aria-hidden>
      <div className="skeleton aspect-[4/3]" />
      <div className="py-4 space-y-2">
        <div className="skeleton h-5 w-24" />
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-3 w-1/2" />
        <div className="skeleton h-3 w-1/3" />
      </div>
    </div>
  );
}
