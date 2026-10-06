"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { withMediaCacheBust } from "@/lib/api";

type ProfileAvatarProps = {
  src?: string | null;
  seed?: string | null;
  alt: string;
  size?: "small" | "medium" | "large";
  className?: string;
  loading?: boolean;
  onReady?: (ready: boolean) => void;
};

export function ProfileAvatar({
  src,
  alt,
  size = "medium",
  className = "",
  loading = false,
  onReady,
}: ProfileAvatarProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const renderedSource = useMemo(() => (src ? withMediaCacheBust(src) : null), [src]);

  useEffect(() => {
    setFailedSource(null);
    setImageLoaded(false);
    setShowFallback(false);
  }, [src]);

  useEffect(() => {
    if (!src || loading || failedSource === src || imageLoaded) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setShowFallback(true);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [src, loading, failedSource, imageLoaded]);

  useEffect(() => {
    if (!src) {
      onReady?.(true);
      return;
    }
    if (failedSource === src) {
      onReady?.(false);
      return;
    }
    if (imageLoaded) {
      onReady?.(true);
    }
  }, [src, failedSource, imageLoaded, onReady]);

  const sizeClass = size === "small" ? "h-12 w-12" : size === "large" ? "h-32 w-32" : "h-16 w-16";
  const containerClass = `${sizeClass} shrink-0 overflow-hidden rounded-full border border-black/10 ${className}`;
  const isPending = loading || (!failedSource && !imageLoaded && (!src || !showFallback));

  if (renderedSource && failedSource !== src) {
    return (
      <div className="relative inline-flex" aria-busy={isPending}>
        {isPending && <Skeleton className={`${containerClass} absolute inset-0`} rounded="full" />}
        <Image
          key={renderedSource}
          src={renderedSource}
          alt={alt}
          width={128}
          height={128}
          unoptimized
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setFailedSource(src ?? null);
            onReady?.(false);
          }}
          className={`${containerClass} object-cover ${isPending ? "opacity-0" : "opacity-100"}`}
        />
      </div>
    );
  }

  if (isPending) {
    return (
      <div role="img" aria-label="Loading profile picture" className={`${containerClass} flex items-center justify-center bg-black/[0.04]`}>
        <Skeleton className={containerClass} rounded="full" />
      </div>
    );
  }

  return (
    <div role="img" aria-label={`${alt} unavailable`} className={`${containerClass} flex items-center justify-center bg-black/[0.04] text-black/35`}>
      <Icon name="image" className={size === "small" ? "h-5 w-5" : size === "large" ? "h-9 w-9" : "h-6 w-6"} />
    </div>
  );
}