"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { adminFetch, ApiError, unwrapData } from "@/lib/api";

type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
type EntityType = "student_profile" | "provider_page";
type HomeListing = {
  id: string;
  title: string;
  address: string | null;
  campus: string | null;
  price: number;
  status: string;
  createdAt: string;
  updatedAt: string;
};
type ReviewSubmission = {
  id: string;
  email: string;
  tier: "STUDENT" | "LANDLORD";
  reviewType: "SIGNUP" | "CREATE_PAGE";
  status: ReviewStatus;
  entityType: EntityType;
  entityId: string | null;
  submittedData: Record<string, unknown>;
  rejectionReason: string | null;
  submittedAt: string;
  createdAt: string;
};

function category(item: ReviewSubmission) { if (item.entityType === "student_profile") return "Student account"; return item.submittedData.providerType === "LANDLORD" ? "Landlord account" : "Agent account"; }
function name(item: ReviewSubmission) { const value = item.submittedData.displayName; return typeof value === "string" && value ? value : item.email; }

export default function AdminQueuePage() {
  const router = useRouter();
  const [items, setItems] = useState<ReviewSubmission[]>([]);
  const [homes, setHomes] = useState<HomeListing[]>([]);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus>("PENDING");
  const [loading, setLoading] = useState(true);
  const [homesLoading, setHomesLoading] = useState(true);
  const [error, setError] = useState("");
  const [homesError, setHomesError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = unwrapData<unknown>(await adminFetch<unknown>(`/api/v1/admin/review-queue?status=${statusFilter}`));
      const queue = Array.isArray(response) ? response : typeof response === "object" && response !== null && "items" in response && Array.isArray(response.items) ? response.items : [];
      setItems(queue as ReviewSubmission[]);
    } catch (loadError) {
      if (loadError instanceof ApiError && (loadError.status === 401 || loadError.status === 403)) {
        router.replace(`/admin/login?reason=${loadError.status === 403 ? "denied" : "session-expired"}`);
        return;
      }
      setError(loadError instanceof ApiError && loadError.status === 403 ? "This account is not allowed to view the review queue." : "We could not load the review queue.");
    } finally { setLoading(false); }
  }, [router, statusFilter]);

  const loadHomes = useCallback(async () => {
    setHomesLoading(true);
    setHomesError("");
    try {
      const response = unwrapData<unknown>(
        await adminFetch<unknown>("/api/v1/listings/admin/pending-review"),
      );
      setHomes(Array.isArray(response) ? response as HomeListing[] : []);
    } catch (loadError) {
      if (loadError instanceof ApiError && (loadError.status === 401 || loadError.status === 403)) {
        router.replace(`/admin/login?reason=${loadError.status === 403 ? "denied" : "session-expired"}`);
        return;
      }
      setHomesError("We could not load homes awaiting review.");
    } finally {
      setHomesLoading(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadHomes(); }, [loadHomes]);

  return (
    <div>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">Operations</p><h1 className="mt-2 text-3xl font-medium">Review queue</h1><p className="mt-2 text-sm text-black/60">Student profiles, provider Pages, and homes waiting for review.</p></div><div className="flex items-center gap-3"><label className="text-sm font-medium">Status<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ReviewStatus)} className="ml-2 rounded-[4px] border border-black/15 bg-white px-3 py-2 font-normal"><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></label><button type="button" onClick={() => { void load(); void loadHomes(); }} className="rounded-[4px] border border-black/15 bg-white px-4 py-2 text-sm font-medium hover:bg-black/[0.03]">Refresh queues</button></div></div>
      {error && <p className="mt-6 rounded-[4px] border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
      <div className="mt-8 overflow-hidden rounded-[8px] border border-black/10 bg-white">
        {loading ? <p className="p-6 text-sm text-black/55">Loading submissions...</p> : items.length === 0 ? <p className="p-6 text-sm text-black/55">No pending submissions.</p> : <div className="divide-y divide-black/10">{items.map((item) => <Link key={item.id} href={`/admin/reviews/${encodeURIComponent(item.id)}`} className="block p-5 hover:bg-[#f7faf8]"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="font-medium">{name(item)}</p><p className="mt-1 text-sm text-black/55">{item.email}{typeof item.submittedData.schoolOfStudy === "string" ? ` · ${item.submittedData.schoolOfStudy}` : typeof item.submittedData.providerType === "string" ? ` · ${item.submittedData.providerType}` : ""}</p></div><div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em]"><span className="text-black/45">{category(item)}</span><span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{item.status}</span></div></div><p className="mt-3 text-xs text-black/45">Submitted {new Date(item.submittedAt || item.createdAt).toLocaleString()}</p></Link>)}</div>}
      </div>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">Home moderation</p>
            <h2 className="mt-2 text-2xl font-medium">Homes awaiting review</h2>
            <p className="mt-2 text-sm text-black/60">Review submitted homes and approve them for the marketplace or return them with a reason.</p>
          </div>
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{homes.length} pending</span>
        </div>
        {homesError && <p className="mt-5 rounded-[4px] border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{homesError}</p>}
        <div className="mt-5 overflow-hidden rounded-[8px] border border-black/10 bg-white">
          {homesLoading ? <p className="p-6 text-sm text-black/55">Loading homes...</p> : homes.length === 0 ? <p className="p-6 text-sm text-black/55">No homes are waiting for review.</p> : <div className="divide-y divide-black/10">{homes.map((home) => <Link key={home.id} href={`/admin/homes/${encodeURIComponent(home.id)}`} className="block p-5 hover:bg-[#f7faf8]"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="font-medium">{home.title}</p><p className="mt-1 text-sm text-black/55">{home.address || home.campus || "Location not provided"}{home.address && home.campus ? ` · ${home.campus}` : ""}</p></div><div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.12em]"><span className="font-medium normal-case tracking-normal text-black/65">₦{home.price.toLocaleString()}</span><span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">{home.status.replaceAll("_", " ")}</span></div></div><p className="mt-3 text-xs text-black/45">Submitted {new Date(home.updatedAt || home.createdAt).toLocaleString()}</p></Link>)}</div>}
        </div>
      </section>
    </div>
  );
}
