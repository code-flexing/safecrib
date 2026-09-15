"use client";

/**
 * /agents/[id] — Public agent/landlord profile.
 *
 * The trust breakdown is the main content here — not a sidebar detail.
 * Below it: their active listings.
 */

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, UserCircleIcon, CalendarIcon } from "lucide-react";
import { trustApi } from "@/lib/api/trust";
import { listingsApi } from "@/lib/api/listings";
import { TrustBadge } from "@/components/trust/TrustBadge";
import { TrustBreakdown, TrustBreakdownSkeleton } from "@/components/trust/TrustBreakdown";
import { ListingCard, ListingCardSkeleton } from "@/components/listing/ListingCard";

export default function AgentProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const { data: trust, isLoading: trustLoading, isError: trustError } = useQuery({
    queryKey: ["trust", id],
    queryFn:  () => trustApi.getScore(id).then((r) => r.data),
    staleTime: 60_000,
  });

  // Search listings filtered to this owner by re-using the search endpoint.
  // The backend search doesn't expose ownerId filter, so we fetch all and filter
  // client-side for now — acceptable at MVP listing counts.
  const { data: allListings, isLoading: listingsLoading } = useQuery({
    queryKey: ["listings", { ownerId: id }],
    queryFn:  () => listingsApi.search({ pageSize: 50 }).then((r) => r.data),
    staleTime: 60_000,
  });

  const listings = (allListings?.data ?? []).filter((l) => l.ownerId === id);
  const joinedDate = trust
    ? new Date(trust.memberSince).toLocaleDateString("en-GB", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="content-max py-10">
      {/* Back */}
      <Link
        href="/listings"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink transition-colors mb-8 font-body"
      >
        <ArrowLeftIcon size={14} aria-hidden />
        Back to listings
      </Link>

      {trustError && (
        <div className="banner-error mb-6">Failed to load agent profile.</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-12">
        {/* ── Left: profile + trust ───────────────────────────── */}
        <div>
          {/* Avatar + name */}
          <div className="flex flex-col items-start gap-4 mb-8">
            <div className="w-16 h-16 border border-[#E5E5E5] flex items-center justify-center text-muted">
              <UserCircleIcon size={32} aria-hidden />
            </div>

            {trustLoading ? (
              <div className="space-y-2">
                <div className="skeleton h-6 w-36" />
                <div className="skeleton h-4 w-24" />
              </div>
            ) : trust ? (
              <div>
                <h1 className="font-display text-2xl font-bold text-ink">Agent</h1>
                <div className="flex items-center gap-2 mt-2">
                  <TrustBadge
                    score={trust.score}
                    identityVerified={trust.identityVerified}
                    emailVerified={trust.emailVerified}
                    size="md"
                    showLabel
                  />
                </div>
                {joinedDate && (
                  <p className="flex items-center gap-1.5 text-xs text-muted font-body mt-3">
                    <CalendarIcon size={11} aria-hidden />
                    Member since {joinedDate}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          {/* Trust breakdown */}
          {trustLoading ? (
            <TrustBreakdownSkeleton />
          ) : trust ? (
            <TrustBreakdown score={trust} defaultExpanded alwaysExpanded />
          ) : null}

          {/* Report link */}
          <div className="mt-6 pt-6 border-t border-[#E5E5E5]">
            <Link
              href={`/student/report?targetUserId=${id}`}
              className="text-xs text-muted hover:text-ink transition-colors font-body"
            >
              Report this user
            </Link>
          </div>
        </div>

        {/* ── Right: listings ─────────────────────────────────── */}
        <div>
          <h2 className="font-display text-xl font-bold text-ink mb-6">
            Active listings
          </h2>

          {listingsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <ListingCardSkeleton key={i} />
              ))}
            </div>
          ) : listings.length === 0 ? (
            <p className="text-sm text-muted font-body py-10 border-t border-[#E5E5E5]">
              This agent has no active listings right now.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {listings.map((listing) => (
                <ListingCard key={listing.id} listing={listing} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
