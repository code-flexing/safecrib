"use client";

/**
 * HoldTimer — live countdown to a booking hold expiry.
 *
 * This is an honest reflection of the backend hold-expiry job, not fake
 * urgency. The timer ticks in real time; when it hits zero, the parent
 * component is notified so it can update the booking state.
 *
 * Design: no color-based urgency (no accent colors). Urgency is expressed
 * through typographic weight as the deadline approaches.
 */

import { useEffect, useState } from "react";
import { ClockIcon } from "lucide-react";

interface HoldTimerProps {
  /** ISO 8601 string — the hold expiry timestamp from the backend. */
  expiresAt: string;
  /** Called when the timer reaches zero. */
  onExpired?: () => void;
  className?: string;
}

function computeRemaining(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return null;
  const totalSeconds = Math.floor(diff / 1000);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds, totalSeconds };
}

export function HoldTimer({ expiresAt, onExpired, className = "" }: HoldTimerProps) {
  const [remaining, setRemaining] = useState(() => computeRemaining(expiresAt));
  const [expired, setExpired]     = useState(false);

  useEffect(() => {
    const tick = () => {
      const r = computeRemaining(expiresAt);
      if (!r) {
        setExpired(true);
        setRemaining(null);
        onExpired?.();
      } else {
        setRemaining(r);
      }
    };

    tick(); // run immediately
    const id = setInterval(tick, 1_000);
    return () => clearInterval(id);
  }, [expiresAt, onExpired]);

  if (expired || !remaining) {
    return (
      <span
        className={`inline-flex items-center gap-2 text-sm font-body text-muted ${className}`}
        role="status"
      >
        <ClockIcon size={14} aria-hidden />
        Hold expired
      </span>
    );
  }

  const { hours, minutes, seconds, totalSeconds } = remaining;
  const isUrgent = totalSeconds < 3600; // under 1 hour → heavier weight
  const isCritical = totalSeconds < 600; // under 10 min

  const pad = (n: number) => String(n).padStart(2, "0");
  const display = hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;

  const label = hours > 0
    ? `Hold expires in ${hours}h ${minutes}m`
    : `Hold expires in ${minutes}m ${seconds}s`;

  return (
    <span
      className={`inline-flex items-center gap-2 font-body ${className} ${
        isCritical ? "font-bold text-ink" : isUrgent ? "font-medium text-ink" : "text-muted"
      }`}
      role="timer"
      aria-label={label}
      aria-live="polite"
    >
      <ClockIcon size={14} aria-hidden />
      <span className={`font-mono text-sm ${isCritical ? "text-ink" : ""}`}>
        {display}
      </span>
      <span className="text-xs text-muted">remaining</span>
    </span>
  );
}
