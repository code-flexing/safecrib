"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { getCachedMediaUrl, resolveMediaUrl } from "@/lib/api";

type ListingMediaImageProps = {
  mediaId?: string;
  url?: string;
  alt: string;
  className: string;
  width?: number;
  height?: number;
};

export function ListingMediaImage({
  mediaId,
  url,
  alt,
  className,
  width = 400,
  height = 300,
}: ListingMediaImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(
    getCachedMediaUrl(mediaId) ?? (mediaId ? null : url ?? null),
  );

  useEffect(() => {
    let active = true;
    const reference = mediaId ?? url;
    if (!reference) {
      setImageUrl(null);
      return () => { active = false; };
    }
    const cachedUrl = getCachedMediaUrl(reference);
    if (cachedUrl) {
      setImageUrl(cachedUrl);
      return () => { active = false; };
    }
    void resolveMediaUrl(reference).then((resolvedUrl) => {
      if (active) setImageUrl(resolvedUrl ?? url ?? null);
    });
    return () => { active = false; };
  }, [mediaId, url]);

  if (!imageUrl) {
    return <div role="img" aria-label={`${alt} unavailable`} className={`${className} flex items-center justify-center bg-black/5 text-xs text-black/45`}>Photo unavailable</div>;
  }
  return <Image src={imageUrl} alt={alt} width={width} height={height} unoptimized className={className} onError={() => setImageUrl(null)} />;
}

type ListingMediaVideoProps = {
  mediaId: string;
  className: string;
};

export function ListingMediaVideo({ mediaId, className }: ListingMediaVideoProps) {
  const [videoUrl, setVideoUrl] = useState<string | null>(getCachedMediaUrl(mediaId));

  useEffect(() => {
    let active = true;
    const cachedUrl = getCachedMediaUrl(mediaId);
    if (cachedUrl) {
      setVideoUrl(cachedUrl);
      return () => { active = false; };
    }
    void resolveMediaUrl(mediaId).then((resolvedUrl) => {
      if (active) setVideoUrl(resolvedUrl);
    });
    return () => { active = false; };
  }, [mediaId]);

  if (!videoUrl) return <div className={`${className} flex items-center justify-center bg-black/5 text-xs text-black/45`}>Video preview unavailable</div>;
  return <video src={videoUrl} controls preload="metadata" className={className} />;
}
