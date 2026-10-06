"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { resolveMediaUrl, getCachedMediaUrl, withMediaCacheBust } from "@/lib/api";

type MediaImageProps = {
  mediaId?: string;
  url?: string;
  alt: string;
  className?: string;
  width?: number;
  height?: number;
  transformation?: string;
  fallbackInitials?: string;
  fallbackBgColor?: string;
};

// Detect whether a string is already a usable image URL (not a bare UUID to be resolved).
function isDirectUrl(value: string | undefined): value is string {
  return Boolean(value && /^https?:\/\//.test(value));
}

export function MediaImage({
  mediaId,
  url,
  alt,
  className = "",
  width = 400,
  height = 300,
  transformation,
  fallbackInitials,
  fallbackBgColor = "#0C7355",
}: MediaImageProps) {
  // If url is already a direct https:// URL, prefer it over UUID API resolution.
  // This avoids 404s when a listing's stored photo URL is still valid but the
  // corresponding media record is stale / not READY.
  const directUrl = isDirectUrl(url) ? url : isDirectUrl(mediaId) ? mediaId : null;

  const [imageUrl, setImageUrl] = useState<string | null>(() => {
    if (directUrl) return directUrl;
    return getCachedMediaUrl(mediaId ?? "") ?? null;
  });
  const [isLoading, setIsLoading] = useState(!imageUrl);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    // If we already have a direct URL, no API call needed.
    if (directUrl) {
      setImageUrl(directUrl);
      setIsLoading(false);
      return;
    }
    let active = true;
    // Only resolve via API when we have a UUID mediaId (not a direct URL).
    const reference = mediaId;
    if (!reference) {
      setImageUrl(null);
      setIsLoading(false);
      return () => { active = false; };
    }
    const cachedUrl = getCachedMediaUrl(reference, transformation);
    if (cachedUrl) {
      setImageUrl(cachedUrl);
      setIsLoading(false);
      return () => { active = false; };
    }
    setIsLoading(true);
    void resolveMediaUrl(reference, transformation).then((resolvedUrl) => {
      if (active) {
        // Fall back to url if API returns null (e.g. media not READY).
        setImageUrl(resolvedUrl ?? (isDirectUrl(url) ? url : null));
        setIsLoading(false);
      }
    });
    return () => { active = false; };
  }, [mediaId, url, transformation, directUrl]);

  const handleError = () => {
    setHasError(true);
    setImageUrl(null);
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <div
        role="img"
        aria-label="Loading..."
        className={`${className} relative overflow-hidden bg-black/[0.04]`}
        style={{ width, height }}
      >
        <Skeleton className="absolute inset-0" animate />
      </div>
    );
  }

  if (hasError || !imageUrl) {
    const initials = fallbackInitials ?? alt.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    return (
      <div
        role="img"
        aria-label={`${alt} unavailable`}
        className={`${className} relative overflow-hidden flex items-center justify-center`}
        style={{ width, height, backgroundColor: fallbackBgColor }}
      >
        <span className="text-white font-semibold text-lg select-none">{initials}</span>
      </div>
    );
  }

  return (
    <Image
      src={withMediaCacheBust(imageUrl)}
      alt={alt}
      width={width}
      height={height}
      unoptimized
      className={`${className} object-cover`}
      onError={handleError}
    />
  );
}