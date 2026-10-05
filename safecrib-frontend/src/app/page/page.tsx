"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { Button } from "@/components/ui/Button";
import { ReviewPendingState } from "@/components/verification/ReviewPendingState";
import { normalizeVerificationStage, VerificationBadge, type VerificationStageResult } from "@/components/verification/VerificationBadge";
import { ApiError, apiFetch, displayName, getCurrentUser, getPersistedVerification, normalizeAccountStatus, normalizePageStatus, setPersistedVerification, unwrapData, type AccountStatus, type PageStatus } from "@/lib/api";

type ProviderPageData = { id?: string; displayName?: string; status?: string; verificationNotes?: string; rejectionReason?: string; reason?: string } | null;
type ListingPhoto = string | { url?: string; mediaId?: string };
type Listing = { id: string; title?: string; description?: string; status?: string; price?: number; discountAmount?: number; discountedPrice?: number; address?: string; campus?: string; photos?: ListingPhoto[]; video?: { mediaId?: string } | null; updatedAt?: string; createdAt?: string };
type User = { id?: string; role?: string; displayName?: unknown; email?: string; verificationStage?: unknown };

function statusLabel(status?: string) {
  return (status || "UNKNOWN").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function priceLabel(amount?: number) {
  return typeof amount === "number" ? `₦${amount.toLocaleString()}` : "Price not set";
}

export default function ProviderWorkspacePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [providerPage, setProviderPage] = useState<ProviderPageData>(null);
  const [studentStatus, setStudentStatus] = useState<AccountStatus>("not_submitted");
  const [listings, setListings] = useState<Listing[]>([]);
  const [verification, setVerification] = useState<VerificationStageResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("safecrib_access_token")) {
      router.replace("/login");
      return;
    }

    void Promise.all([
      getCurrentUser<User>(),
      apiFetch<unknown>("/api/v1/provider-pages/me").then((result) => unwrapData<ProviderPageData>(result)).catch((loadError: unknown) => {
        if (loadError instanceof ApiError && loadError.status === 404) return null;
        throw loadError;
      }),
    ]).then(async ([currentUser, page]) => {
      setUser(currentUser);
      setProviderPage(page);
      const role = String(currentUser.role ?? "").toUpperCase();
      setVerification(normalizeVerificationStage(getPersistedVerification(currentUser.id)));
      if (["STUDENT", "AGENT", "LANDLORD", "ADMIN"].includes(role)) {
        void apiFetch<unknown>("/api/v1/trust/me/verification-stage")
          .then((response) => {
            const stage = normalizeVerificationStage(response);
            if (stage) {
              setPersistedVerification(currentUser.id, response);
              setVerification(stage);
            }
          })
          .catch(() => {
            if (!getPersistedVerification(currentUser.id)) setError("We could not load your verification badge.");
          });
      }
      let currentStudentStatus: AccountStatus = "not_submitted";
      if (role === "STUDENT") {
        const statusResponse = unwrapData<unknown>(
          await apiFetch<unknown>("/api/v1/student-profiles/status"),
        );
        const status = normalizeAccountStatus(statusResponse);
        currentStudentStatus = status;
        setStudentStatus(status);
        if (status === "pending") return;
      }
      if (!page) {
        const requiresStudentProfile = role === "STUDENT"
          && currentStudentStatus === "not_submitted";
        router.replace(requiresStudentProfile
          ? "/profile/complete?reason=provider-workspace"
          : "/page/new");
        return;
      }
      if (String(page.status ?? "").toUpperCase() === "VERIFIED") {
        try {
          const homes = unwrapData<Listing[]>(await apiFetch<unknown>("/api/v1/listings/my"));
          setListings(Array.isArray(homes) ? homes : []);
        } catch (listingError) {
          setError(listingError instanceof Error ? listingError.message : "We could not load your homes.");
        }
      }
    }).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "We could not load your provider workspace.");
    });
  }, [router]);

  const rawPageStatus = String(providerPage?.status ?? "NONE").toUpperCase();
  const pageStatus: PageStatus = normalizePageStatus(rawPageStatus);
  const verified = rawPageStatus === "VERIFIED";
  const setupAvailable = rawPageStatus === "NONE" || rawPageStatus === "DRAFT" || rawPageStatus === "REJECTED";
  const counts = listings.reduce<Record<string, number>>((result, listing) => {
    const status = String(listing.status ?? "UNKNOWN").toUpperCase();
    result[status] = (result[status] ?? 0) + 1;
    return result;
  }, {});

  const providerRole = ["AGENT", "LANDLORD"].includes(String(user?.role ?? "").toUpperCase());
  const studentReviewPending = studentStatus === "pending";
  const providerReviewPending = ["SUBMITTED", "UNDER_REVIEW", "PENDING"].includes(rawPageStatus);
  const hasProviderPage = Boolean(providerPage && (providerPage.id || providerPage.status || providerPage.displayName));
  const canAccessProviderWorkspace = hasProviderPage || providerRole || rawPageStatus !== "NONE";

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
      <DashboardNav onCreatePage={() => router.push(setupAvailable && !studentReviewPending ? "/page/new" : "/page")} pageStatus={pageStatus} canManagePage={canAccessProviderWorkspace && !studentReviewPending} />
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">{studentReviewPending ? "Account review" : "Provider workspace"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-medium text-safecrib-black">{studentReviewPending ? "Your profile is awaiting approval" : providerPage?.displayName || displayName(user?.displayName) || "Manage your homes"}</h1>
              {!studentReviewPending && verification && <VerificationBadge verification={verification} compact iconOnly />}
            </div>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">{studentReviewPending ? "Your student profile is with the SafeCrib review team." : "Manage your provider verification and accommodation listings from one place."}</p>
          </div>
          {verified && <Link href="/page/homes/new"><Button type="button">+ Create a home</Button></Link>}
        </div>

        {error && <div className="mt-7 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert"><p>{error}</p><button type="button" onClick={() => window.location.reload()} className="mt-2 font-medium underline">Reload workspace</button></div>}

        {studentReviewPending ? <ReviewPendingState subject="student profile" /> : providerReviewPending ? <ReviewPendingState subject="provider Page" /> : !canAccessProviderWorkspace && <div className="mt-7 border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><p className="font-medium">Create your provider Page first</p><p className="mt-1 leading-6">This workspace unlocks after you create an agent or landlord Page. The Page is the access gate, not the student role.</p><div className="mt-4 flex flex-wrap gap-3"><Link href="/page/new" className="inline-block font-medium underline">Create provider Page</Link><Link href="/dashboard" className="inline-block font-medium underline">Return to dashboard</Link></div></div>}

        {canAccessProviderWorkspace && !studentReviewPending && !providerReviewPending && <>
          <section aria-labelledby="verification-heading" className="mt-8 border border-black/10 bg-white p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">Provider verification</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <h2 id="verification-heading" className="text-xl font-medium text-safecrib-black">{providerPage?.displayName || "Provider Page"}</h2>
                  {verification && <VerificationBadge verification={verification} compact iconOnly />}
                </div>
              </div>
              {setupAvailable && <Link href="/page/new"><Button type="button" variant="secondary">{rawPageStatus === "REJECTED" ? "Update and resubmit" : rawPageStatus === "DRAFT" ? "Continue verification" : "Set up provider Page"}</Button></Link>}
            </div>
            {rawPageStatus === "SUBMITTED" && <p className="mt-4 border-t border-black/10 pt-4 text-sm leading-6 text-black/60">Your provider Page is with the review team. Home creation will unlock after approval.</p>}
            {rawPageStatus === "REJECTED" && <div className="mt-4 border-t border-red-100 pt-4 text-sm leading-6 text-red-700"><p>Your Page needs an update before it can be approved.</p>{(providerPage?.verificationNotes || providerPage?.rejectionReason || providerPage?.reason) && <p className="mt-1">Review note: {providerPage.verificationNotes || providerPage.rejectionReason || providerPage.reason}</p>}</div>}
            {verified && <p className="mt-4 border-t border-emerald-100 pt-4 text-sm leading-6 text-emerald-800">Verified provider. You can create and submit homes for review.</p>}
          </section>

          {verified && <>
            <section aria-label="Home counts" className="mt-6 grid grid-cols-2 gap-px border border-black/10 bg-black/10 sm:grid-cols-4">
              {[ ["All homes", listings.length], ["Drafts", counts.DRAFT ?? 0], ["In review", (counts.SUBMITTED ?? 0) + (counts.UNDER_REVIEW ?? 0)], ["Verified", counts.VERIFIED ?? 0] ].map(([label, count]) => <div key={label} className="bg-white px-4 py-4"><p className="text-xs text-black/50">{label}</p><p className="mt-1 text-2xl font-medium text-safecrib-black">{count}</p></div>)}
            </section>

            <section aria-labelledby="homes-heading" className="mt-9">
              <div className="flex items-end justify-between gap-4 border-b border-black/10 pb-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-safecrib-green">Inventory</p><h2 id="homes-heading" className="mt-1 text-xl font-medium text-safecrib-black">Your homes</h2></div><button type="button" onClick={() => window.location.reload()} className="text-sm font-medium text-safecrib-green hover:underline">Refresh</button></div>
              {listings.length === 0 ? <div className="py-12 text-center"><p className="text-sm text-black/60">No homes added yet.</p><Link href="/page/homes/new" className="mt-3 inline-block text-sm font-medium text-safecrib-green hover:underline">Create your first home</Link></div> : <div className="divide-y divide-black/10">{listings.map((listing) => {
                const photo = listing.photos?.[0];
                const image = typeof photo === "string" ? photo : photo?.url;
                const canEdit = ["DRAFT", "REJECTED"].includes(String(listing.status ?? "").toUpperCase());
                return <article key={listing.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center">
                  {image && <Image src={image} alt="" width={112} height={84} unoptimized className="h-20 w-28 shrink-0 object-cover" />}
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium text-safecrib-black">{listing.title || "Untitled home"}</h3><span className="border border-black/15 px-2 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-black/55">{statusLabel(listing.status)}</span></div><p className="mt-1 text-sm text-black/55">{listing.address || listing.campus || "Location not set"}</p><p className="mt-2 text-sm font-medium text-safecrib-black">{priceLabel(listing.discountedPrice ?? listing.price)}{typeof listing.discountAmount === "number" && listing.discountAmount > 0 && <span className="ml-2 text-xs font-normal text-black/45">Base {priceLabel(listing.price)}</span>}</p></div>
                  <div className="flex shrink-0 gap-4 text-sm font-medium"><Link href={`/page/homes/new?id=${encodeURIComponent(listing.id)}`} className="text-safecrib-green hover:underline">{canEdit ? "Edit" : "View"}</Link><span className="text-black/50">{listing.photos?.length ?? 0} photos{listing.video ? " · video" : ""}</span></div>
                </article>;
              })}</div>}
            </section>
          </>}
        </>}
      </section>
    </main>
  );
}