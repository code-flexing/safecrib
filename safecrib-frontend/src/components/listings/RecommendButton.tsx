"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { useOptimisticToggle } from "@/lib/optimistic";
import { useNotify } from "@/components/ui/Toast";
import { resolveNotificationKey, getNotificationMessage } from "@/lib/toast-messages";
import { acquire, release, canFire } from "@/lib/burst-registry";
import { areEffectsEnabled } from "@/lib/effects-enabled";

type RecommendButtonProps = {
  providerId: string;
  initialRecommendationCount: number;
  initialIsRecommended: boolean;
  onRecommend: (providerId: string, recommended: boolean) => Promise<void>;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  role?: string;
};

const LIGHTNING_BOLTS = [
  { points: "0,0 -4,-10 -2,-10 -6,-20 6,0 2,10 6,10 0,0", delay: 0, dur: 300 },
  { points: "0,0 5,-8 3,-8 7,-18 -5,0 -3,8 -7,8 0,0", delay: 60, dur: 350 },
  { points: "0,0 -3,-12 -1,-12 -5,-22 4,0 1,12 5,12 0,0", delay: 120, dur: 320 },
];

const SPARK_OFFSETS = [
  { dx: -18, dy: -14, delay: 20, dur: 300 },
  { dx: 20, dy: -12, delay: 50, dur: 320 },
  { dx: -12, dy: 16, delay: 80, dur: 280 },
  { dx: 16, dy: 14, delay: 110, dur: 310 },
  { dx: 0, dy: -22, delay: 140, dur: 350 },
];

function RecommendBurst({
  burstId,
  buttonRef,
  isDark,
}: {
  burstId: string;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
  isDark: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let settled = false;
    const handleAnimationEnd = (e: AnimationEvent) => {
      if (settled) return;
      if (
        e.animationName === "lightning-flicker" ||
        e.animationName === "recommend-spark-fly" ||
        e.animationName === "recommend-glow-pulse"
      ) {
        settled = true;
        release(`recommend:${buttonRef.current?.dataset.providerId ?? ""}`, burstId);
        const timeout = setTimeout(() => {
          if (container) {
            container.remove();
          }
        }, 700);
        return () => clearTimeout(timeout);
      }
    };
    container.addEventListener("animationend", handleAnimationEnd);
    return () => container.removeEventListener("animationend", handleAnimationEnd);
  }, [burstId, buttonRef]);

  const boltColor = isDark ? "#06b6d4" : "#0891b2"; // cyan for dark, deeper blue for light
  const boltCoreColor = "#ffffff";
  const sparkColor = isDark ? "#22d3ee" : "#06b6d4";
  const glowColor = isDark ? "rgba(6, 182, 212, 0.6)" : "rgba(8, 145, 178, 0.5)";

  const bolts = LIGHTNING_BOLTS.map((bolt, i) => (
    <svg
      key={`bolt-${i}`}
      width="40"
      height="40"
      viewBox="-20 -20 40 40"
      className="lightning-bolt"
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        animationDelay: `${bolt.delay}ms`,
        animationDuration: `${bolt.dur}ms`,
      }}
      aria-hidden="true"
    >
      <polyline
        points={bolt.points}
        fill="none"
        stroke={boltColor}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="drop-shadow(0 0 2px rgba(255,255,255,0.8))"
      />
      <polyline
        points={bolt.points}
        fill="none"
        stroke={boltCoreColor}
        strokeWidth="0.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
    </svg>
  ));

  const sparks = SPARK_OFFSETS.map((spark, i) => (
    <span
      key={`spark-${i}`}
      className="recommend-spark-fly"
      style={({
        position: "absolute",
        left: "50%",
        top: "50%",
        width: "3px",
        height: "3px",
        borderRadius: "50%",
        background: sparkColor,
        boxShadow: `0 0 4px ${sparkColor}`,
        transform: "translate(-50%, -50%)",
        "--dx": `${spark.dx}px`,
        "--dy": `${spark.dy}px`,
        animationDelay: `${spark.delay}ms`,
        animationDuration: `${spark.dur}ms`,
      } as React.CSSProperties & Record<string, string>)}
      aria-hidden="true"
    />
  ));

  const glow = (
    <span
      className="recommend-glow-pulse"
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: "48px",
        height: "48px",
        borderRadius: "50%",
        background: `radial-gradient(circle at center, ${glowColor} 0%, transparent 70%)`,
        transform: "translate(-50%, -50%) scale(0.6)",
        animationDuration: "400ms",
        animationFillMode: "both",
        animationTimingFunction: "ease-out",
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  );

  const borderRing = (
    <span
      style={{
        position: "absolute",
        inset: "-3px",
        borderRadius: "9999px",
        border: `2px solid ${isDark ? "#22d3ee" : "#0891b2"}`,
        opacity: 0,
        animation: "recommend-glow-pulse 400ms ease-out both",
        pointerEvents: "none",
      }}
      aria-hidden="true"
    />
  );

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
      {glow}
      {borderRing}
      {bolts}
      {sparks}
    </div>
  );
}

