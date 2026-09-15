"use client";

/**
 * TrustBreakdown — expandable trust detail panel.
 *
 * Shows the numbers behind the score so it reads as earned data, not an
 * arbitrary algorithm: completed bookings, disputes, verified status, member
 * tenure. Avoids the bare-number problem.
 *
 * Can render in collapsed (TrustBadge + expand trigger) or expanded mode.
 */

import { useState } from "react";
import {
  ChevronDownIcon,
  ShieldCheckIcon,
  ShieldIcon,
  BookOpenIcon,
  AlertTriangleIcon,
  CalendarIcon,
  MailCheckIcon,
} from "lucide-react";
import { TrustBadge } from "./TrustBadge";
import type { TrustScore } from "@/lib/api/trust";

// ── Types ──────────────────────────────────────────────────────────────────

interface TrustBreakdownProps {
  score: TrustScore;
  /** If true, start expanded */
  defaultExpanded?: boolean;
  /** If true, can't be collapsed (e.g. in booking flow pre-confirm step) */
  alwaysExpanded?: boolean;
  className?: string;
}

// ── Component ──────────────────────────────────────────────────────────────

export function TrustBreakdown({
  score,
  defaultExpanded = false,
  alwaysExpanded = false,
  className = "",
}: TrustBreakdownProps) {
  const [expanded, setExpanded] = useState(defaultExpanded || alwaysExpanded);

  const memberSince = new Date(score.memberSince).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className={`card ${className}`}>
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => !alwaysExpanded && setExpanded((e) => !e)}
        className={`w-full flex items-center justify-between px-4 py-3 ${
          alwaysExpanded ? "cursor-default" : "hover:bg-[#FAFAFA] transition-colors"
        }`}
        aria-expanded={expanded}
        aria-controls="trust-breakdown-body"
      >
        <div className="flex items-center gap-3">
          <TrustBadge
            score={score.score}
            identityVerified={score.identityVerified}
            emailVerified={score.emailVerified}
            size="sm"
            showLabel={false}
          />
          <span className="text-sm font-medium text-ink">Trust score</span>
          <ScoreSummary score={score} />
        </div>

        {!alwaysExpanded && (
          <ChevronDownIcon
            size={16}
            className={`text-muted transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div
          id="trust-breakdown-body"
          className="border-t border-[#E5E5E5] px-4 py-4 space-y-3"
        >
          <BreakdownRow
            icon={<BookOpenIcon size={14} aria-hidden />}
            label="Completed bookings"
            value={String(score.completedBookings)}
            strong={score.completedBookings > 0}
          />
          <BreakdownRow
            icon={<AlertTriangleIcon size={14} aria-hidden />}
            label="Unresolved disputes"
            value={score.unresolvedDisputes === 0 ? "None" : String(score.unresolvedDisputes)}
            inverted={score.unresolvedDisputes > 0}
          />
          <BreakdownRow
            icon={
              score.identityVerified ? (
                <ShieldCheckIcon size={14} aria-hidden />
              ) : (
                <ShieldIcon size={14} aria-hidden />
              )
            }
            label="Identity verification"
            value={score.identityVerified ? "Verified" : "Not verified"}
            strong={score.identityVerified}
          />
          <BreakdownRow
            icon={<MailCheckIcon size={14} aria-hidden />}
            label="Email"
            value={score.emailVerified ? "Verified" : "Not verified"}
            strong={score.emailVerified}
          />
          <BreakdownRow
            icon={<CalendarIcon size={14} aria-hidden />}
            label="Member since"
            value={memberSince}
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

/**
 * One-line summary shown in the collapsed header:
 * "14 bookings · 0 disputes · ID verified"
 */
function ScoreSummary({ score }: { score: TrustScore }) {
  const parts: string[] = [];
  if (score.completedBookings > 0)
    parts.push(`${score.completedBookings} booking${score.completedBookings === 1 ? "" : "s"}`);
  if (score.unresolvedDisputes === 0) parts.push("0 disputes");
  if (score.identityVerified) parts.push("ID verified");

  if (parts.length === 0) return null;

  return (
    <span className="text-xs text-muted hidden sm:block">
      {parts.join(" · ")}
    </span>
  );
}

function BreakdownRow({
  icon,
  label,
  value,
  strong = false,
  inverted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  strong?: boolean;
  inverted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-2 text-sm text-muted">
        {icon}
        {label}
      </span>
      <span
        className={`text-sm font-medium ${
          inverted
            ? "text-[#B91C1C]"
            : strong
            ? "text-ink"
            : "text-muted"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

export function TrustBreakdownSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`card px-4 py-3 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="skeleton h-5 w-12" />
        <div className="skeleton h-4 w-20" />
        <div className="skeleton h-4 w-40 hidden sm:block" />
      </div>
    </div>
  );
}
