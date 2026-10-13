"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { useOptimisticToggle } from "@/lib/optimistic";
import { useNotify } from "@/components/ui/Toast";
import { resolveNotificationKey, getNotificationMessage } from "@/lib/toast-messages";
import { acquire, release, canFire } from "@/lib/burst-registry";
import { areEffectsEnabled } from "@/lib/effects-enabled";

type LikeButtonProps = {
  listingId: string;
  initialLikeCount: number;
  initialIsLiked: boolean;
  onLike: (listingId: string, liked: boolean) => Promise<void>;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
};

const PARTICLE_OFFSETS = [
  { type: "balloon", dx: -28, dy: -36, rot: -12, sway: 8, delay: 0, dur: 800 },
  { type: "balloon", dx: 24, dy: -40, rot: 10, sway: -6, delay: 40, dur: 900 },
  { type: "balloon", dx: -8, dy: -32, rot: 4, sway: 5, delay: 80, dur: 850 },
  { type: "confetti", dx: -20, dy: 18, rot: 45, sway: 6, delay: 20, dur: 700 },
  { type: "confetti", dx: 22, dy: 22, rot: -38, sway: -5, delay: 60, dur: 750 },
  { type: "confetti", dx: -30, dy: 10, rot: 72, sway: 4, delay: 100, dur: 650 },
  { type: "confetti", dx: 28, dy: 14, rot: -60, sway: -7, delay: 120, dur: 720 },
  { type: "heart", dx: -16, dy: -28, rot: -8, sway: 0, delay: 30, dur: 800 },
  { type: "heart", dx: 18, dy: -24, rot: 6, sway: 0, delay: 70, dur: 850 },
  { type: "sparkle", dx: -24, dy: -8, rot: 0, sway: 0, delay: 10, dur: 600 },
  { type: "sparkle", dx: 26, dy: -6, rot: 0, sway: 0, delay: 50, dur: 650 },
];

function getColorForType(type: string): string {
  switch (type) {
    case "balloon":
      return "#f97316"; // coral
    case "confetti":
      return "#eab308"; // yellow
    case "heart":
      return "#ec4899"; // pink
    case "sparkle":
      return "#38bdf8"; // sky blue
    default:
      return "#ef4444";
  }
}

function LikeBurst({ burstId, buttonRef }: { burstId: string; buttonRef: React.RefObject<HTMLButtonElement | null> }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const handleAnimationEnd = (e: AnimationEvent) => {
      if (e.animationName === "like-balloon-rise" || e.animationName === "like-confetti-fall" || e.animationName === "like-heart-rise" || e.animationName === "like-sparkle-pop") {
        release(`like:${buttonRef.current?.dataset.listingId ?? ""}`, burstId);
        const timeout = setTimeout(() => {
          if (container) {
            container.remove();
          }
        }, 1100);
        return () => clearTimeout(timeout);
      }
    };
    container.addEventListener("animationend", handleAnimationEnd);
    return () => container.removeEventListener("animationend", handleAnimationEnd);
  }, [burstId, buttonRef]);
  const particles = PARTICLE_OFFSETS.map((p, i) => {
    const baseDelay = p.delay;
    const duration = p.dur;
    const style: React.CSSProperties & Record<string, string> = {
      "--dx": `${p.dx}px`,
      "--dy": `${p.dy}px`,
      "--rot": `${p.rot}deg`,
      "--sway": `${p.sway}px`,
      animationDelay: `${baseDelay}ms`,
      animationDuration: `${duration}ms`,
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
    };

    const color = getColorForType(p.type);

    switch (p.type) {
      case "balloon":
        return (
          <span key={`balloon-${i}`} className="like-balloon" style={style} aria-hidden="true">
            <span
              style={{
                display: "block",
                width: "8px",
                height: "12px",
                borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
                background: color,
                transformOrigin: "center bottom",
              }}
            />
            <span
              style={{
                display: "block",
                marginTop: "2px",
                width: "1px",
                height: "10px",
                background: "rgba(0,0,0,0.25)",
                transformOrigin: "top center",
                animation: `like-balloon-rise ${duration}ms ease-out ${baseDelay}ms both`,
                transform: "translateX(-50%)",
              }}
            />
          </span>
        );
      case "confetti":
        return (
          <span key={`confetti-${i}`} className="like-confetti" style={style} aria-hidden="true">
            <span
              style={{
                display: "block",
                width: "6px",
                height: "3px",
                borderRadius: "1px",
                background: color,
                transformOrigin: "center",
              }}
            />
          </span>
        );
      case "heart":
        return (
          <span key={`heart-${i}`} className="like-heart" style={style} aria-hidden="true">
            <svg width="10" height="10" viewBox="0 0 24 24" fill={color} style={{ transform: "scale(0.45)" }}>
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8Z" />
            </svg>
          </span>
        );
      case "sparkle":
        return (
          <span key={`sparkle-${i}`} className="like-sparkle" style={style} aria-hidden="true">
            <svg width="8" height="8" viewBox="0 0 24 24" fill={color} style={{ transform: "scale(0.35)" }}>
              <path d="M12 2l1 4 4 1-1 4 1 4-4 1-4-1 1-4-1-4 4-1 1 4Z" />
            </svg>
          </span>
        );
    }
  });

  return (
    <div
      ref={containerRef}
      className="safecrib-burst"
      style={{
        left: "0",
        top: "0",
        width: "1px",
        height: "1px",
      }}
      aria-hidden="true"
    >
      {particles}
    </div>
  );
}

