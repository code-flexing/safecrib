"use client";

/**
 * /student/bookings/[id] — Full booking detail with confirm/cancel actions.
 *
 * The trust signal for the agent is shown immediately above any confirm CTA
 * so the student sees it at the moment of committing the deposit.
 *
 * State machine actions available per status:
 *   HELD      → Confirm (commit deposit) | Cancel (release hold)
 *   CONFIRMED → Dispute | Complete
 *   COMPLETED → (no actions, review prompt)
 *   CANCELLED → (read-only)
 *   DISPUTED  → (read-only, admin in progress)
 */

import { use, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, MapPinIcon, CalendarIcon, UserCircleIcon } from "lucide-react";
import { bookingsApi } from "@/lib/api/bookings";
import { trustApi } from "@/lib/api/trust";
import { HoldTimer } from "@/components/booking/HoldTimer";
import { BookingStatusStepper } from "@/components/booking/BookingStatusStepper";
import { TrustBreakdown, TrustBreakdownSkeleton } from "@/components/trust/TrustBreakdown";
import { TrustBadge } from "@/components/trust/TrustBadge";

export default function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const { data: booking, isLoading, isError, refetch } = useQuery({
    queryKey: ["booking", id],
    queryFn:  () => bookingsApi.getById(id).then((r) => r.data),
    staleTime: 30_000,
  });

  const { data: agentTrust } = useQuery({
    queryKey: ["trust", booking?.listing.owner.id],
    queryFn: () =>
      booking ? trustApi.getScore(booking.listing.owner.id).then((r) => r.data) : null,
    enabled: !!booking?.listing.owner.id,
    staleTime: 60_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["booking", id] });
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
    queryClient.invalidateQueries({ queryKey: ["listing", booking?.listingId] });
  };

  if (isLoading) return <BookingDetailSkeleton />;

  if (isError || !booking) {
    return (
      <div className="px-6 py-8 text-center">
        <p className="font-display text-display-md text-ink mb-3">Booking not found</p>
        <Link href="/student/dashboard" className="btn-secondary text-sm">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const photo = booking.listing.photos?.[0]?.url;
  const createdAt = new Date(booking.createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="px-6 py-8 max-w-2xl">
      {/* Back */}
      <Link
        href="/student/dashboard"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink transition-colors mb-8 font-body"
      >
        <ArrowLeftIcon size={14} aria-hidden />
        Dashboard
      </Link>

      {/* Status stepper */}
      <div className="mb-8">
        <BookingStatusStepper status={booking.status} />
      </div>

      {/* Hold timer */}
      {booking.status === "HELD" && booking.holdExpiresAt && (
        <div className="card p-4 mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-ink">Your hold is active</p>
            <p className="text-xs text-muted font-body mt-0.5">
              Confirm before the timer runs out to secure this room.
            </p>
          </div>
          <HoldTimer
            expiresAt={booking.holdExpiresAt}
            onExpired={() => refetch()}
          />
        </div>
      )}

      {/* Listing summary */}
      <div className="card mb-6 overflow-hidden">
        {photo && (
          <div className="relative aspect-[16/6] overflow-hidden">
            <Image
              src={photo}
              alt={booking.listing.title}
              fill
              sizes="(max-width: 768px) 100vw, 672px"
              className="object-cover"
              loading="lazy"
            />
          </div>
        )}
        <div className="p-5">
          <h1 className="font-display text-xl font-bold text-ink mb-2">
            {booking.listing.title}
          </h1>
          <div className="flex flex-wrap gap-4 text-xs text-muted font-body">
            <span className="flex items-center gap-1">
              <MapPinIcon size={11} aria-hidden />
              {booking.listing.address}
            </span>
            <span className="font-body">
              £{booking.listing.price.toLocaleString()}/mo
            </span>
          </div>
        </div>
      </div>

      {/* Booking details */}
      <div className="card p-5 mb-6 space-y-3">
        <h2 className="font-display text-base font-bold text-ink mb-3">Booking details</h2>
        <Detail label="Booking ID" value={`#${booking.id.slice(0, 8).toUpperCase()}`} />
        <Detail label="Status"    value={booking.status} />
        <Detail label="Deposit"   value={`£${booking.depositAmount.toLocaleString()}`} />
        <Detail label="Placed"    value={createdAt} />
        {booking.moveInDate && (
          <Detail
            label="Move-in date"
            value={new Date(booking.moveInDate).toLocaleDateString("en-GB", {
              day: "numeric", month: "long", year: "numeric",
            })}
          />
        )}
      </div>

      {/* Agent trust — shown before any CTA */}
      <div className="mb-6">
        <h2 className="font-display text-base font-bold text-ink mb-3">Agent</h2>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 border border-[#E5E5E5] flex items-center justify-center text-muted">
            <UserCircleIcon size={18} aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">
              {booking.listing.owner.displayName ?? "Agent"}
            </p>
            <Link
              href={`/agents/${booking.listing.owner.id}`}
              className="text-xs text-muted hover:text-ink transition-colors font-body"
            >
              View profile →
            </Link>
          </div>
          <TrustBadge
            score={booking.listing.owner.trustScore}
            identityVerified={false}
            size="sm"
            showLabel
            className="ml-auto"
          />
        </div>
        {agentTrust ? (
          <TrustBreakdown score={agentTrust} alwaysExpanded />
        ) : (
          <TrustBreakdownSkeleton />
        )}
      </div>

      {/* Actions */}
      <ActionPanel
        booking={booking}
        onSuccess={invalidate}
      />
    </div>
  );
}

// ── Action panel ───────────────────────────────────────────────────────────

function ActionPanel({
  booking,
  onSuccess,
}: {
  booking: import("@/lib/api/bookings").Booking;
  onSuccess: () => void;
}) {
  const [disputeReason, setDisputeReason] = useState("");
  const [showDispute, setShowDispute]     = useState(false);
  const [error, setError]                 = useState<string | null>(null);

  const confirm = useMutation({
    mutationFn: () => bookingsApi.confirm(booking.id),
    onSuccess,
    onError: (e: Error) => setError(e.message || "Failed to confirm booking."),
  });

  const cancel = useMutation({
    mutationFn: () => bookingsApi.cancel(booking.id),
    onSuccess,
    onError: (e: Error) => setError(e.message || "Failed to cancel booking."),
  });

  const complete = useMutation({
    mutationFn: () => bookingsApi.complete(booking.id),
    onSuccess,
    onError: (e: Error) => setError(e.message || "Failed to mark as completed."),
  });

  const dispute = useMutation({
    mutationFn: () => bookingsApi.dispute(booking.id, disputeReason),
    onSuccess,
    onError: (e: Error) => setError(e.message || "Failed to raise dispute."),
  });

  if (booking.status === "CANCELLED" || booking.status === "COMPLETED" || booking.status === "DISPUTED") {
    return null;
  }

  return (
    <div className="card p-5">
      <h2 className="font-display text-base font-bold text-ink mb-4">Actions</h2>

      {error && <p className="field-error mb-4">{error}</p>}

      {booking.status === "HELD" && (
        <div className="space-y-3">
          <button
            onClick={() => { setError(null); confirm.mutate(); }}
            disabled={confirm.isPending}
            className="btn-primary w-full"
          >
            {confirm.isPending ? "Confirming…" : "Confirm booking — pay deposit"}
          </button>
          <button
            onClick={() => { setError(null); cancel.mutate(); }}
            disabled={cancel.isPending}
            className="btn-secondary w-full"
          >
            {cancel.isPending ? "Cancelling…" : "Cancel hold"}
          </button>
          <p className="text-xs text-muted font-body">
            Cancelling before confirming releases the hold with no charge.
          </p>
        </div>
      )}

      {booking.status === "CONFIRMED" && (
        <div className="space-y-3">
          <button
            onClick={() => { setError(null); complete.mutate(); }}
            disabled={complete.isPending}
            className="btn-primary w-full"
          >
            {complete.isPending ? "Marking complete…" : "Mark as completed"}
          </button>

          {!showDispute ? (
            <button
              onClick={() => setShowDispute(true)}
              className="btn-ghost w-full text-sm text-muted"
            >
              Raise a dispute
            </button>
          ) : (
            <div className="space-y-3 pt-2 border-t border-[#E5E5E5]">
              <label className="label" htmlFor="dispute-reason">
                Describe the issue
              </label>
              <textarea
                id="dispute-reason"
                className="input resize-none h-24 text-sm"
                placeholder="What went wrong? Be specific — this goes to our review team."
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setError(null);
                    if (!disputeReason.trim()) { setError("Please describe the issue."); return; }
                    dispute.mutate();
                  }}
                  disabled={dispute.isPending}
                  className="btn-primary text-sm flex-1"
                >
                  {dispute.isPending ? "Submitting…" : "Submit dispute"}
                </button>
                <button
                  onClick={() => { setShowDispute(false); setDisputeReason(""); }}
                  className="btn-ghost text-sm px-4"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Detail row ─────────────────────────────────────────────────────────────

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1 border-b border-[#F0F0F0] last:border-0">
      <span className="text-xs text-muted font-body">{label}</span>
      <span className="text-xs font-medium text-ink font-body">{value}</span>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function BookingDetailSkeleton() {
  return (
    <div className="px-6 py-8 max-w-2xl space-y-6">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton h-10 w-full" />
      <div className="skeleton aspect-[16/6] w-full" />
      <div className="skeleton h-40 w-full" />
    </div>
  );
}
