"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminFetch, ApiError, unwrapData } from "@/lib/api";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { UserName } from "@/components/common/UserName";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";

const ROLES = ["STUDENT", "AGENT", "LANDLORD", "UNVERIFIED"] as const;
const VERIFICATION_STATUSES = ["VERIFIED", "PENDING", "REJECTED", "NOT_SUBMITTED"] as const;
const ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
const SORT_OPTIONS = [
  { value: "createdAt", label: "Newest", order: "desc" as const },
  { value: "createdAt", label: "Oldest", order: "asc" as const },
  { value: "createdAt", label: "Last active", order: "desc" },
  { value: "displayName", label: "Name A-Z", order: "asc" },
] as const;

type Role = (typeof ROLES)[number];
type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
type AccountStatus = (typeof ACCOUNT_STATUSES)[number];
type SortOption = (typeof SORT_OPTIONS)[number];

interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  username: string | null;
  role: Role;
  emailVerified: boolean;
  identityVerified: boolean;
  trustScore: number | null;
   createdAt: string;
   updatedAt: string | null;
   profilePicture: string | null;
  studentProfile: {
    id: string;
    status: string;
    schoolOfStudy: string | null;
    profilePicture: string | null;
  } | null;
  providerPage: {
    id: string;
    verificationState: string;
    displayName: string | null;
    profilePicture: string | null;
  } | null;
  verification: {
    stage: string;
    badge: string;
    badgeColor: string;
    riskBlocked: boolean;
    kind?: string | null;
  } | null;
  _count: {
    fraudReportsFiled: number;
    fraudReportsAssigned: number;
  };
}

interface UsersResponse {
  items: AdminUser[];
  total: number;
  nextCursor: number | null;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
}

function getVerificationStatus(user: AdminUser): VerificationStatus {
  if (user.identityVerified) return "VERIFIED";
  if (user.emailVerified) return "PENDING";
  if (user.studentProfile?.status === "REJECTED" || user.providerPage?.verificationState === "REJECTED") return "REJECTED";
  return "NOT_SUBMITTED";
}

function getAccountStatus(user: AdminUser): AccountStatus {
  return user.emailVerified ? "ACTIVE" : "SUSPENDED";
}

