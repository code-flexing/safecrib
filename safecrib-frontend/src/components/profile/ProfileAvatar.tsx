"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

type ProfileAvatarProps = {
  src?: string | null;
  seed?: string | null;
  alt: string;
  size?: "small" | "medium" | "large";
  className?: string;
  loading?: boolean;
};

export function ProfileAvatar({
  src,
  alt,
  size = "medium",
  className = "",
  loading = false,
}: ProfileAvatarProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showMissing, setShowMissing] = useState(false);

  useEffect(() => {
    setFailedSource(null);
    setImageLoaded(false);
    setShowMissing(false);
  }, [src]);

  const missing = !src || failedSource === src;
  const isPendingImage = Boolean(src) && !failedSource && !imageLoaded;
  useEffect(() => {
    if (loading || !missing) {
      setShowMissing(false);
      return;
    }
    if (src && failedSource === src) {
      setShowMissing(true);
      return;
    }
    const timer = window.setTimeout(() => setShowMissing(true), 5000);
    return () => window.clearTimeout(timer);
  }, [failedSource, loading, missing, src]);

  const sizeClass = size === "small" ? "h-12 w-12" : size === "large" ? "h-32 w-32" : "h-16 w-16";
  const imageClass = `${sizeClass} shrink-0 overflow-hidden rounded-full border border-black/10 ${className}`;

  if (src && failedSource !== src) {
    return <div className="relative">
      {(loading || isPendingImage) && <div aria-hidden="true" className={`${imageClass} absolute inset-0 animate-pulse bg-black/[0.06]`} />}
      <Image
        src={src}
        alt={alt}
        width={128}
        height={128}
        unoptimized
        onLoad={() => setImageLoaded(true)}
        onError={() => setFailedSource(src)}
        className={`${imageClass} object-cover ${loading || isPendingImage ? "opacity-0" : "opacity-100"}`}
      />
    </div>;
  }

  return <div role="img" aria-label={loading || isPendingImage || !showMissing ? "Loading profile picture" : `${alt} unavailable`} className={`${imageClass} flex items-center justify-center bg-black/[0.04] text-black/35`}>
    {loading || isPendingImage ? <div aria-hidden="true" className={`${imageClass} animate-pulse bg-black/[0.06]`} /> : showMissing ? <Icon name="image" className={size === "small" ? "h-5 w-5" : size === "large" ? "h-9 w-9" : "h-6 w-6"} /> : null}
  </div>;
}