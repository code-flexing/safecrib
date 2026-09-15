"use client";

/**
 * /student/dashboard — Student's home screen.
 *
 * Two sections:
 *   1. Active holds/bookings — any booking in HELD or CONFIRMED state.
 *      HoldTimer shown prominently on HELD bookings.
 *   2. Recent/completed bookings.
 *
 * "Saved listings" is a v2 feature (no savedListings API yet) — omitted
 * rather than filled with placeholder UI.
 */

import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { MapPinIcon, ArrowRightIcon } from "lucide-react";
import { bookingsApi, type Booking } from "@/lib/api/bookings";
import { useAuth } from "@/lib/auth/useAuth";
import { HoldTimer } from "@/components/booking/HoldTimer";
import { BookingStatusStepper } from "@/components/booking/BookingStatusStepper";
import { TrustBadge } from "@/components/trust/TrustBadge";

export default function StudentDashboardPage() {
  const { user } = useAuth();

  const { data: bookings, isLoading, isError, refetch } = useQuery({
    queryKey: ["bookings"],
    queryFn:  () => bookingsApi.list().then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000, // keep hold timers in sync
  });

  const active    = (bookings ?? []).filter((b) => b.status === "HELD" || b.status === "CONFIRMED");
  const past      = (bookings ?? []).filter((b) => b.status === "COMPLETED" || b.status === "CANCELLED" || b.status === "DISPUTED");

  return (
    <div className="px-6 py-8 max-w-3xl">
      {/* Greeting */}
      <h1 className="font-display text-display-md text-ink mb-1">
        {user?.displayName ? `Hello, ${user.displayName.split(" ")[0]}.` : "Your bookings."}
      </h1>
      <p className="text-sm text-muted font-body mb-10">
        All your holds and bookings in one place.
      </p>

      {isError && (
        <div className="banner-error mb-6">
          Failed to load bookings.{" "}
          <button onClick={() => refetch()} className="underline">
            Try again
          </button>
        </div>
      )}

      {/* ── Active / pending section ──────────────────────────── */}
      <section className="mb-12">
        <h2 className="font-display text-lg font-bold text-ink mb-5">Active</h2>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <BookingCardSkeleton key={i} />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="py-10 border-t border-[#E5E5E5] text-center">
            <p className="text-sm text-muted font-body mb-4">
              No active holds or bookings.
            </p>
            <Link href="/listings" className="btn-primary text-sm">
              Browse verified listings
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {active.map((booking) => (
              <BookingCard key={booking.id} booking={booking} onHoldExpired={() => refetch()} />
            ))}
          </div>
        )}
      </section>

      {/* ── Past bookings ─────────────────────────────────────── */}
      {!isLoading && past.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-bold text-ink mb-5">Past</h2>
          <div className="space-y-4">
            {past.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── Booking card ───────────────────────────────────────────────────────────

function BookingCard({
  booking,
  onHoldExpired,
}: {
  booking: Booking;
  onHoldExpired?: () => void;
}) {
  const photo = booking.listing.photos?.[0]?.url;

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex gap-0">
        {/* Thumbnail */}
        {photo && (
          <div className="relative w-24 sm:w-32 shrink-0">
            <Image
              src={photo}
              alt={booking.listing.title}
              fill
              sizes="128px"
              className="object-cover"
              loading="lazy"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-ink truncate">
                {booking.listing.title}
              </h3>
              <p className="flex items-center gap-1 text-xs text-muted mt-0.5 font-body">
                <MapPinIcon size={10} aria-hidden />
                <span className="truncate">{booking.listing.address}</span>
              </p>
            </div>
            <span className={`status-pill status-${booking.status.toLowerCase()} shrink-0`}>
              {booking.status}
            </span>
          </div>

          {/* Hold timer — only for HELD status */}
          {booking.status === "HELD" && booking.holdExpiresAt && (
            <div className="mb-3">
              <HoldTimer
                expiresAt={booking.holdExpiresAt}
                onExpired={onHoldExpired}
              />
            </div>
          )}

          {/* Agent trust badge */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-muted font-body">Agent:</span>
            <span className="text-xs font-medium text-ink">
              {booking.listing.owner.displayName ?? "Agent"}
            </span>
            <TrustBadge
              score={booking.listing.owner.trustScore}
              identityVerified={false}
              size="sm"
              showLabel={false}
            />
          </div>

          {/* Deposit */}
          <p className="text-xs text-muted font-body mb-3">
            Deposit: <span className="text-ink font-medium">£{booking.depositAmount.toLocaleString()}</span>
          </p>

          {/* Action link */}
          <Link
            href={`/student/bookings/${booking.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink hover:underline font-body"
          >
            View details
            <ArrowRightIcon size={11} aria-hidden />
          </Link>
        </div>
      </div>

      {/* Status stepper — shown for non-terminal bookings */}
      {booking.status !== "CANCELLED" && (
        <div className="border-t border-[#E5E5E5] px-4 py-3">
          <BookingStatusStepper status={booking.status} />
        </div>
      )}
    </div>
  );
}

function BookingCardSkeleton() {
  return (
    <div className="card p-4 flex gap-4">
      <div className="skeleton w-24 h-20 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-3 w-1/2" />
        <div className="skeleton h-3 w-1/3" />
      </div>
    </div>
  );
}