function getRoleLabel(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function getVerificationLabel(status: VerificationStatus) {
  const labels: Record<VerificationStatus, string> = {
    VERIFIED: "Verified",
    PENDING: "Pending",
    REJECTED: "Rejected",
    NOT_SUBMITTED: "Not submitted",
  };
  return labels[status];
}

function getVerificationColor(status: VerificationStatus) {
  const colors: Record<VerificationStatus, string> = {
    VERIFIED: "bg-emerald-100 text-emerald-800",
    PENDING: "bg-amber-100 text-amber-800",
    REJECTED: "bg-red-100 text-red-800",
    NOT_SUBMITTED: "bg-gray-100 text-gray-700",
  };
  return colors[status];
}

function getAccountStatusColor(status: AccountStatus) {
  return status === "ACTIVE" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800";
}

function getRoleColor(role: Role) {
  const colors: Record<Role, string> = {
    STUDENT: "bg-emerald-100 text-emerald-800",
    AGENT: "bg-amber-100 text-amber-800",
    LANDLORD: "bg-blue-100 text-blue-800",
    UNVERIFIED: "bg-gray-100 text-gray-700",
  };
  return colors[role];
}

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "ALL">("ALL");
  const [verificationFilter, setVerificationFilter] = useState<VerificationStatus | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<AccountStatus | "ALL">("ALL");
  const [flaggedFilter, setFlaggedFilter] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortOption["value"]>("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInitialMount = useRef(true);

  const activeFilters = useMemo(() => {
    const filters: Array<{ key: string; label: string; value: string }> = [];
    if (debouncedSearch) filters.push({ key: "search", label: "Search", value: debouncedSearch });
    if (roleFilter !== "ALL") filters.push({ key: "role", label: "Role", value: getRoleLabel(roleFilter) });
    if (verificationFilter !== "ALL") filters.push({ key: "verification", label: "Verification", value: getVerificationLabel(verificationFilter) });
    if (statusFilter !== "ALL") filters.push({ key: "status", label: "Status", value: statusFilter });
    if (flaggedFilter) filters.push({ key: "flagged", label: "Flagged", value: "Yes" });
    if (dateFrom) filters.push({ key: "from", label: "From", value: dateFrom });
    if (dateTo) filters.push({ key: "to", label: "To", value: dateTo });
    return filters;
  }, [debouncedSearch, roleFilter, verificationFilter, statusFilter, flaggedFilter, dateFrom, dateTo]);

  const buildUrl = useCallback((params: Record<string, string | number | boolean | undefined>) => {
    const urlParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "" && value !== "ALL") {
        urlParams.set(key, String(value));
      }
    });
    return `/admin/users${urlParams.toString() ? `?${urlParams.toString()}` : ""}`;
  }, []);

  const loadUsers = useCallback(async (cursor?: number, append = false) => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (roleFilter !== "ALL") params.set("role", roleFilter);
    if (verificationFilter !== "ALL") params.set("verification", verificationFilter);
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    if (flaggedFilter) params.set("flagged", "true");
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    params.set("sort", sortBy);
    params.set("order", sortOrder);
    params.set("take", "20");
    if (cursor !== undefined) params.set("cursor", String(cursor));

    try {
      setError("");
      const response = unwrapData<UsersResponse>(
        await adminFetch<unknown>(`/api/v1/admin/users?${params.toString()}`, { cache: "no-store" }),
      );
      if (append) {
        setUsers((current) => [...current, ...response.items]);
      } else {
        setUsers(response.items);
      }
      setTotal(response.total);
      setNextCursor(response.nextCursor);
    } catch (loadError) {
      if (loadError instanceof ApiError && (loadError.status === 401 || loadError.status === 403)) {
        router.replace(`/admin/login?reason=${loadError.status === 403 ? "denied" : "session-expired"}`);
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Could not load users.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedSearch, roleFilter, verificationFilter, statusFilter, flaggedFilter, dateFrom, dateTo, sortBy, sortOrder, router]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  useEffect(() => {
    const cursor = searchParams.get("cursor");
    const initialCursor = cursor ? parseInt(cursor, 10) : 0;
    const initialSearch = searchParams.get("search") ?? "";
    const initialRole = searchParams.get("role") as Role | null;
    const initialVerification = searchParams.get("verification") as VerificationStatus | null;
    const initialStatus = searchParams.get("status") as AccountStatus | null;
    const initialFlagged = searchParams.get("flagged") === "true";
    const initialFrom = searchParams.get("from") ?? "";
    const initialTo = searchParams.get("to") ?? "";
    const initialSort = searchParams.get("sort") as SortOption["value"] | null;
    const initialOrder = searchParams.get("order") as "asc" | "desc" | null;

    if (isInitialMount.current) {
      isInitialMount.current = false;
      setSearch(initialSearch);
      setDebouncedSearch(initialSearch);
      if (initialRole) setRoleFilter(initialRole);
      if (initialVerification) setVerificationFilter(initialVerification);
      if (initialStatus) setStatusFilter(initialStatus);
      setFlaggedFilter(initialFlagged);
      setDateFrom(initialFrom);
      setDateTo(initialTo);
      if (initialSort) setSortBy(initialSort);
      if (initialOrder) setSortOrder(initialOrder);
      void loadUsers(initialCursor);
    }
  }, [loadUsers]);

  const handleFilterChange = useCallback((key: string, value: string | boolean) => {
    const params: Record<string, string | number | boolean | undefined> = {
      search: debouncedSearch || undefined,
      role: roleFilter !== "ALL" ? roleFilter : undefined,
      verification: verificationFilter !== "ALL" ? verificationFilter : undefined,
      status: statusFilter !== "ALL" ? statusFilter : undefined,
      flagged: flaggedFilter || undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      sort: sortBy,
      order: sortOrder,
    };
     (params as Record<string, string | boolean>)[key] = value;
    router.push(buildUrl(params), { scroll: false });
  }, [debouncedSearch, roleFilter, verificationFilter, statusFilter, flaggedFilter, dateFrom, dateTo, sortBy, sortOrder, router, buildUrl]);

  const clearFilters = useCallback(() => {
    setSearch("");
    setDebouncedSearch("");
    setRoleFilter("ALL");
    setVerificationFilter("ALL");
    setStatusFilter("ALL");
    setFlaggedFilter(false);
    setDateFrom("");
    setDateTo("");
    router.push("/admin/users", { scroll: false });
  }, [router]);

  const loadMore = useCallback(() => {
    if (nextCursor !== null && !loadingMore) {
      setLoadingMore(true);
      void loadUsers(nextCursor, true);
    }
  }, [nextCursor, loadingMore, loadUsers]);

  const activeFilterCount = activeFilters.length;

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">Operations</p>
          <h1 className="mt-2 text-3xl font-medium">Users</h1>
          <p className="mt-2 text-sm text-black/60">
            {total} user{total !== 1 ? "s" : ""}{activeFilterCount > 0 ? ` (${total} total)` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadUsers(0)}
          disabled={loading}
          className="rounded-[4px] border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03] disabled:opacity-50"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-6 rounded-[4px] border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
          <button type="button" onClick={() => void loadUsers(0)} className="ml-3 font-semibold underline">Retry</button>
        </p>
      )}

      <section className="mt-6" aria-labelledby="filters-heading">
        <h2 id="filters-heading" className="sr-only">Filters</h2>
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <label htmlFor="search" className="sr-only">Search users</label>
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-black/35" />
            <input
              id="search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, username, email, phone…"
              className="w-full rounded-[4px] border border-black/15 bg-white pl-10 pr-4 py-2 text-sm focus:border-safecrib-green focus:outline-none"
              aria-describedby="search-hint"
            />
            <span id="search-hint" className="sr-only">Minimum 2 characters</span>
          </div>

          <select
            value={roleFilter}
            onChange={(e) => handleFilterChange("role", e.target.value === "ALL" ? "ALL" : e.target.value)}
            className="rounded-[4px] border border-black/15 bg-white px-3 py-2 text-sm font-normal"
          >
            <option value="ALL">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{getRoleLabel(r)}s</option>
            ))}
          </select>

          <select
            value={verificationFilter}
            onChange={(e) => handleFilterChange("verification", e.target.value === "ALL" ? "ALL" : e.target.value)}
            className="rounded-[4px] border border-black/15 bg-white px-3 py-2 text-sm font-normal"
          >
            <option value="ALL">All verification</option>
            {VERIFICATION_STATUSES.map((v) => (
              <option key={v} value={v}>{getVerificationLabel(v)}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => handleFilterChange("status", e.target.value === "ALL" ? "ALL" : e.target.value)}
            className="rounded-[4px] border border-black/15 bg-white px-3 py-2 text-sm font-normal"
          >
            <option value="ALL">All status</option>
            {ACCOUNT_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <label className="inline-flex items-center gap-2 rounded-[4px] border border-black/15 bg-white px-3 py-2 text-sm font-normal cursor-pointer">
            <input
              type="checkbox"
              checked={flaggedFilter}
              onChange={(e) => handleFilterChange("flagged", e.target.checked)}
              className="rounded border-black/15 text-safecrib-green focus:ring-safecrib-green"
            />
            Flagged only
          </label>

          <div className="flex items-center gap-2">
            <label htmlFor="from" className="sr-only">From date</label>
            <input
              id="from"
              type="date"
              value={dateFrom}
              onChange={(e) => handleFilterChange("from", e.target.value)}
              className="rounded-[4px] border border-black/15 bg-white px-3 py-2 text-sm"
            />
            <span className="text-black/45">to</span>
            <label htmlFor="to" className="sr-only">To date</label>
            <input
              id="to"
              type="date"
              value={dateTo}
              onChange={(e) => handleFilterChange("to", e.target.value)}
              className="rounded-[4px] border border-black/15 bg-white px-3 py-2 text-sm"
            />
          </div>

          <select
            value={`${sortBy}:${sortOrder}`}
              onChange={(e) => {
                const [sort = "createdAt", order = "desc"] = e.target.value.split(":");
                handleFilterChange("sort", sort);
                handleFilterChange("order", order);
              }}
              className="rounded-[4px] border border-black/15 bg-white px-3 py-2 text-sm font-normal"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={`${opt.value}:${opt.order ?? "desc"}`} value={`${opt.value}:${opt.order ?? "desc"}`}>
                  {opt.label}
                </option>
              ))}
          </select>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-[4px] border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
            >
              Clear all ({activeFilterCount})
            </button>
          )}
        </div>

        {activeFilterCount > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Active filters">
            {activeFilters.map((filter) => (
              <span key={filter.key} className="inline-flex items-center gap-1.5 rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-black/65">
                {filter.label}: {filter.value}
                <button
                  type="button"
                  onClick={() => handleFilterChange(filter.key, filter.key === "flagged" ? false : "ALL")}
                  className="ml-1 rounded-full p-0.5 hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safecrib-green"
                  aria-label={`Remove ${filter.label} filter`}
                >
                  <Icon name="x" className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 overflow-hidden rounded-[8px] border border-black/10 bg-white">
        {loading ? (
          <div className="divide-y divide-black/10" role="status" aria-label="Loading users">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-5 animate-pulse">
                <div className="flex gap-4">
                  <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-60" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center">
            <Icon name="users" className="mx-auto h-12 w-12 text-black/20" />
            <h3 className="mt-4 font-medium">No users found</h3>
            <p className="mt-1 text-sm text-black/55">
              {activeFilterCount > 0
                ? "Try adjusting your filters or "
                : "No users match the current criteria. "}
            <button
              type="button"
              onClick={clearFilters}
              className="font-semibold text-safecrib-green underline underline-offset-2"
            >
              {activeFilterCount > 0 ? "clear all filters" : "view all users"}
            </button>
          </p>
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full" role="grid">
                <thead>
                  <tr className="border-b border-black/10 bg-black/[0.02] text-left text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Verification</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3">Last active</th>
                    <th className="px-4 py-3">Flags</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-[#f7faf8]">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/users/${encodeURIComponent(user.id)}`}
                          className="flex items-center gap-3 min-w-0"
                        >
                          <ProfileAvatar
                            src={user.profilePicture}
                            alt={`${user.displayName ?? user.username ?? "User"} profile`}
                            size="small"
                            className="h-10 w-10"
                          />
                          <div className="min-w-0">
                            <UserName
                              user={{
                                id: user.id,
                                displayName: user.displayName,
                                username: user.username,
                                role: user.role,
                              }}
                              size="sm"
                              showHandle
                              nameClassName="font-medium text-black truncate"
                              handleClassName="text-black/45"
                            />
                            <p className="mt-0.5 text-xs text-black/45 truncate">{user.email}</p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getRoleColor(user.role)}`}>
                          {getRoleLabel(user.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getVerificationColor(getVerificationStatus(user))}`}>
                          {getVerificationLabel(getVerificationStatus(user))}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getAccountStatusColor(getAccountStatus(user))}`}>
                          {getAccountStatus(user)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-black/65 whitespace-nowrap">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-sm text-black/45 whitespace-nowrap">
                        {formatRelativeTime(user.updatedAt ?? user.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        {user._count.fraudReportsAssigned > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800" title={`${user._count.fraudReportsAssigned} open report${user._count.fraudReportsAssigned !== 1 ? "s" : ""} against this user`}>
                            <Icon name="alert-triangle" className="h-3 w-3" />
                            {user._count.fraudReportsAssigned}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden divide-y divide-black/10">
              {users.map((user) => (
                <Link
                  key={user.id}
                  href={`/admin/users/${encodeURIComponent(user.id)}`}
                  className="block p-4"
                >
                  <div className="flex items-start gap-3">
                    <ProfileAvatar
                      src={user.profilePicture}
                      alt={`${user.displayName ?? user.username ?? "User"} profile`}
                      size="small"
                      className="h-12 w-12 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <UserName
                          user={{
                            id: user.id,
                            displayName: user.displayName,
                            username: user.username,
                            role: user.role,
                          }}
                          size="sm"
                          showHandle
                          nameClassName="font-medium text-black"
                          handleClassName="text-black/45"
                        />
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${getRoleColor(user.role)}`}>
                          {getRoleLabel(user.role)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-black/45 truncate">{user.email}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getVerificationColor(getVerificationStatus(user))}`}>
                          {getVerificationLabel(getVerificationStatus(user))}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${getAccountStatusColor(getAccountStatus(user))}`}>
                          {getAccountStatus(user)}
                        </span>
                        <span className="text-black/45">Joined {formatDate(user.createdAt)}</span>
                        {user._count.fraudReportsAssigned > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                            <Icon name="alert-triangle" className="h-3 w-3" />
                            {user._count.fraudReportsAssigned}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
        {nextCursor !== null && !loading && (
          <div className="border-t border-black/10 p-4">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full rounded-[4px] border border-black/15 bg-white px-4 py-3 text-sm font-medium disabled:opacity-50"
            >
              {loadingMore ? "Loading..." : "Load more users"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}