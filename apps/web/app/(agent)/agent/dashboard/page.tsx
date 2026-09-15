"use client";

/**
 * /agent/dashboard — Agent/landlord home screen.
 *
 * Two panels:
 *   1. My listings — with status, booking count, quick edit link.
 *   2. Booking requests — incoming holds and confirmed bookings across all listings.
 *
 * The agent's own trust score is shown in the header — agents who haven't
 * verified their identity will see a clear prompt to do so.
 */

import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import {
  PlusCircleIcon,
  PencilIcon,
  MapPinIcon,
  UsersIcon,
  ShieldIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { listingsApi, type Listing } from "@/lib/api/listings";
import { bookingsApi, type Booking } from "@/lib/api/bookings";
import { trustApi } from "@/lib/api/trust";
import { useAuth } from "@/lib/auth/useAuth";
import { TrustBadge } from "@/components/trust/TrustBadge";
import { TrustBreakdown, TrustBreakdownSkeleton } from "@/components/trust/TrustBreakdown";
import { BookingStatusStepper } from "@/components/booking/BookingStatusStepper";
import { HoldTimer } from "@/components/booking/HoldTimer";

export default function AgentDashboardPage() {
  const { user } = useAuth();

  const { data: myListings, isLoading: listingsLoading, isError: listingsError } = useQuery({
    queryKey: ["myListings"],
    queryFn:  () => listingsApi.myListings().then((r) => r.data),
    staleTime: 30_000,
  });

  const { data: myTrust, isLoading: trustLoading } = useQuery({
    queryKey: ["myTrust"],
    queryFn:  () => trustApi.myScore().then((r) => r.data),
    staleTime: 60_000,
  });

  // We don't have an agent-specific bookings endpoint, so we use the general
  // bookings list — the backend returns only bookings relevant to the caller.
  const { data: bookings, isLoading: bookingsLoading, refetch: refetchBookings } = useQuery({
    queryKey: ["agentBookings"],
    queryFn:  () => bookingsApi.list().then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const activeBookings = (bookings ?? []).filter(
    (b) => b.status === "HELD" || b.status === "CONFIRMED",
  );

  return (
    <div className="px-6 py-8">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 mb-10">
        <div>
          <h1 className="font-display text-display-md text-ink mb-1">
            {user?.displayName ? `${user.displayName}'s listings.` : "My listings."}
          </h1>
          <p className="text-sm text-muted font-body">
            Manage your properties and view booking requests.
          </p>
        </div>
        <Link href="/agent/listings/new" className="btn-primary shrink-0 flex items-center gap-2">
          <PlusCircleIcon size={16} aria-hidden />
          New listing
        </Link>
      </div>

      {/* ── Identity verification prompt ─────────────────────── */}
      {myTrust && !myTrust.identityVerified && (
        <div className="banner-info mb-8 flex items-start gap-3">
          <ShieldIcon size={16} className="shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-medium text-sm">Verify your identity to build trust with students.</p>
            <p className="text-sm mt-1">
              ID-verified agents get a filled trust badge on every listing.
              Contact{" "}
              <a href="mailto:support@safecrib.io" className="underline">
                support@safecrib.io
              </a>{" "}
              to start the verification process.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-10">
        {/* ── Left: listings + booking requests ─────────────── */}
        <div>
          {/* My listings */}
          <section className="mb-12">
            <h2 className="font-display text-lg font-bold text-ink mb-5">My listings</h2>

            {listingsError && (
              <div className="banner-error mb-4">Failed to load listings.</div>
            )}

            {listingsLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="card p-4 flex gap-4">
                    <div className="skeleton w-20 h-16 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="skeleton h-4 w-3/4" />
                      <div className="skeleton h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !myListings?.length ? (
              <div className="py-10 border-t border-[#E5E5E5] text-center">
                <p className="text-sm text-muted font-body mb-4">
                  You haven&apos;t created any listings yet.
                </p>
                <Link href="/agent/listings/new" className="btn-primary text-sm">
                  Create your first listing
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {myListings.map((listing) => (
                  <AgentListingRow key={listing.id} listing={listing} />
                ))}
              </div>
            )}
          </section>

          {/* Booking requests */}
          <section>
            <h2 className="font-display text-lg font-bold text-ink mb-5">
              Booking requests
              {activeBookings.length > 0 && (
                <span className="ml-2 text-sm font-body font-normal text-muted">
                  ({activeBookings.length} active)
                </span>
              )}
            </h2>

            {bookingsLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="card p-4 space-y-3">
                    <div className="skeleton h-4 w-1/2" />
                    <div className="skeleton h-3 w-1/3" />
                  </div>
                ))}
              </div>
            ) : activeBookings.length === 0 ? (
              <p className="text-sm text-muted font-body py-6 border-t border-[#E5E5E5]">
                No active holds or bookings right now.
              </p>
            ) : (
              <div className="space-y-3">
                {activeBookings.map((b) => (
                  <AgentBookingRow
                    key={b.id}
                    booking={b}
                    onHoldExpired={() => refetchBookings()}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ── Right: trust score ────────────────────────────── */}
        <div>
          <div className="sticky top-20">
            <h2 className="font-display text-base font-bold text-ink mb-4">Your trust score</h2>
            {trustLoading ? (
              <TrustBreakdownSkeleton />
            ) : myTrust ? (
              <TrustBreakdown score={myTrust} defaultExpanded alwaysExpanded />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Agent listing row ──────────────────────────────────────────────────────

function AgentListingRow({ listing }: { listing: Listing }) {
  const photo = listing.photos?.[0]?.url;

  return (
    <div className="card flex items-start gap-0 overflow-hidden">
      {/* Thumbnail */}
      {photo && (
        <div className="relative w-20 h-full min-h-[80px] shrink-0">
          <Image
            src={photo}
            alt={listing.title}
            fill
            sizes="80px"
            className="object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-ink truncate">{listing.title}</h3>
            <p className="flex items-center gap-1 text-xs text-muted font-body mt-0.5">
              <MapPinIcon size={10} aria-hidden />
              <span className="truncate">{listing.address}</span>
            </p>
          </div>
          <span className={`status-pill status-${listing.status.toLowerCase()} shrink-0`}>
            {listing.status}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3 mt-3">
          <div className="flex items-center gap-4 text-xs text-muted font-body">
            <span>£{listing.price.toLocaleString()}/mo</span>
            {listing._count?.bookings !== undefined && (
              <span className="flex items-center gap-1">
                <UsersIcon size={10} aria-hidden />
                {listing._count.bookings} booking{listing._count.bookings !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <Link
            href={`/agent/listings/${listing.id}/edit`}
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors font-body"
            aria-label={`Edit ${listing.title}`}
          >
            <PencilIcon size={11} aria-hidden />
            Edit
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Agent booking row ──────────────────────────────────────────────────────

function AgentBookingRow({
  booking,
  onHoldExpired,
}: {
  booking: Booking;
  onHoldExpired?: () => void;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-medium text-ink">{booking.listing.title}</h3>
          <p className="text-xs text-muted font-body mt-0.5">
            Booking #{booking.id.slice(0, 8).toUpperCase()}
          </p>
        </div>
        <span className={`status-pill status-${booking.status.toLowerCase()} shrink-0`}>
          {booking.status}
        </span>
      </div>

      {booking.status === "HELD" && booking.holdExpiresAt && (
        <HoldTimer
          expiresAt={booking.holdExpiresAt}
          onExpired={onHoldExpired}
          className="mb-3"
        />
      )}

      <BookingStatusStepper status={booking.status} className="mt-2" />

      <p className="text-xs text-muted font-body mt-3">
        Deposit: <span className="text-ink font-medium">£{booking.depositAmount.toLocaleString()}</span>
      </p>
    </div>
  );
}
