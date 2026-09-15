"use client";

/**
 * TrustBadge — compact trust signal, used on listing cards, agent profiles,
 * and in the booking flow.
 *
 * Design rule: verified = solid black fill, unverified/pending = outline only.
 * No color. Trust is carried by weight and fill state, not hue.
 */

import { CheckIcon, ShieldCheckIcon, ShieldIcon } from "lucide-react";
import type { TrustScore } from "@/lib/api/trust";

// ── Props ──────────────────────────────────────────────────────────────────

interface TrustBadgeProps {
  /** Trust score 0–100. If undefined, renders a skeleton. */
  score?: number | null;
  /** Whether the user's identity has been verified by an admin. */
  identityVerified?: boolean;
  /** Whether the user's email has been verified. */
  emailVerified?: boolean;
  /** Display variant */
  size?: "sm" | "md" | "lg";
  /** If true, shows both score number and verified mark; false = score only */
  showLabel?: boolean;
  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function TrustBadge({
  score,
  identityVerified = false,
  emailVerified = false,
  size = "md",
  showLabel = true,
  className = "",
}: TrustBadgeProps) {
  // Loading skeleton
  if (score === undefined) {
    return (
      <span
        className={`skeleton inline-block ${sizeClasses[size].skeleton} ${className}`}
        aria-label="Loading trust score"
      />
    );
  }

  const verified = identityVerified;
  const badgeClass = verified ? "trust-badge-verified" : "trust-badge-unverified";
  const Icon = verified ? ShieldCheckIcon : ShieldIcon;
  const label = verified ? "Verified" : emailVerified ? "Email verified" : "Unverified";
  const scoreDisplay = score !== null ? Math.round(score) : "—";

  const iconSize = size === "sm" ? 10 : size === "lg" ? 14 : 12;

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {/* Score chip */}
      <span
        className={`${badgeClass} ${sizeClasses[size].chip} font-display font-bold`}
        aria-label={`Trust score: ${scoreDisplay}`}
      >
        {scoreDisplay}
      </span>

      {/* Verified badge */}
      {showLabel && (
        <span
          className={`${badgeClass} ${sizeClasses[size].badge} gap-1`}
          aria-label={label}
        >
          <Icon size={iconSize} strokeWidth={2.5} aria-hidden />
          {label}
        </span>
      )}
    </span>
  );
}

// ── Size map ───────────────────────────────────────────────────────────────

const sizeClasses = {
  sm: {
    chip:    "text-[10px] px-1.5 py-0.5",
    badge:   "text-[10px] px-1.5 py-0.5",
    skeleton: "h-4 w-16",
  },
  md: {
    chip:    "text-xs px-2 py-0.5",
    badge:   "text-[11px] px-2 py-0.5",
    skeleton: "h-5 w-24",
  },
  lg: {
    chip:    "text-sm px-2.5 py-1",
    badge:   "text-xs px-2.5 py-1",
    skeleton: "h-6 w-32",
  },
};

// ── Convenience: from TrustScore object ───────────────────────────────────

export function TrustBadgeFromScore({
  trustScore,
  size,
  showLabel,
  className,
}: {
  trustScore: TrustScore;
  size?: TrustBadgeProps["size"];
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <TrustBadge
      score={trustScore.score}
      identityVerified={trustScore.identityVerified}
      emailVerified={trustScore.emailVerified}
      size={size}
      showLabel={showLabel}
      className={className}
    />
  );
}
