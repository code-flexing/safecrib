"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";

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
  const [recommendationCount, setRecommendationCount] = useState(initialRecommendationCount);
  const [isRecommended, setIsRecommended] = useState(initialIsRecommended);
  const [isRecommending, setIsRecommending] = useState(false);
  const [flashAnimation, setFlashAnimation] = useState(false);
  const [shakeAnimation, setShakeAnimation] = useState(false);
  const [glowAnimation, setGlowAnimation] = useState(false);
  const [sparkAnimations, setSparkAnimations] = useState<Array<{ id: number; tx: number; ty: number }>>([]);
  const [countKey, setCountKey] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    setRecommendationCount(initialRecommendationCount);
    setIsRecommended(initialIsRecommended);
  }, [initialRecommendationCount, initialIsRecommended]);

  const handleRecommend = useCallback(async () => {
    if (isRecommending || disabled) return;
    setIsRecommending(true);
    const nextRecommended = !isRecommended;
    const nextCount = isRecommended ? Math.max(0, recommendationCount - 1) : recommendationCount + 1;
    setIsRecommended(nextRecommended);
    setRecommendationCount(nextCount);
    setCountKey((k) => k + 1);

    if (!reducedMotion && nextRecommended) {
      setFlashAnimation(true);
      setShakeAnimation(true);
      setGlowAnimation(true);
      const sparks = [
        { id: Date.now(), tx: -12, ty: -8 },
        { id: Date.now() + 1, tx: 12, ty: -10 },
        { id: Date.now() + 2, tx: 0, ty: -14 },
      ];
      setSparkAnimations(sparks);
      setTimeout(() => setFlashAnimation(false), 400);
      setTimeout(() => setShakeAnimation(false), 400);
      setTimeout(() => setGlowAnimation(false), 500);
      setTimeout(() => setSparkAnimations([]), 500);
    }

    try {
      await onRecommend(providerId, nextRecommended);
    } catch {
      setIsRecommended(!nextRecommended);
      setRecommendationCount(isRecommended ? recommendationCount + 1 : Math.max(0, recommendationCount - 1));
      setCountKey((k) => k + 1);
    } finally {
      setIsRecommending(false);
    }
  }, [providerId, isRecommending, isRecommended, recommendationCount, onRecommend, disabled, reducedMotion]);

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

  return (
    <button
      type="button"
      onClick={handleRecommend}
      disabled={isRecommending || disabled}
      aria-pressed={isRecommended}
      aria-label={isRecommended ? "Remove recommendation" : "Recommend provider"}
      title={disabled && !isStudent ? tooltip : undefined}
      className={`inline-flex min-w-0 max-w-full items-center justify-center ${buttonSize} rounded-full transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50 ${isRecommended ? "text-blue-500" : "text-black/50"}`}
    >
      <span
        className={`relative inline-flex items-center justify-center ${flashAnimation ? "recommend-flash" : ""} ${shakeAnimation ? "recommend-shake" : ""}`}
        style={{
          animationDuration: flashAnimation ? "400ms" : shakeAnimation ? "400ms" : undefined,
          animationFillMode: "both",
          animationTimingFunction: flashAnimation ? "ease-in-out" : shakeAnimation ? "ease-in-out" : undefined,
        }}
      >
        <span className="relative" aria-hidden="true">
          {glowAnimation && !reducedMotion && (
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
          {sparkAnimations.map((spark) => (
            <span
              key={spark.id}
              className="absolute recommend-spark"
              style={{
                animationDuration: "500ms",
                animationFillMode: "both",
                animationTimingFunction: "ease-out",
                pointerEvents: "none",
                width: "4px",
                height: "4px",
                borderRadius: "50%",
                background: "#3b82f6",
                boxShadow: "0 0 6px #3b82f6",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                "--tx": `${spark.tx}px`,
                "--ty": `${spark.ty}px`,
              } as React.CSSProperties}
            />
          ))}
          <Icon
            name="zap"
            className={`${iconSize} shrink-0 ${isRecommended ? "fill-current" : ""} transition-colors duration-200`}
          />
        </span>
      </span>
      {showLabel && (
        <span
          key={countKey}
          className="count-roll min-w-0 truncate"
          style={{ animationDuration: "150ms", animationFillMode: "both", animationTimingFunction: "ease-out" }}
        >
          {recommendationCount.toLocaleString()}
        </span>
      )}
    </button>
  );
}