export function LikeButton({
  listingId,
  initialLikeCount,
  initialIsLiked,
  onLike,
  size = "md",
  showLabel = true,
}: LikeButtonProps) {
  const { notifyError } = useNotify();
  const [countKey, setCountKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [burstId, setBurstId] = useState<string | null>(null);
  const [prevLiked, setPrevLiked] = useState(initialIsLiked);
  const [prevCount, setPrevCount] = useState(initialLikeCount);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef(false);
  const ringRef = useRef(false);

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
    onError: (error) => {
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
    if (!reducedMotion && prevLiked !== isLiked) {
      if (!prevLiked && isLiked) {
        if (areEffectsEnabled() && canFire(`like:${listingId}`)) {
          const id = acquire(`like:${listingId}`);
          if (id) {
            setBurstId(id);
          }
        }
        if (likeCount > prevCount) {
          popRef.current = true;
          ringRef.current = true;
          buttonRef.current?.classList.add("like-pop", "like-ring");
          setTimeout(() => {
            buttonRef.current?.classList.remove("like-pop", "like-ring");
            popRef.current = false;
            ringRef.current = false;
          }, 400);
        }
      }
      setPrevLiked(isLiked);
      setPrevCount(likeCount);
    }
  }, [isLiked, likeCount, reducedMotion, listingId, prevLiked, prevCount]);

  const handleClick = useCallback(() => {
    if (likeStatus === "pending") return;
    if (!prevLiked && !isLiked) {
      if (areEffectsEnabled() && canFire(`like:${listingId}`)) {
        const id = acquire(`like:${listingId}`);
        if (id) {
          setBurstId(id);
        }
      }
      if (!reducedMotion) {
        popRef.current = true;
        ringRef.current = true;
        buttonRef.current?.classList.add("like-pop", "like-ring");
        setTimeout(() => {
          buttonRef.current?.classList.remove("like-pop", "like-ring");
          popRef.current = false;
          ringRef.current = false;
        }, 400);
      }
    }
    toggle();
  }, [likeStatus, prevLiked, isLiked, listingId, toggle, reducedMotion]);

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

  const burstPortal = burstId && buttonRef.current ? createPortal(
    <LikeBurst burstId={burstId} buttonRef={buttonRef} />,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        disabled={likeStatus === "pending"}
        aria-pressed={isLiked}
        aria-label={isLiked ? "Unlike" : "Like"}
        data-listing-id={listingId}
        className={`inline-flex min-w-0 max-w-full items-center justify-center ${buttonSize} rounded-full transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 ${isLiked ? "text-red-500" : "text-black/50"}`}
      >
        <span className="relative inline-flex items-center justify-center" aria-hidden="true">
          <Icon
            name={isLiked ? "heart" : "heart"}
            className={`${iconSize} shrink-0 ${isLiked ? "fill-current" : ""} transition-colors duration-200`}
          />
        </span>
        {showLabel && (
          <span
            key={countKey}
            className={`count-roll min-w-0 truncate tabular-nums ${popRef.current ? "like-count-pop" : ""}`}
            style={{
              animationDuration: "150ms",
              animationFillMode: "both",
              animationTimingFunction: "ease-out",
              minWidth: "1.5rem",
            }}
          >
            {likeCount.toLocaleString()}
          </span>
        )}
      </button>
      {burstPortal}
    </>
  );
}