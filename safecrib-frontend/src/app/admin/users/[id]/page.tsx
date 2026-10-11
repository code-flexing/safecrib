"use client";

import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch, ApiError, unwrapData } from "@/lib/api";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { UserName, seedVerificationCache } from "@/components/common/UserName";
import { type VerificationStageResult } from "@/components/verification/VerificationBadge";
import type { VerificationKind } from "@/components/verification/verification-kinds";
import { VerificationProgressLadder } from "@/components/verification/VerificationProgressLadder";
import { SendNotificationDialog } from "@/components/admin/SendNotificationDialog";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";

type UserRole = "STUDENT" | "AGENT" | "LANDLORD" | "UNVERIFIED";

interface StudentProfileData {
  id: string;
  displayName?: string | null;
  shortBio?: string;
  longBio?: string | null;
  proofOfStudentship?: string | null;
  schoolOfStudy?: string | null;
  courseOfStudy?: string | null;
  level?: string | null;
  profilePicture?: string | null;
  dateOfBirth?: string | null;
  gender?: string | null;
  phoneNumber?: string | null;
  emergencyContact?: string | null;
  socialLinks?: unknown;
  status: string;
  reviewedBy?: string | null;
  reviewNotes?: string | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ProviderPageData {
  id: string;
  displayName: string;
  description?: string | null;
  shortBio?: string;
  longBio?: string | null;
  phone?: string | null;
  verificationState: string;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  verificationNotes?: string | null;
  proofOfLicense?: string | null;
  profilePicture?: string | null;
  businessName?: string | null;
  businessRegNumber?: string | null;
  businessAddress?: string | null;
  providerType?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VerificationData {
  stage: string;
  badge: string;
  badgeColor: string;
  riskBlocked: boolean;
  identityVerified?: boolean;
  providerVerified?: boolean;
  studentProfileApproved?: boolean;
  trustScore?: number | null;
  nextMilestone?: string | null;
  lastComputedAt?: string | null;
  kind?: VerificationKind | null;
  role?: string | null;
}

interface ListingData {
  id: string;
  title: string;
  price: number;
  discountAmount?: number | null;
  status: string;
  campus?: string | null;
  createdAt: string;
}

interface BookingData {
  id: string;
  listingId: string;
  status: string;
  depositAmount: number;
  holdExpiresAt?: string | null;
  bookedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  listing?: { id: string; title: string; price: number };
}

interface FraudReportFiled {
  id: string;
  type: string;
  description: string;
  status: string;
  targetUserId?: string | null;
  targetListingId?: string | null;
  createdAt: string;
  targetListing?: { id: string; title: string } | null;
  targetUser?: { id: string; displayName: string | null; username: string | null } | null;
}

interface FraudReportAssigned {
  id: string;
  type: string;
  description: string;
  status: string;
  reporterId: string;
  targetListingId?: string | null;
  createdAt: string;
  reporter?: { id: string; displayName: string | null; username: string | null } | null;
  targetListing?: { id: string; title: string } | null;
}

interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  href?: string | null;
  readAt?: string | null;
  createdAt: string;
  data: {
    senderNameSnapshot?: string;
    senderAvatarSnapshot?: string | null;
    senderAdminId?: string;
    templateKey?: string;
  } | null;
}

interface TrustEvent {
  id: string;
  eventType: string;
  weight: number;
  occurredAt: string;
}

interface UserDetail {
  id: string;
  email: string;
  displayName: string | null;
  username: string | null;
  role: UserRole;
  emailVerified: boolean;
  identityVerified: boolean;
  trustScore: number | null;
  profilePicture: string | null;
  createdAt: string;
  updatedAt: string;
  studentProfile: StudentProfileData | null;
  providerPage: ProviderPageData | null;
  verification: VerificationData | null;
  listings: ListingData[];
  bookings: BookingData[];
  trustEvents: TrustEvent[];
  fraudReportsFiled: FraudReportFiled[];
  fraudReportsAssigned: FraudReportAssigned[];
  notifications: AdminNotification[];
  _count: {
    listings: number;
    bookings: number;
    trustEvents: number;
    fraudReportsFiled: number;
    fraudReportsAssigned: number;
    notifications: number;
  };
}

interface NotificationsResponse {
  items: AdminNotification[];
  total: number;
}

type Tab = "overview" | "verification" | "listings" | "bookings" | "reports" | "notifications" | "activity";

const TAB_ORDER: Tab[] = ["overview", "verification", "listings", "bookings", "reports", "notifications", "activity"];

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  verification: "Verification",
  listings: "Listings",
  bookings: "Bookings",
  reports: "Reports & conflicts",
  notifications: "Notifications sent",
  activity: "Activity",
};

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(amount);
}

function readableStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getRoleColor(role: string) {
  const colors: Record<string, string> = {
    STUDENT: "bg-emerald-100 text-emerald-800",
    AGENT: "bg-amber-100 text-amber-800",
    LANDLORD: "bg-blue-100 text-blue-800",
    UNVERIFIED: "bg-gray-100 text-gray-700",
  };
  return colors[role] ?? "bg-gray-100 text-gray-700";
}

function getRoleLabel(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function getVerificationStatus(user: UserDetail) {
  if (user.identityVerified) return "VERIFIED";
  if (user.emailVerified) return "PENDING";
  if (user.fraudReportsAssigned.length > 0 || user.fraudReportsFiled.length > 0) return "REJECTED";
  return "NOT_SUBMITTED";
}

function getVerificationColor(status: string) {
  const colors: Record<string, string> = {
    VERIFIED: "bg-emerald-100 text-emerald-800",
    PENDING: "bg-amber-100 text-amber-800",
    REJECTED: "bg-red-100 text-red-800",
    NOT_SUBMITTED: "bg-gray-100 text-gray-700",
  };
  return colors[status] ?? "bg-gray-100 text-gray-700";
}

function getAccountStatus(user: UserDetail) {
  return user.emailVerified ? "ACTIVE" : "SUSPENDED";
}

function getAccountStatusColor(status: string) {
  return status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800";
}

function toBadgeColor(color?: string | null): VerificationStageResult["badgeColor"] {
  if (color === "gold") return "gold";
  if (color === "blue" || color === "charcoal") return "charcoal";
  if (color === "admin") return "admin";
  if (color === "agent") return "agent";
  return "green";
}

function buildVerificationStage(data: VerificationData | null): VerificationStageResult | null {
  if (!data || !data.stage) return null;
  if (data.kind) {
    const kind = data.kind as VerificationKind;
    return {
      eligible: true,
      stage: kind === "staff" ? "STAFF" : kind === "agent" || kind === "landlord" ? "AGENT_VERIFIED" : "PROFILE_VERIFIED",
      badge: kind === "staff" ? "STAFF_STAR" : kind === "agent" || kind === "landlord" ? "BLUE_SHIELD" : "GREEN_CHECK",
      badgeColor: kind === "staff" ? "admin" : kind === "agent" || kind === "landlord" ? "agent" : "green",
      riskBlocked: data.riskBlocked ?? false,
      nextMilestone: data.nextMilestone ?? null,
      criteria: [],
      generatedAt: data.lastComputedAt ?? undefined,
      userId: undefined,
      role: data.role ?? undefined,
      kind,
    };
  }
  const stage = data.riskBlocked ? "PROFILE_VERIFIED" : (data.stage as VerificationStageResult["stage"]);
  return {
    eligible: true,
    stage,
    badge: (data.badge as VerificationStageResult["badge"]) || "GREEN_CHECK",
    badgeColor: toBadgeColor(data.badgeColor),
    riskBlocked: data.riskBlocked,
    nextMilestone: data.nextMilestone ?? null,
    criteria: [],
    generatedAt: data.lastComputedAt ?? undefined,
    userId: undefined,
    role: data.role ?? undefined,
  };
}

function Detail({ label, value }: { label: string; value?: string | null | number | undefined }) {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return null;
  return (
    <div className="border-t border-black/10 py-3 first:border-t-0">
      <dt className="text-xs font-medium uppercase tracking-[0.12em] text-black/45">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-6 text-safecrib-black">{typeof value === "number" ? String(value) : value}</dd>
    </div>
  );
}

function OverviewSection({ user }: { user: UserDetail }) {
  const phone = user.studentProfile?.phoneNumber ?? user.providerPage?.phone ?? null;
  const school = user.studentProfile?.schoolOfStudy ?? null;
  const agency = user.providerPage?.displayName ?? null;
  const institution = school || agency || null;
  const location = user.providerPage?.businessAddress || user.studentProfile?.emergencyContact || null;
  const bio = user.studentProfile?.longBio || user.studentProfile?.shortBio || user.providerPage?.longBio || user.providerPage?.shortBio || null;

  const verificationStage = useMemo(() => buildVerificationStage(user.verification), [user.verification]);

  return (
    <div className="divide-y divide-black/10">
      <Detail label="Email" value={user.email} />
      {phone && <Detail label="Phone" value={phone} />}
      {institution && <Detail label={user.role === "STUDENT" ? "School" : "Agency"} value={institution} />}
      {location && <Detail label="Location" value={location} />}
      {bio && <Detail label="Bio" value={bio} />}
      <Detail label="Trust score" value={user.trustScore != null ? String(user.trustScore) : "Not established"} />
      <Detail label="Listings" value={user._count.listings} />
      <Detail label="Bookings" value={user._count.bookings} />
      <Detail label="Fraud reports (assigned)" value={user._count.fraudReportsAssigned} />
      <Detail label="Fraud reports (filed)" value={user._count.fraudReportsFiled} />
    </div>
  );
}

function VerificationSection({ user }: { user: UserDetail }) {
  const stage = useMemo(() => buildVerificationStage(user.verification), [user.verification]);

  if (user.role === "STUDENT" && user.studentProfile) {
    const profile = user.studentProfile;
    const reviewUrl = `/admin/reviews?userId=${encodeURIComponent(user.id)}`;
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Student profile</p>
          <div className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Detail label="Status" value={readableStatus(profile.status)} />
            {profile.schoolOfStudy && <Detail label="School" value={profile.schoolOfStudy} />}
            {profile.courseOfStudy && <Detail label="Course" value={profile.courseOfStudy} />}
            {profile.level && <Detail label="Level" value={profile.level} />}
            {profile.submittedAt && <Detail label="Submitted" value={formatDate(profile.submittedAt)} />}
            {profile.reviewedAt && <Detail label="Reviewed" value={formatDate(profile.reviewedAt)} />}
            {profile.rejectionReason && <Detail label="Rejection reason" value={profile.rejectionReason} />}
          </div>
          {(profile.status === "PENDING" || profile.status === "NOT_SUBMITTED") && (
            <div className="mt-3">
              <Link
                href={reviewUrl}
                className="text-sm font-medium text-safecrib-green hover:underline"
              >
                Review submission →
              </Link>
            </div>
          )}
        </div>
        {stage && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45 mb-2">Verification badge</p>
            {stage.eligible ? <VerificationProgressLadder currentStage={stage} nextMilestone={stage.nextMilestone ?? null} /> : <p className="text-sm text-black/60">Awaiting verification</p>}
            {stage.riskBlocked && <p className="mt-3 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900">Account review is limiting badge upgrades.</p>}
          </div>
        )}
      </div>
    );
  }

  if (["AGENT", "LANDLORD"].includes(user.role) && user.providerPage) {
    const page = user.providerPage;
    const reviewUrl = `/admin/reviews?userId=${encodeURIComponent(user.id)}`;
    return (
      <div className="space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Provider page</p>
          <div className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Detail label="Business name" value={page.businessName ?? page.displayName} />
            {page.providerType && <Detail label="Type" value={page.providerType} />}
            <Detail label="Verification state" value={readableStatus(page.verificationState)} />
            {page.submittedAt && <Detail label="Submitted" value={formatDate(page.submittedAt)} />}
            {page.verifiedAt && <Detail label="Verified" value={formatDate(page.verifiedAt)} />}
            {page.verificationNotes && <Detail label="Notes" value={page.verificationNotes} />}
          </div>
          {(page.verificationState === "SUBMITTED" || page.verificationState === "REJECTED") && (
            <div className="mt-3">
              <Link
                href={reviewUrl}
                className="text-sm font-medium text-safecrib-green hover:underline"
              >
                Review submission →
              </Link>
            </div>
          )}
        </div>
        {stage && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45 mb-2">Verification badge</p>
            {stage.eligible ? <VerificationProgressLadder currentStage={stage} nextMilestone={stage.nextMilestone ?? null} /> : <p className="text-sm text-black/60">Awaiting verification</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-black/60">No verification information available for this account.</p>
      {stage && (
        <div className="mt-4">
          <VerificationProgressLadder currentStage={stage} nextMilestone={stage.nextMilestone ?? null} />
        </div>
      )}
    </div>
  );
}

function ListingsSection({ user }: { user: UserDetail }) {
  if (user.role !== "AGENT" && user.role !== "LANDLORD") {
    return <p className="text-sm text-black/60">Listings are only available for agents and landlords.</p>;
  }
  if (!user.listings?.length) {
    return <p className="text-sm text-black/60">This {getRoleLabel(user.role).toLowerCase()} has no listings.</p>;
  }
  return (
    <div className="divide-y divide-black/10">
      {user.listings.map((listing) => (
        <div key={listing.id} className="py-3">
          <Link
            href={`/dashboard/listings/${encodeURIComponent(listing.id)}`}
            className="text-sm font-medium text-safecrib-black hover:text-safecrib-green hover:underline"
          >
            {listing.title}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-black/45">
            <span>{formatCurrency(listing.price)}/yr</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getVerificationColor(readableStatus(listing.status))}`}>{readableStatus(listing.status)}</span>
            {listing.campus && <span>{listing.campus}</span>}
            <span>Posted {formatDate(listing.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BookingsSection({ user }: { user: UserDetail }) {
  if (!user.bookings?.length) {
    return <p className="text-sm text-black/60">No bookings found for this user.</p>;
  }
  return (
    <div className="divide-y divide-black/10">
      {user.bookings.map((booking) => (
        <div key={booking.id} className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={booking.listingId ? `/dashboard/listings/${encodeURIComponent(booking.listingId)}` : "#"}
              className="text-sm font-medium text-safecrib-black hover:text-safecrib-green hover:underline"
            >
              {booking.listing?.title ?? "Unknown listing"}
            </Link>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getVerificationColor(readableStatus(booking.status))}`}>{readableStatus(booking.status)}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/50">
            <span>Deposit: {formatCurrency(booking.depositAmount)}</span>
            {booking.bookedAt && <span>Booked {formatDate(booking.bookedAt)}</span>}
            {booking.completedAt && <span>Completed {formatDate(booking.completedAt)}</span>}
            {booking.cancelledAt && <span>Cancelled {formatDate(booking.cancelledAt)}</span>}
            {booking.holdExpiresAt && <span>Hold expires {formatDate(booking.holdExpiresAt)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function ReportsSection({ user }: { user: UserDetail }) {
  const total = user.fraudReportsFiled.length + user.fraudReportsAssigned.length;

  if (total === 0) {
    return <p className="text-sm text-black/60">No fraud reports or conflicts found for this user.</p>;
  }

  return (
    <div className="space-y-6">
      {user.fraudReportsAssigned.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45 mb-2">Against this user ({user.fraudReportsAssigned.length})</p>
          <div className="divide-y divide-black/10">
            {user.fraudReportsAssigned.map((report) => (
              <div key={report.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${report.status === "CONFIRMED" ? "bg-red-100 text-red-800" : report.status === "DISMISSED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{readableStatus(report.status)}</span>
                  <span className="text-xs text-black/45">{formatDate(report.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-black/45">{readableStatus(report.type)}</p>
                <p className="mt-1 text-sm text-black/70 line-clamp-2">{report.description}</p>
                {report.reporter && (
                  <span className="mt-1 inline-block text-xs text-black/50">Reporter: {report.reporter.displayName ?? report.reporter.username ?? "—"}</span>
                )}
                {report.targetListing && (
                  <Link href={`/dashboard/listings/${encodeURIComponent(report.targetListing.id)}`} className="mt-1 inline-block text-xs font-medium text-safecrib-green hover:underline">{report.targetListing.title}</Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {user.fraudReportsFiled.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45 mb-2">Filed by this user ({user.fraudReportsFiled.length})</p>
          <div className="divide-y divide-black/10">
            {user.fraudReportsFiled.map((report) => (
              <div key={report.id} className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${report.status === "CONFIRMED" ? "bg-red-100 text-red-800" : report.status === "DISMISSED" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{readableStatus(report.status)}</span>
                  <span className="text-xs text-black/45">{formatDate(report.createdAt)}</span>
                </div>
                <p className="mt-1 text-xs text-black/45">{readableStatus(report.type)}</p>
                <p className="mt-1 text-sm text-black/70 line-clamp-2">{report.description}</p>
                {report.targetUser && (
                  <span className="mt-1 inline-block text-xs text-black/50">Candidate: {report.targetUser.displayName ?? report.targetUser.username ?? "—"}</span>
                )}
                {report.targetListing && (
                  <Link href={`/dashboard/listings/${encodeURIComponent(report.targetListing.id)}`} className="mt-1 inline-block text-xs font-medium text-safecrib-green hover:underline">{report.targetListing.title}</Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationsHistorySection({ userId }: { userId: string }) {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [skip, setSkip] = useState(20);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async (offset = 0, append = false) => {
    try {
      setError("");
      const response = unwrapData<NotificationsResponse>(
        await adminFetch<unknown>(
          `/api/v1/admin/users/${encodeURIComponent(userId)}/notifications?skip=${offset}&take=20`,
          { cache: "no-store" },
        ),
      );
      if (append) {
        setItems((current) => [...current, ...response.items]);
      } else {
        setItems(response.items);
      }
      setTotal(response.total);
      setHasMore(offset + 20 < response.total);
      setSkip(offset + 20);
    } catch (loadError) {
      if (loadError instanceof ApiError && (loadError.status === 401 || loadError.status === 403)) {
        window.location.assign("/admin/login?reason=denied");
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Could not load notifications.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [userId]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    void load(skip, true);
  }, [load, skip, loadingMore, hasMore]);

  useEffect(() => {
    void load(0, false);
  }, [load]);

  if (error) {
    return (
      <div>
        <p role="alert" className="rounded-[4px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load(0, false)}
          className="mt-3 rounded-[4px] border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading notification history">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-black/60">No admin notifications have been sent to this user yet.</p>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-black/55">{total} notification{total !== 1 ? "s" : ""}</p>
        <button
          type="button"
          onClick={() => void load(0, false)}
          className="rounded-[4px] border border-black/15 bg-white px-3 py-1.5 text-xs font-medium hover:bg-black/[0.03]"
        >
          Refresh
        </button>
      </div>
      <div className="divide-y divide-black/10">
        {items.map((notification) => {
          const senderName = notification.data?.senderNameSnapshot ?? "SafeCribs Team";
          const senderAvatar = notification.data?.senderAvatarSnapshot ?? null;
          const senderId = notification.data?.senderAdminId;
          return (
            <div key={notification.id} className={`py-3 ${notification.readAt ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <ProfileAvatar
                  src={senderAvatar}
                  alt={`${senderName} profile`}
                  size="small"
                  className="h-8 w-8"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <UserName
                      user={{ id: senderId, displayName: senderName, username: null, role: "ADMIN" }}
                      size="sm"
                      showHandle={false}
                      nameClassName="text-xs font-semibold text-safecrib-black truncate"
                    />
                    <span className="text-xs text-black/50">from SafeCribs</span>
                  </div>
                  <p className="mt-1 text-sm font-semibold text-safecrib-black">{notification.title}</p>
                  <p className="mt-1 text-sm text-black/70 line-clamp-2">{notification.body}</p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-black/45">
                    <span>{formatDate(notification.createdAt)}</span>
                    {notification.readAt ? <span>Read</span> : <span className="text-safecrib-green font-medium">Unread</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-4 w-full rounded-[4px] border border-black/15 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      )}
    </div>
  );
}

function ActivitySection({ user }: { user: UserDetail }) {
  const events = user.trustEvents;
  if (!events?.length) {
    return <p className="text-sm text-black/60">No account events recorded.</p>;
  }
  return (
    <ul className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="border-b border-black/10 py-2 last:border-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-black/45">{event.eventType.replace(/_/g, " ")}</p>
              {event.weight != null && <p className="text-xs text-black/50">Weight: {event.weight}</p>}
            </div>
            <span className="text-xs text-black/45">{formatDate(event.occurredAt)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading section content">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function renderTabContent(user: UserDetail, activeTab: Tab, userId: string) {
  switch (activeTab) {
    case "overview":
      return <OverviewSection user={user} />;
    case "verification":
      return <VerificationSection user={user} />;
    case "listings":
      return <ListingsSection user={user} />;
    case "bookings":
      return <BookingsSection user={user} />;
    case "reports":
      return <ReportsSection user={user} />;
    case "notifications":
      return <NotificationsHistorySection userId={userId} />;
    case "activity":
      return <ActivitySection user={user} />;
    default:
      return null;
  }
}

function availableTabs(user: UserDetail): Tab[] {
  const tabs: Tab[] = ["overview", "verification"];
  if (user.role === "AGENT" || user.role === "LANDLORD") tabs.push("listings");
  tabs.push("bookings", "reports", "notifications", "activity");
  return tabs;
}

export default function AdminUserDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [userId] = useState(() => params.id);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [sendNotificationOpen, setSendNotificationOpen] = useState(false);

  const tabs = useMemo(() => (user ? availableTabs(user) : []) as Tab[], [user]);

  const fetchUser = useCallback(async () => {
    try {
      setError("");
      const response = unwrapData<UserDetail>(
        await adminFetch<unknown>(`/api/v1/admin/users/${encodeURIComponent(userId)}`, { cache: "no-store" }),
      );
      setUser(response);
    } catch (loadError) {
      if (loadError instanceof ApiError && (loadError.status === 401 || loadError.status === 403)) {
        router.replace("/admin/login?reason=denied");
        return;
      }
      if (loadError instanceof ApiError && loadError.status === 404) {
        setError("User not found.");
      } else {
        setError(loadError instanceof Error ? loadError.message : "Could not load user.");
      }
    } finally {
      setLoading(false);
    }
  }, [userId, router]);

  useEffect(() => {
    void fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    if (user) {
      const stage = buildVerificationStage(user.verification);
      seedVerificationCache({
        id: user.id,
        displayName: user.displayName,
        username: user.username,
        role: user.role,
        verification: stage,
        isVerified: user.identityVerified,
      });
    }
  }, [user]);

  const handleNotificationsSent = () => {
    if (user) {
      setUser((current) => {
        if (!current) return current;
        return {
          ...current,
          _count: {
            ...current._count,
            notifications: current._count.notifications + 1,
          },
        };
      });
    }
  };

  if (loading) {
    return (
      <div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-[4px] border border-black/15 bg-white p-2 text-sm font-medium hover:bg-black/[0.03]"
            aria-label="Go back"
          >
            <Icon name="chevron-left" className="h-4 w-4" />
          </button>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">Operations</p>
        </div>
        <div className="mt-6 space-y-5">
          <div className="flex items-start gap-5">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-[4px] border border-black/15 bg-white p-2 text-sm font-medium hover:bg-black/[0.03]"
            aria-label="Go back"
          >
            <Icon name="chevron-left" className="h-4 w-4" />
          </button>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">Operations</p>
        </div>
        <div className="mt-6 rounded-[4px] border border-red-200 bg-red-50 p-6 text-sm text-red-700" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void fetchUser()}
            className="mt-3 font-semibold underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const verificationStatus = getVerificationStatus(user);
  const accountStatus = getAccountStatus(user);
  const displayName = user.displayName ?? user.username ?? "User";
  const reviewHref = `/admin/reviews?userId=${encodeURIComponent(user.id)}`;

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-[4px] border border-black/15 bg-white p-2 text-sm font-medium hover:bg-black/[0.03]"
          aria-label="Go back to users"
        >
          <Icon name="chevron-left" className="h-4 w-4" />
        </button>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">Operations</p>
      </div>

      <header className="mt-6 flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <ProfileAvatar
            src={user.profilePicture}
            alt={`${displayName} profile`}
            size="large"
            className="h-24 w-24"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <UserName
                user={{
                  id: user.id,
                  displayName: user.displayName,
                  username: user.username,
                  role: user.role,
                  verification: null,
                  isVerified: user.identityVerified,
                }}
                size="xl"
                showHandle
                nameClassName="font-medium text-safecrib-black text-2xl"
                handleClassName="text-black/45"
              />
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getRoleColor(user.role)}`}>
                {getRoleLabel(user.role)}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getVerificationColor(verificationStatus)}`}>
                {verificationStatus === "VERIFIED" ? "Verified" : verificationStatus === "PENDING" ? "Pending" : verificationStatus === "REJECTED" ? "Rejected" : "Not submitted"}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getAccountStatusColor(accountStatus)}`}>
                {accountStatus}
              </span>
              {user._count.fraudReportsAssigned > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800" title={`${user._count.fraudReportsAssigned} open report${user._count.fraudReportsAssigned !== 1 ? "s" : ""}`}>
                  <Icon name="alert-triangle" className="h-3 w-3" />
                  {user._count.fraudReportsAssigned}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-black/45">
              Joined {formatDate(user.createdAt)}
              {user.updatedAt && user.updatedAt !== user.createdAt && (
                <span> · Last active {formatDate(user.updatedAt)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setSendNotificationOpen(true)}
            className="rounded-[4px] bg-safecrib-green px-4 py-2 text-sm font-medium text-white hover:bg-[#0a5f47]"
          >
            Send notification
          </button>
          {(user.studentProfile?.status === "PENDING" || user.providerPage?.verificationState === "SUBMITTED") && (
            <Link
              href={reviewHref}
              className="text-center rounded-[4px] border border-black/15 bg-white px-4 py-2 text-sm font-medium text-black/65 hover:bg-black/[0.03]"
            >
              Review submission
            </Link>
          )}
        </div>
      </header>

      <nav className="mt-6 border-b border-black/10" aria-label="User sections">
        <div className="flex flex-wrap -mx-4 gap-0 border-b border-black/10 lg:border-b-0 lg:border-0">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`border-b-2 px-4 py-2 text-sm font-medium whitespace-nowrap ${
                activeTab === tab
                  ? "border-safecrib-green text-safecrib-green"
                  : "border-transparent text-black/50 hover:text-safecrib-black"
              }`}
            >
              {TAB_LABELS[tab]}
              {tab === "reports" && user._count.fraudReportsAssigned > 0 && (
                <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.25 text-xs font-semibold text-red-800">{user._count.fraudReportsAssigned}</span>
              )}
            </button>
          ))}
        </div>
      </nav>

      <section className="mt-6" aria-live="polite">
        {activeTab === "notifications" ? (
          <NotificationsHistorySection userId={user.id} />
        ) : (
          renderTabContent(user, activeTab, user.id)
        )}
      </section>

      <SendNotificationDialog
        open={sendNotificationOpen}
        onClose={() => setSendNotificationOpen(false)}
        recipient={{
          id: user.id,
          displayName: user.displayName,
          username: user.username,
          role: user.role,
          profilePicture: user.profilePicture,
        }}
        onSuccess={() => {
          setSendNotificationOpen(false);
          handleNotificationsSent();
        }}
      />
    </div>
  );
}
