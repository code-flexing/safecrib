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
};

export function ProfileAvatar({
  src,
  alt,
  size = "medium",
  className = "",
}: ProfileAvatarProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);

  useEffect(() => {
    if (src) setFailedSource(null);
  }, [src]);

  const missing = !src || failedSource === src;
  useEffect(() => {
    if (!missing) {
      setShowMissing(false);
      return;
    }
    if (src && failedSource === src) {
      setShowMissing(true);
      return;
    }
    const timer = window.setTimeout(() => setShowMissing(true), 5000);
    return () => window.clearTimeout(timer);
  }, [failedSource, missing, src]);

  const sizeClass = size === "small" ? "h-12 w-12" : size === "large" ? "h-32 w-32" : "h-16 w-16";
  const imageClass = `${sizeClass} shrink-0 overflow-hidden rounded-full border border-black/10 ${className}`;

  if (src && failedSource !== src) {
    return <Image src={src} alt={alt} width={128} height={128} unoptimized onError={() => setFailedSource(src)} className={`${imageClass} object-cover`} />;
  }

  return <div role="img" aria-label={showMissing ? `${alt} unavailable` : "Loading profile picture"} className={`${imageClass} flex items-center justify-center bg-black/[0.04] text-black/35`}>
    {showMissing && <Icon name="image" className={size === "small" ? "h-5 w-5" : size === "large" ? "h-9 w-9" : "h-6 w-6"} />}
  </div>;
}