"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { MediaImage } from "./MediaImage";
import { Icon } from "@/components/ui/Icon";
import { resolveMediaUrl, getCachedMediaUrl } from "@/lib/api";

type MediaItem = {
  id: string;
  mediaId?: string;
  url?: string;
  type: "image" | "video";
  alt?: string;
  durationSec?: number;
  posterMediaId?: string;
  posterUrl?: string;
};

type PostMediaProps = {
  media: MediaItem[];
  onMediaClick?: (index: number) => void;
  className?: string;
};

function formatDuration(seconds: number | undefined) {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// UUID regex — a bare UUID must NOT be used as a src URL
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string | undefined): boolean {
  return Boolean(value && UUID_RE.test(value.trim()));
}

export function PostMedia({ media, onMediaClick, className = "" }: PostMediaProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  // Resolved streaming URLs keyed by mediaId
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [posterUrls, setPosterUrls] = useState<Record<string, string>>({});
  const videoRefs = useRef<Record<number, HTMLVideoElement>>({});

  // Resolve video streaming URLs via /api/v1/media/:id/access (no transformation for video)
  useEffect(() => {
    media.forEach((item) => {
      if (item.type !== "video") return;

      // Resolve the video stream URL from mediaId
      const videoRef = item.mediaId && isUuid(item.mediaId) ? item.mediaId : null;
      if (videoRef && !videoUrls[videoRef]) {
        // Videos must NOT use a named image transformation — pass undefined
        void resolveMediaUrl(videoRef, undefined).then((url) => {
          if (url) setVideoUrls((prev) => ({ ...prev, [videoRef]: url }));
        });
      }

      // Resolve poster from posterMediaId (image transformation is fine for poster)
      if (item.posterMediaId && !posterUrls[item.posterMediaId]) {
        void resolveMediaUrl(item.posterMediaId, "listing_card").then((url) => {
          if (url) setPosterUrls((prev) => ({ ...prev, [item.posterMediaId!]: url }));
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!lightboxOpen) return;
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowLeft")
        setLightboxIndex((i) => (i === 0 ? media.length - 1 : i - 1));
      if (event.key === "ArrowRight")
        setLightboxIndex((i) => (i === media.length - 1 ? 0 : i + 1));
    },
    [lightboxOpen, media.length],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    if (lightboxOpen) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [lightboxOpen, handleKeyDown]);

  // IntersectionObserver for video autoplay/pause
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number((entry.target as HTMLElement).dataset.videoIndex);
          const video = videoRefs.current[index];
          if (!video) return;
          if (entry.isIntersecting) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      },
      { threshold: 0.5 },
    );
    Object.entries(videoRefs.current).forEach(([, video]) => {
      if (video) observer.observe(video);
    });
    return () => observer.disconnect();
  }, [media]);

  const handleMediaClick = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
    onMediaClick?.(index);
  };

  if (media.length === 0) return null;

  const getVideoSrc = (item: MediaItem): string | undefined => {
    // If mediaId is a UUID, use the resolved streaming URL
    if (item.mediaId && isUuid(item.mediaId)) {
      return videoUrls[item.mediaId] ?? undefined;
    }
    // If mediaId is already an https:// URL (legacy direct-URL storage)
    if (item.mediaId && !isUuid(item.mediaId)) return item.mediaId;
    return item.url;
  };

  const getPosterSrc = (item: MediaItem): string | undefined => {
    if (item.posterMediaId && posterUrls[item.posterMediaId]) {
      return posterUrls[item.posterMediaId];
    }
    return item.posterUrl ?? undefined;
  };

  const renderMediaItem = (item: MediaItem, index: number) => {
    if (item.type === "video") {
      const src = getVideoSrc(item);
      const poster = getPosterSrc(item);

      return (
        <div
          key={item.id}
          className="group relative aspect-video overflow-hidden rounded-xl bg-black/10 cursor-pointer"
          onClick={() => handleMediaClick(index)}
        >
          <video
            ref={(el) => {
              if (el) videoRefs.current[index] = el;
            }}
            data-video-index={String(index)}
            className="absolute inset-0 h-full w-full object-cover"
            poster={poster}
            preload="metadata"
            playsInline
            muted
            controls
            onClick={(e) => e.stopPropagation()}
          >
            {src && <source src={src} type="video/mp4" />}
          </video>
          {!poster && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
              <Icon name="film" className="h-10 w-10 text-black/30" />
            </div>
          )}
          {/* Play overlay */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="h-14 w-14 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center text-black/70 shadow-lg">
              <Icon name="play" className="h-6 w-6 ml-1" />
            </div>
          </div>
          {item.durationSec && (
            <div className="absolute bottom-2 right-2 rounded bg-black/75 px-1.5 py-0.5 text-xs font-medium text-white pointer-events-none">
              {formatDuration(item.durationSec)}
            </div>
          )}
        </div>
      );
    }

    // Image
    return (
      <div
        key={item.id}
        className="group relative cursor-pointer"
        onClick={() => handleMediaClick(index)}
      >
        <MediaImage
          mediaId={item.mediaId}
          url={item.url}
          alt={item.alt ?? `Photo ${index + 1}`}
          className="aspect-[4/3] w-full rounded-xl object-cover"
          transformation="listing_card"
        />
      </div>
    );
  };

  // Grid layout
  const gridClass =
    media.length === 1
      ? "grid grid-cols-1 gap-2"
      : "grid grid-cols-2 gap-2";

  const visibleMedia = media.slice(0, 4);
  const overflow = media.length > 4 ? media.length - 4 : 0;

  // Lightbox
  const currentItem = media[lightboxIndex];
  const lightboxContent = lightboxOpen && currentItem ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95"
      onClick={() => setLightboxOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Media viewer"
    >
      <button
        type="button"
        className="absolute top-4 right-4 z-10 rounded-full p-2 text-white hover:bg-white/10"
        onClick={() => setLightboxOpen(false)}
        aria-label="Close"
      >
        <Icon name="x" className="h-6 w-6" />
      </button>
      {media.length > 1 && (
        <>
          <button
            type="button"
            className="absolute left-4 z-10 hidden rounded-full p-2 text-white hover:bg-white/10 sm:flex"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((i) => (i === 0 ? media.length - 1 : i - 1));
            }}
            aria-label="Previous"
          >
            <Icon name="chevron-left" className="h-8 w-8" />
          </button>
          <button
            type="button"
            className="absolute right-4 z-10 hidden rounded-full p-2 text-white hover:bg-white/10 sm:flex"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxIndex((i) => (i === media.length - 1 ? 0 : i + 1));
            }}
            aria-label="Next"
          >
            <Icon name="chevron-right" className="h-8 w-8" />
          </button>
        </>
      )}

      <div
        className="relative flex max-h-[85vh] max-w-[90vw] items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {currentItem.type === "video" ? (
          <video
            className="max-h-[85vh] max-w-[90vw] rounded-lg"
            controls
            autoPlay
            playsInline
            src={getVideoSrc(currentItem)}
          />
        ) : (
          <div className="relative h-[85vh] w-[90vw]">
            <Image
              src={
                getCachedMediaUrl(currentItem.mediaId ?? "") ??
                currentItem.url ??
                ""
              }
              alt={currentItem.alt ?? `Photo ${lightboxIndex + 1}`}
              fill
              sizes="90vw"
              className="rounded-lg object-contain"
              priority
              unoptimized
            />
          </div>
        )}
      </div>

      {media.length > 1 && (
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
          {media.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`h-2 w-2 rounded-full transition-colors ${
                i === lightboxIndex ? "bg-white" : "bg-white/40 hover:bg-white/60"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(i);
              }}
              aria-label={`Go to media ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className={`${gridClass} ${className}`}>
      {visibleMedia.map((item, index) => {
        const isLast = index === 3 && overflow > 0;
        if (isLast) {
          return (
            <div
              key={item.id}
              className="relative aspect-[4/3] cursor-pointer overflow-hidden rounded-xl"
              onClick={() => handleMediaClick(index)}
            >
              <MediaImage
                mediaId={item.mediaId}
                url={item.url}
                alt={item.alt ?? `Photo ${index + 1}`}
                className="absolute inset-0 h-full w-full object-cover"
                transformation="listing_card"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <span className="text-2xl font-bold text-white">+{overflow + 1}</span>
              </div>
            </div>
          );
        }
        return renderMediaItem(item, index);
      })}
      {lightboxContent}
    </div>
  );
}
