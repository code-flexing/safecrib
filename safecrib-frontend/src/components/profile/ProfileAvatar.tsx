"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import { resolveMediaUrl, getCachedMediaUrl, withMediaCacheBust } from "@/lib/api";

export function ProfileAvatar({
  src,
  name,
  seed,
  alt,
  size = 96,
  className = "",
  accentColor,
  loading = false,
  onReady,
}: {
  src?: string | null;
  name?: string;
  seed?: string;
  alt?: string;
  size?: number | "small" | "medium" | "large";
  className?: string;
  accentColor?: string | null;
  loading?: boolean;
  onReady?: (ready: boolean) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const displayName = name ?? seed ?? "";
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

  const sizeValue = typeof size === "number" ? size : size === "small" ? 32 : size === "large" ? 96 : 48;

  const isDirectUrl = (value: string | null | undefined): value is string => {
    return Boolean(value && /^https?:\/\//.test(value));
  };

  const directUrl = isDirectUrl(src) ? src : null;

  useEffect(() => {
    if (directUrl) {
      setImageUrl(directUrl);
      onReady?.(true);
      return;
    }
    if (src) {
      const cachedUrl = getCachedMediaUrl(src);
      if (cachedUrl) {
        setImageUrl(cachedUrl);
        onReady?.(true);
        return;
      }
      void resolveMediaUrl(src).then((resolvedUrl) => {
        if (resolvedUrl) {
          setImageUrl(resolvedUrl);
        }
        onReady?.(!!resolvedUrl);
      });
    } else {
      onReady?.(true);
    }
  }, [src, directUrl, onReady]);

  const ringStyle = accentColor
    ? {
        boxShadow: `0 0 0 2px ${accentColor}, 0 0 28px ${accentColor}33`,
        borderColor: "transparent",
      }
    : {};

  return (
    <div
      style={{ width: sizeValue, height: sizeValue }}
      className={`relative shrink-0 overflow-hidden rounded-full border-4 border-white bg-black/[0.04] ${className}`}
    >
      {src && !failed && imageUrl ? (
        <Image
          src={withMediaCacheBust(imageUrl)}
          alt={alt ?? `${displayName}'s avatar`}
          width={sizeValue}
          height={sizeValue}
          unoptimized
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          style={ringStyle}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-xl font-semibold text-black/35" style={ringStyle}>
          {initials}
        </span>
      )}
    </div>
  );
}