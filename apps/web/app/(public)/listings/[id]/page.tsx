"use client";

/**
 * /listings/[id] — Listing detail page.
 *
 * Trust thesis in action: trust score and verification state are shown
 * immediately next to the agent's name, and again inside the booking CTA
 * panel — the student never makes a deposit decision without seeing them.
 *
 * Layout: full-width gallery → main content + sticky booking sidebar.
 */

import { use } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MapPinIcon,
  CalendarIcon,
  ArrowLeftIcon,
  UserCircleIcon,
} from "lucide-react";
import { listingsApi } from "@/lib/api/listings";
import { bookingsApi } from "@/lib/api/bookings";
import { trustApi } from "@/lib/api/trust";
import { useAuth } from "@/lib/auth/useAuth";
import { ListingGallery } from "@/components/listing/ListingGallery";
import { TrustBadge } from "@/components/trust/TrustBadge";
import { TrustBreakdown, TrustBreakdownSkeleton } from "@/components/trust/TrustBreakdown";
import { useState } from "react";

// ── Page ───────────────────────────────────────────────────────────────────

export default function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: listingData, isLoading, isError } = useQuery({
    queryKey: ["listing", id],
    queryFn:  () => listingsApi.getById(id).then((r) => r.data),
    staleTime: 60_000,
  });

  const { data: ownerTrust } = useQuery({
    queryKey: ["trust", listingData?.ownerId],
    queryFn:  () =>
      listingData ? trustApi.getScore(listingData.ownerId).then((r) => r.data) : null,
    enabled: !!listingData?.ownerId,
    staleTime: 60_000,
  });

  if (isLoading) return <ListingDetailSkeleton />;

  if (isError || !listingData) {
    return (
      <div className="content-max py-20 text-center">
        <p className="font-display text-display-md text-ink mb-3">Listing not found</p>
        <p className="text-sm text-muted font-body mb-6">
          This listing may have been removed or is no longer available.
        </p>
        <Link href="/listings" className="btn-secondary text-sm">
          Back to listings
        </Link>
      </div>
    );
  }

  const listing = listingData;
  const availableFrom = new Date(listing.availableFrom).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const isAvailable = listing.status === "AVAILABLE";

  return (
    <div className="min-h-screen">
      {/* Gallery — full width, bleed to edges */}
      <div className="border-b border-[#E5E5E5]">
        <ListingGallery photos={listing.photos} title={listing.title} />
      </div>

      {/* Content */}
      <div className="content-max py-10">
        {/* Back nav */}
        <Link
          href="/listings"
          className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink transition-colors mb-8 font-body"
        >
          <ArrowLeftIcon size={14} aria-hidden />
          All listings
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12">
          {/* ── Left: listing details ──────────────────────────── */}
          <div>
            {/* Status pill */}
            {listing.status !== "AVAILABLE" && (
              <span
                className={`status-pill status-${listing.status.toLowerCase()} mb-4 inline-flex`}
              >
                {listing.status === "HELD"    && "Currently on hold"}
                {listing.status === "BOOKED"  && "Booked"}
                {listing.status === "FLAGGED" && "Under review"}
                {listing.status === "UNAVAILABLE" && "Unavailable"}
              </span>
            )}

            {/* Price + title */}
            <div className="mb-6">
              <p className="font-display text-3xl font-bold text-ink">
                £{listing.price.toLocaleString()}
                <span className="text-base font-body font-normal text-muted">/mo</span>
              </p>
              <h1 className="font-display text-display-md text-ink mt-2">
                {listing.title}
              </h1>
            </div>

            {/* Meta */}
            <div className="flex flex-wrap gap-5 mb-8 text-sm text-muted font-body">
              <span className="flex items-center gap-1.5">
                <MapPinIcon size={13} aria-hidden />
                {listing.address}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarIcon size={13} aria-hidden />
                Available {availableFrom}
              </span>
            </div>

            <hr className="hairline mb-8" />

            {/* Description */}
            <div className="mb-10">
              <h2 className="font-display text-lg font-bold text-ink mb-4">About this listing</h2>
              <p className="text-sm text-ink font-body leading-relaxed whitespace-pre-wrap">
                {listing.description}
              </p>
            </div>

            <hr className="hairline mb-8" />

            {/* Agent profile strip */}
            <AgentStrip
              owner={listing.owner}
              trustScore={ownerTrust ?? null}
            />
          </div>

          {/* ── Right: booking panel (sticky) ─────────────────── */}
          <div>
            <div className="sticky top-20">
              <BookingPanel
                listingId={listing.id}
                price={listing.price}
                isAvailable={isAvailable}
                agentName={listing.owner.displayName}
                ownerTrust={ownerTrust ?? null}
                ownerIdentityVerified={listing.owner.identityVerified}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Agent strip ────────────────────────────────────────────────────────────

function AgentStrip({
  owner,
  trustScore,
}: {
  owner: { id: string; displayName: string | null; trustScore: number | null; identityVerified: boolean };
  trustScore: import("@/lib/api/trust").TrustScore | null;
}) {
  return (
    <div>
      <h2 className="font-display text-lg font-bold text-ink mb-4">Listed by</h2>
      <div className="flex items-start justify-between gap-4">
        <Link
          href={`/agents/${owner.id}`}
          className="flex items-center gap-3 group"
          aria-label={`View ${owner.displayName ?? "agent"}'s profile`}
        >
          <div className="w-10 h-10 flex items-center justify-center border border-[#E5E5E5] text-muted">
            <UserCircleIcon size={20} aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium text-ink group-hover:underline">
              {owner.displayName ?? "Agent"}
            </p>
            <p className="text-xs text-muted mt-0.5">View profile →</p>
          </div>
        </Link>

        <TrustBadge
          score={owner.trustScore}
          identityVerified={owner.identityVerified}
          size="md"
          showLabel
        />
      </div>

      {trustScore && (
        <div className="mt-4">
          <TrustBreakdown score={trustScore} defaultExpanded={false} />
        </div>
      )}

      {!trustScore && (
        <div className="mt-4">
          <TrustBreakdownSkeleton />
        </div>
      )}
    </div>
  );
}

// ── Booking panel ──────────────────────────────────────────────────────────

function BookingPanel({
  listingId,
  price,
  isAvailable,
  agentName,
  ownerTrust,
  ownerIdentityVerified,
}: {
  listingId: string;
  price: number;
  isAvailable: boolean;
  agentName: string | null;
  ownerTrust: import("@/lib/api/trust").TrustScore | null;
  ownerIdentityVerified: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [moveInDate, setMoveInDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () => bookingsApi.create(listingId, moveInDate),
    onSuccess: () => {
      setSuccess(true);
      queryClient.invalidateQueries({ queryKey: ["listing", listingId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => {
      const msg =
        "message" in err
          ? (err as { message: string }).message
          : "Failed to place hold. Please try again.";
      setError(
        msg.toLowerCase().includes("already held") || msg.toLowerCase().includes("conflict")
          ? "This room was just held by someone else. Try another listing."
          : msg,
      );
    },
  });

  const canBook = user?.role === "STUDENT";

  return (
    <div className="card p-6">
      <p className="font-display text-2xl font-bold text-ink mb-1">
        £{price.toLocaleString()}
        <span className="text-sm font-body font-normal text-muted">/mo</span>
      </p>

      {/* Trust signal — shown right here, before any CTA */}
      {ownerTrust && (
        <div className="mt-4 mb-5">
          <TrustBreakdown
            score={ownerTrust}
            alwaysExpanded
            className="border-0 !p-0"
          />
        </div>
      )}

      <hr className="hairline mb-5" />

      {success ? (
        <div className="banner-success">
          <p className="font-medium text-sm">Hold placed successfully.</p>
          <p className="text-sm mt-1">
            You have 24 hours to confirm your booking.{" "}
            <Link href="/student/dashboard" className="underline">
              View your booking →
            </Link>
          </p>
        </div>
      ) : !isAvailable ? (
        <div className="banner-info text-sm">
          This listing is not currently available for booking.
        </div>
      ) : !user ? (
        <div className="space-y-3">
          <p className="text-sm text-muted font-body">
            Sign in to place a protected hold on this listing.
          </p>
          <Link href="/auth/login" className="btn-primary w-full text-center block">
            Sign in to book
          </Link>
          <Link href="/auth/register" className="btn-secondary w-full text-center block text-sm">
            Create an account
          </Link>
        </div>
      ) : !canBook ? (
        <div className="banner-info text-sm">
          Only students can place booking holds. Your account is registered as{" "}
          {user.role.toLowerCase()}.
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (!moveInDate) {
              setError("Please select a move-in date.");
              return;
            }
            mutation.mutate();
          }}
          noValidate
        >
          <div className="mb-4">
            <label className="label" htmlFor="move-in-date">Move-in date</label>
            <input
              id="move-in-date"
              type="date"
              className="input"
              required
              value={moveInDate}
              min={new Date().toISOString().split("T")[0]}
              onChange={(e) => setMoveInDate(e.target.value)}
            />
          </div>

          {error && <p className="field-error mb-4">{error}</p>}

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Placing hold…" : "Place a hold — protected deposit"}
          </button>

          <p className="text-xs text-muted mt-3 font-body leading-relaxed">
            Placing a hold locks this listing for 24 hours while you confirm.
            Your deposit is protected — you can cancel before confirming.
          </p>
        </form>
      )}
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function ListingDetailSkeleton() {
  return (
    <div>
      <div className="skeleton aspect-[16/9] w-full" />
      <div className="content-max py-10">
        <div className="skeleton h-4 w-24 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12">
          <div className="space-y-4">
            <div className="skeleton h-8 w-40" />
            <div className="skeleton h-10 w-3/4" />
            <div className="skeleton h-4 w-1/2" />
            <div className="skeleton h-4 w-1/3" />
            <div className="mt-8 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="skeleton h-3 w-full" />
              ))}
            </div>
          </div>
          <div className="skeleton h-64 w-full" />
        </div>
      </div>
    </div>
  );
}
