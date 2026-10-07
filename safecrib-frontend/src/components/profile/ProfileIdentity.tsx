"use client";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import type { ProfileVM } from "./types";

export function ProfileIdentity({ p, accentColor }: { p: ProfileVM; accentColor?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="px-4 pt-2">
      <h1 className="flex items-center gap-1 text-xl font-bold text-safecrib-black">
        {p.displayName}
        {p.verified && (
          <span className="flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700" aria-label="Verified">
            <Icon name="check-circle" className="h-3 w-3" />
            <span>Verified</span>
          </span>
        )}
      </h1>
      <p className="text-sm text-black/45">@{p.username}</p>

      {p.affiliation && (
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-black/45">
          {p.affiliation}
        </p>
      )}

      {p.badgeLabel && (
        <span
          className="mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold text-black/70"
          style={{
            backgroundColor: accentColor
              ? `color-mix(in oklab, ${accentColor} 15%, transparent)`
              : "rgba(0,0,0,0.02)",
          }}
        >
          {p.badgeLabel}
        </span>
      )}

      {p.bio && (
        <div className="mt-3 text-sm text-safecrib-black">
          <p className={expanded ? "" : "line-clamp-3"}>
            {p.bio}
          </p>
          {p.bio.length > 140 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="mt-1 text-sm font-medium text-safecrib-green hover:underline"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}