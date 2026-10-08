"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { useOptimisticToggle } from "@/lib/optimistic";
import { useNotify } from "@/components/ui/Toast";
import { resolveNotificationKey, getNotificationMessage } from "@/lib/toast-messages";

type LikeButtonProps = {
  listingId: string;
  initialLikeCount: number;
  initialIsLiked: boolean;
  onLike: (listingId: string, liked: boolean) => Promise<void>;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
};

export function LikeButton({
  listingId,
  initialLikeCount,
  initialIsLiked,
  onLike,
  size = "md",
  showLabel = true,
}: LikeButtonProps) {
  const { notifyError } = useNotify();
  const [popAnimation, setPopAnimation] = useState(false);
  const [ringAnimation, setRingAnimation] = useState(false);
  const [countKey, setCountKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const { value: likeState, state: likeStatus, toggle } = useOptimisticToggle({
    key: `like:${listingId}`,
    initialValue: { count: initialLikeCount, liked: initialIsLiked },
    getNextValue: (current) => ({
      count: current.liked ? Math.max(0, current.count - 1) : current.count + 1,
      liked: !current.liked,
    }),
    onToggle: async (next) => {
      await onLike(listingId, next.liked);
    },
    onError: (error, rollback) => {
      const { key } = resolveNotificationKey(error, "like");
      const { message, action } = getNotificationMessage(key);
      notifyError(message, { action: action ? { label: action.label, onClick: () => toggle() } : undefined });
    },
    onSuccess: () => {
      setCountKey((k) => k + 1);
    },
    equals: (a, b) => a.count === b.count && a.liked === b.liked,
  });

  const { count: likeCount, liked: isLiked } = likeState;

  useEffect(() => {
    if (likeStatus === "pending" && isLiked && !reducedMotion) {
      setPopAnimation(true);
      setRingAnimation(true);
      setTimeout(() => setPopAnimation(false), 300);
      setTimeout(() => setRingAnimation(false), 400);
    }
  }, [likeStatus, isLiked, reducedMotion]);

  const sizeClasses = {
    sm: "min-h-8 text-xs gap-1 px-2 py-1",
    md: "min-h-9 text-sm gap-1.5 px-3 py-1.5",
    lg: "min-h-11 text-base gap-2 px-4 py-2",
  };

  const iconSizeClasses = {
    sm: "h-3.5 w-3.5",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const buttonSize = sizeClasses[size];
  const iconSize = iconSizeClasses[size];

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={likeStatus === "pending"}
      aria-pressed={isLiked}
      aria-label={isLiked ? "Unlike" : "Like"}
      className={`inline-flex min-w-0 max-w-full items-center justify-center ${buttonSize} rounded-full transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 ${isLiked ? "text-red-500" : "text-black/50"}`}
    >
      <span
        className={`relative inline-flex items-center justify-center ${popAnimation ? "like-pop" : ""}`}
        style={{ animationDuration: "300ms", animationFillMode: "both", animationTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}
      >
        <span className="relative" aria-hidden="true">
          {ringAnimation && !reducedMotion && (
            <span
              className="absolute inset-0 rounded-full like-ring"
              style={{
                animationDuration: "400ms",
                animationFillMode: "both",
                animationTimingFunction: "ease-out",
                border: "2px solid #ef4444",
                pointerEvents: "none",
              }}
            />
          )}
          <Icon
            name={isLiked ? "heart" : "heart"}
            className={`${iconSize} shrink-0 ${isLiked ? "fill-current" : ""} transition-colors duration-200`}
          />
        </span>
      </span>
      {showLabel && (
        <span
          key={countKey}
          className="count-roll min-w-0 truncate"
          style={{ animationDuration: "150ms", animationFillMode: "both", animationTimingFunction: "ease-out" }}
        >
          {likeCount.toLocaleString()}
        </span>
      )}
    </button>
  );
}