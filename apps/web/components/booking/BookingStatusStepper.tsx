"use client";

/**
 * BookingStatusStepper — shows where a booking is in the state machine.
 *
 * States in order: HELD → CONFIRMED → COMPLETED
 * Branches: CANCELLED and DISPUTED are terminal states shown separately.
 *
 * Design: purely typographic/weight, no colour. Completed steps solid ink,
 * pending steps outlined, cancelled/disputed carry their own prose labels.
 */

import type { BookingStatus } from "@/lib/api/bookings";

interface BookingStatusStepperProps {
  status: BookingStatus;
  className?: string;
}

const ORDERED_STEPS: Array<{ key: BookingStatus; label: string }> = [
  { key: "HELD",      label: "Hold placed" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "COMPLETED", label: "Completed" },
];

const STATUS_ORDER: Record<BookingStatus, number> = {
  HELD:      0,
  CONFIRMED: 1,
  COMPLETED: 2,
  CANCELLED: -1,
  DISPUTED:  -1,
};

export function BookingStatusStepper({
  status,
  className = "",
}: BookingStatusStepperProps) {
  const currentIndex = STATUS_ORDER[status];

  // Terminal branch states — shown as a banner, not a stepper
  if (status === "CANCELLED") {
    return (
      <div className={`banner-info ${className}`}>
        <span className="font-medium">Booking cancelled.</span>
        <span className="ml-1">The hold has been released and no deposit was charged.</span>
      </div>
    );
  }

  if (status === "DISPUTED") {
    return (
      <div className={`banner-warning ${className}`}>
        <span className="font-medium">Dispute raised.</span>
        <span className="ml-1">Our team is reviewing this booking. We&apos;ll be in touch within 24 hours.</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-0 ${className}`} role="list" aria-label="Booking progress">
      {ORDERED_STEPS.map((step, i) => {
        const isDone    = currentIndex >= i;
        const isCurrent = currentIndex === i;

        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none" role="listitem">
            {/* Step indicator */}
            <div className="flex flex-col items-center">
              <div
                className={`w-6 h-6 flex items-center justify-center text-xs font-bold border transition-colors ${
                  isDone
                    ? "bg-ink text-paper border-ink"
                    : "bg-paper text-muted border-[#D4D4D4]"
                }`}
                aria-current={isCurrent ? "step" : undefined}
              >
                {isDone && currentIndex > i ? (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
                    <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
                  </svg>
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span
                className={`text-[10px] mt-1.5 font-body whitespace-nowrap ${
                  isDone ? "text-ink font-medium" : "text-muted"
                }`}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {i < ORDERED_STEPS.length - 1 && (
              <div
                className={`flex-1 h-px mx-2 mb-5 transition-colors ${
                  currentIndex > i ? "bg-ink" : "bg-[#E5E5E5]"
                }`}
                aria-hidden
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
