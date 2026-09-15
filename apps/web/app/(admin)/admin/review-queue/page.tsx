"use client";

/**
 * /admin/review-queue — Admin fraud and duplicate triage.
 *
 * Two tabs:
 *   1. Fraud reports — pending reports from students with resolve/dismiss actions.
 *   2. Duplicate flags — pHash/text/geo matches flagged by the backend detector,
 *      shown side-by-side for a human decision.
 *
 * This is the surface where the backend's fraud detection system produces
 * actionable UI rather than silent records in a database.
 */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FlagIcon,
  CopyIcon,
  CheckIcon,
  XIcon,
  ExternalLinkIcon,
  ClockIcon,
  UserCircleIcon,
} from "lucide-react";
import {
  fraudApi,
  type FraudReport,
  type DuplicateFlag,
} from "@/lib/api/fraud";
import { listingsApi } from "@/lib/api/listings";

type Tab = "fraud" | "duplicates";

// ── Page ───────────────────────────────────────────────────────────────────

export default function ReviewQueuePage() {
  const [tab, setTab] = useState<Tab>("fraud");

  const { data: fraudReports, isLoading: fraudLoading, isError: fraudError } = useQuery({
    queryKey: ["fraudReports"],
    queryFn:  () => fraudApi.pending().then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: duplicateFlags, isLoading: dupsLoading, isError: dupsError } = useQuery({
    queryKey: ["duplicateFlags"],
    queryFn:  () => fraudApi.pendingDuplicates().then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const fraudCount = fraudReports?.length ?? 0;
  const dupsCount  = duplicateFlags?.length ?? 0;
  const totalPending = fraudCount + dupsCount;

  return (
    <div className="px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-display-md text-ink mb-1">Review queue</h1>
        <p className="text-sm text-muted font-body">
          {totalPending === 0
            ? "All clear — no pending items."
            : `${totalPending} item${totalPending === 1 ? "" : "s"} awaiting review.`}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#E5E5E5] mb-8">
        <TabButton
          active={tab === "fraud"}
          onClick={() => setTab("fraud")}
          label="Fraud reports"
          count={fraudCount}
        />
        <TabButton
          active={tab === "duplicates"}
          onClick={() => setTab("duplicates")}
          label="Duplicate flags"
          count={dupsCount}
        />
      </div>

      {/* Content */}
      {tab === "fraud" ? (
        <FraudReportsPanel
          reports={fraudReports ?? []}
          isLoading={fraudLoading}
          isError={fraudError}
        />
      ) : (
        <DuplicateFlagsPanel
          flags={duplicateFlags ?? []}
          isLoading={dupsLoading}
          isError={dupsError}
        />
      )}
    </div>
  );
}

// ── Tab button ─────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 pb-3 text-sm font-body font-medium transition-colors border-b-2 mr-6 ${
        active
          ? "border-ink text-ink"
          : "border-transparent text-muted hover:text-ink"
      }`}
      aria-pressed={active}
    >
      {label}
      {count > 0 && (
        <span
          className={`ml-2 text-xs font-bold px-1.5 py-0.5 ${
            active ? "bg-ink text-paper" : "bg-[#F0F0F0] text-muted"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ── Fraud reports panel ────────────────────────────────────────────────────

function FraudReportsPanel({
  reports,
  isLoading,
  isError,
}: {
  reports: FraudReport[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <QueueSkeleton rows={4} />;
  if (isError) return <div className="banner-error">Failed to load fraud reports.</div>;

  if (reports.length === 0) {
    return (
      <div className="py-16 text-center">
        <FlagIcon size={32} className="text-[#E5E5E5] mx-auto mb-4" aria-hidden />
        <p className="text-sm text-muted font-body">No pending fraud reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reports.map((report) => (
        <FraudReportCard key={report.id} report={report} />
      ))}
    </div>
  );
}

function FraudReportCard({ report }: { report: FraudReport }) {
  const queryClient = useQueryClient();
  const [resolution, setResolution] = useState("");
  const [showResolve, setShowResolve] = useState(false);
  const [action, setAction] = useState<"RESOLVED" | "DISMISSED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: { status: "RESOLVED" | "DISMISSED"; resolution: string }) =>
      fraudApi.resolve(report.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fraudReports"] });
    },
    onError: (err: Error) => {
      setError(err.message ?? "Failed to resolve report.");
    },
  });

  const reportedAt = new Date(report.createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  const TYPE_LABELS: Record<string, string> = {
    FAKE_LISTING:      "Fake listing",
    DOUBLE_BOOKING:    "Double-booking",
    SCAM_PAYMENT:      "Payment scam",
    MISREPRESENTATION: "Misrepresentation",
    OTHER:             "Other",
  };

  return (
    <div className="card p-0">
      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4 border-b border-[#E5E5E5]">
        <div className="flex items-start gap-3">
          <FlagIcon size={16} className="text-muted mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-medium text-ink">
              {TYPE_LABELS[report.type] ?? report.type}
            </p>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted font-body">
              <span className="flex items-center gap-1">
                <ClockIcon size={10} aria-hidden />
                {reportedAt}
              </span>
              {report.reporter && (
                <span className="flex items-center gap-1">
                  <UserCircleIcon size={10} aria-hidden />
                  Reported by {report.reporter.displayName ?? report.reporter.email}
                </span>
              )}
            </div>
          </div>
        </div>
        <span className={`status-pill shrink-0 ${
          report.status === "PENDING" ? "status-held" :
          report.status === "REVIEWING" ? "status-held" :
          report.status === "RESOLVED" ? "status-completed" :
          "status-cancelled"
        }`}>
          {report.status}
        </span>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3">
        {/* Target listing / user */}
        <div className="flex flex-wrap gap-4 text-xs text-muted font-body">
          {report.targetListing && (
            <div>
              <span className="font-medium text-ink">Listing: </span>
              {report.targetListing.title}
              <Link
                href={`/listings/${report.targetListing.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 inline-flex items-center gap-0.5 underline hover:text-ink"
              >
                View
                <ExternalLinkIcon size={9} aria-hidden />
              </Link>
            </div>
          )}
          {report.targetUser && (
            <div>
              <span className="font-medium text-ink">User: </span>
              {report.targetUser.displayName ?? report.targetUser.email}
              <Link
                href={`/agents/${report.targetUser.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-1 inline-flex items-center gap-0.5 underline hover:text-ink"
              >
                View profile
                <ExternalLinkIcon size={9} aria-hidden />
              </Link>
            </div>
          )}
        </div>

        {/* Description */}
        <div className="border-l-2 border-[#E5E5E5] pl-3">
          <p className="text-sm text-ink font-body leading-relaxed">{report.description}</p>
        </div>
      </div>

      {/* Actions */}
      {report.status === "PENDING" || report.status === "REVIEWING" ? (
        <div className="px-5 pb-4">
          {error && <p className="field-error mb-3">{error}</p>}

          {!showResolve ? (
            <div className="flex gap-3">
              <button
                onClick={() => { setAction("RESOLVED"); setShowResolve(true); }}
                className="btn-primary text-sm flex items-center gap-1.5"
              >
                <CheckIcon size={13} aria-hidden />
                Resolve
              </button>
              <button
                onClick={() => { setAction("DISMISSED"); setShowResolve(true); }}
                className="btn-secondary text-sm flex items-center gap-1.5"
              >
                <XIcon size={13} aria-hidden />
                Dismiss
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="label" htmlFor={`resolution-${report.id}`}>
                {action === "RESOLVED" ? "Resolution notes" : "Reason for dismissal"}
              </label>
              <textarea
                id={`resolution-${report.id}`}
                className="input resize-none h-24 text-sm"
                placeholder="Briefly note what action was taken or why this was dismissed…"
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setError(null);
                    mutation.mutate({ status: action!, resolution });
                  }}
                  disabled={mutation.isPending}
                  className="btn-primary text-sm"
                >
                  {mutation.isPending ? "Saving…" : `Confirm ${action === "RESOLVED" ? "resolve" : "dismiss"}`}
                </button>
                <button
                  onClick={() => { setShowResolve(false); setResolution(""); }}
                  className="btn-ghost text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Duplicate flags panel ──────────────────────────────────────────────────

function DuplicateFlagsPanel({
  flags,
  isLoading,
  isError,
}: {
  flags: DuplicateFlag[];
  isLoading: boolean;
  isError: boolean;
}) {
  if (isLoading) return <QueueSkeleton rows={3} tall />;
  if (isError) return <div className="banner-error">Failed to load duplicate flags.</div>;

  if (flags.length === 0) {
    return (
      <div className="py-16 text-center">
        <CopyIcon size={32} className="text-[#E5E5E5] mx-auto mb-4" aria-hidden />
        <p className="text-sm text-muted font-body">No pending duplicate flags.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {flags.map((flag) => (
        <DuplicateFlagCard key={flag.id} flag={flag} />
      ))}
    </div>
  );
}

function DuplicateFlagCard({ flag }: { flag: DuplicateFlag }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (status: "CONFIRMED_DUPLICATE" | "FALSE_POSITIVE") =>
      fraudApi.resolveDuplicate(flag.id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duplicateFlags"] });
    },
    onError: (err: Error) => {
      setError(err.message ?? "Failed to resolve flag.");
    },
  });

  const pct = Math.round(flag.similarity * 100);
  const flaggedAt = new Date(flag.createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });

  const MATCH_LABELS: Record<string, string> = {
    PHASH:     "Perceptual image hash",
    TEXT:      "Text similarity",
    GEO_PRICE: "Location + price match",
  };

  return (
    <div className="card p-0">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#E5E5E5] flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-ink">
            {MATCH_LABELS[flag.matchType] ?? flag.matchType} — {pct}% match
          </p>
          <p className="text-xs text-muted font-body mt-0.5">Flagged {flaggedAt}</p>
        </div>
        <span className="status-pill status-held shrink-0">Pending</span>
      </div>

      {/* Side-by-side comparison */}
      <div className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <ListingCompareCard listing={flag.listingA} label="Listing A" />
          <ListingCompareCard listing={flag.listingB} label="Listing B" />
        </div>

        {error && <p className="field-error mb-3">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={() => { setError(null); mutation.mutate("CONFIRMED_DUPLICATE"); }}
            disabled={mutation.isPending}
            className="btn-primary text-sm flex items-center gap-1.5"
          >
            <CheckIcon size={13} aria-hidden />
            Confirm duplicate
          </button>
          <button
            onClick={() => { setError(null); mutation.mutate("FALSE_POSITIVE"); }}
            disabled={mutation.isPending}
            className="btn-secondary text-sm flex items-center gap-1.5"
          >
            <XIcon size={13} aria-hidden />
            False positive
          </button>
        </div>
      </div>
    </div>
  );
}

function ListingCompareCard({
  listing,
  label,
}: {
  listing: { id: string; title: string; photos: Array<{ url: string }> };
  label: string;
}) {
  const photo = listing.photos?.[0]?.url;

  return (
    <div className="border border-[#E5E5E5]">
      {photo ? (
        <div className="relative aspect-[4/3] overflow-hidden bg-[#F0F0F0]">
          <Image
            src={photo}
            alt={listing.title}
            fill
            sizes="(max-width: 640px) 100vw, 300px"
            className="object-cover"
            loading="lazy"
          />
        </div>
      ) : (
        <div className="aspect-[4/3] bg-[#F0F0F0] flex items-center justify-center">
          <span className="text-xs text-muted font-body">No photo</span>
        </div>
      )}
      <div className="p-3">
        <p className="text-[10px] text-muted font-body uppercase tracking-wide mb-1">{label}</p>
        <p className="text-sm font-medium text-ink line-clamp-2">{listing.title}</p>
        <Link
          href={`/listings/${listing.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink mt-1 font-body"
        >
          View listing
          <ExternalLinkIcon size={9} aria-hidden />
        </Link>
      </div>
    </div>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────

function QueueSkeleton({ rows = 3, tall = false }: { rows?: number; tall?: boolean }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={`card p-5 space-y-3 ${tall ? "h-48" : "h-28"}`}>
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-3 w-1/3" />
          <div className="skeleton h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}
