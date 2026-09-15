"use client";

/**
 * DuplicateWarningBanner — shown when the backend pHash check flags a photo
 * as potentially matching an existing listing.
 *
 * Used in two contexts:
 *   1. Agent photo upload (inline warning in ListingForm)
 *   2. Admin review queue (in the DuplicateFlag review panel)
 */

import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";

interface DuplicateWarningBannerProps {
  /** ID of the listing whose photos matched */
  matchedListingId: string;
  /** Similarity 0–1 from pHash comparison */
  similarity: number;
  className?: string;
}

export function DuplicateWarningBanner({
  matchedListingId,
  similarity,
  className = "",
}: DuplicateWarningBannerProps) {
  const pct = Math.round(similarity * 100);

  return (
    <div className={`banner-warning flex items-start gap-2.5 ${className}`} role="alert">
      <AlertTriangleIcon size={16} className="shrink-0 mt-0.5" aria-hidden />
      <div>
        <p className="font-medium text-sm">Duplicate photo detected ({pct}% match)</p>
        <p className="text-sm mt-0.5">
          This photo closely matches one already uploaded to another listing.
          This may indicate a copied or reposted listing — our team will review it.
        </p>
        <Link
          href={`/listings/${matchedListingId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm underline mt-1 inline-block"
        >
          View matched listing →
        </Link>
      </div>
    </div>
  );
}