export function RecommendButton({
  providerId,
  initialRecommendationCount,
  initialIsRecommended,
  onRecommend,
  disabled = false,
  size = "md",
  showLabel = true,
  role,
}: RecommendButtonProps) {
  const { notifyError } = useNotify();
  const [flashAnimation, setFlashAnimation] = useState(false);
  const [pulseAnimation, setPulseAnimation] = useState(false);
  const [countKey, setCountKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [burstId, setBurstId] = useState<string | null>(null);
  const [prevRecommended, setPrevRecommended] = useState(initialIsRecommended);
  const [prevCount, setPrevCount] = useState(initialRecommendationCount);
  const [countPop, setCountPop] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const { value: recState, state: recStatus, toggle } = useOptimisticToggle({
    key: `recommend:${providerId}`,
    initialValue: { count: initialRecommendationCount, recommended: initialIsRecommended },
    getNextValue: (current) => ({
      count: current.recommended ? Math.max(0, current.count - 1) : current.count + 1,
      recommended: !current.recommended,
    }),
    onToggle: async (next) => {
      await onRecommend(providerId, next.recommended);
    },
    onError: (error) => {
      const { key } = resolveNotificationKey(error, "recommend");
      const { message, action } = getNotificationMessage(key);
      notifyError(message, { action: action ? { label: action.label, onClick: () => toggle() } : undefined });
    },
    onSuccess: () => {
      setCountKey((k) => k + 1);
    },
    equals: (a, b) => a.count === b.count && a.recommended === b.recommended,
  });

  const { count: recommendationCount, recommended: isRecommended } = recState;

  useEffect(() => {
    if (recStatus === "pending" && isRecommended && !reducedMotion) {
      setFlashAnimation(true);
      setPulseAnimation(true);
      setTimeout(() => setFlashAnimation(false), 400);
      setTimeout(() => setPulseAnimation(false), 500);
    }
  }, [recStatus, isRecommended, reducedMotion]);

  useEffect(() => {
    if (!reducedMotion && prevRecommended !== isRecommended) {
      if (!prevRecommended && isRecommended) {
        if (areEffectsEnabled() && canFire(`recommend:${providerId}`)) {
          const id = acquire(`recommend:${providerId}`);
          if (id) {
            setBurstId(id);
          }
        }
        if (recommendationCount > prevCount) {
          setCountPop(true);
          setTimeout(() => setCountPop(false), 200);
        }
      }
      setPrevRecommended(isRecommended);
      setPrevCount(recommendationCount);
    }
  }, [isRecommended, recommendationCount, reducedMotion, providerId, prevRecommended, prevCount]);

  const handleClick = useCallback(() => {
    if (recStatus === "pending" || disabled) return;
    if (!prevRecommended && !isRecommended) {
      if (areEffectsEnabled() && canFire(`recommend:${providerId}`)) {
        const id = acquire(`recommend:${providerId}`);
        if (id) {
          setBurstId(id);
        }
      }
    }
    toggle();
  }, [recStatus, disabled, prevRecommended, isRecommended, providerId, toggle]);

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

  const isStudent = role === "STUDENT";
  const tooltip = isStudent
    ? "Recommend this provider to students"
    : "Student accounts can recommend providers";

  const isDark = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark";
  const isDim = typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dim";

  const burstPortal = burstId && buttonRef.current ? createPortal(
    <RecommendBurst burstId={burstId} buttonRef={buttonRef} isDark={isDark || isDim} />,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        disabled={recStatus === "pending" || disabled}
        aria-pressed={isRecommended}
        aria-label={isRecommended ? "Remove recommendation" : "Recommend provider"}
        title={disabled && !isStudent ? tooltip : undefined}
        data-provider-id={providerId}
        className={`inline-flex min-w-0 max-w-full items-center justify-center ${buttonSize} rounded-full transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 ${isRecommended ? "text-blue-500" : "text-black/50"}`}
      >
        <span
          className={`relative inline-flex items-center justify-center ${flashAnimation ? "recommend-flash" : ""} ${pulseAnimation ? "recommend-pulse" : ""}`}
          style={{
            animationDuration: flashAnimation ? "100ms" : pulseAnimation ? "400ms" : undefined,
            animationFillMode: "both",
            animationTimingFunction: flashAnimation ? "ease-in-out" : pulseAnimation ? "ease-out" : undefined,
          }}
        >
          <span className="relative" aria-hidden="true">
            {pulseAnimation && !reducedMotion && (
              <span
                className="absolute inset-0 rounded-full recommend-glow"
                style={{
                  animationDuration: "500ms",
                  animationFillMode: "both",
                  animationTimingFunction: "ease-out",
                  border: "2px solid #3b82f6",
                  pointerEvents: "none",
                  borderRadius: "9999px",
                }}
              />
            )}
            <Icon
              name="zap"
              className={`${iconSize} shrink-0 ${isRecommended ? "fill-current" : ""} transition-colors duration-200`}
            />
          </span>
        </span>
        {showLabel && (
          <span
            key={countKey}
            className={`count-roll min-w-0 truncate tabular-nums ${countPop ? "like-count-pop" : ""}`}
            style={{
              animationDuration: "150ms",
              animationFillMode: "both",
              animationTimingFunction: "ease-out",
              minWidth: "1.5rem",
            }}
          >
            {recommendationCount.toLocaleString()}
          </span>
        )}
      </button>
      {burstPortal}
    </>
  );
}