"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { BackHomeLink } from "@/components/ui/BackHomeLink";
import { normalizeVerificationStage, VerificationBadge, type VerificationStageResult } from "@/components/verification/VerificationBadge";
import { apiFetch, cachedApiFetch, cachedCurrentUser, clearSession, displayName, getCachedCurrentUser, getCachedMediaUrl, getPersistedVerification, isUnauthorizedError, normalizeAccountStatus, resolveMediaUrl, setPersistedVerification, subscribeClientCacheUpdates, unwrapData } from "@/lib/api";

type User = {
  id?: string;
  email?: string;
  displayName?: unknown;
  role?: string;
  profilePicture?: string;
  createdAt?: string;
  studentProfileStatus?: unknown;
  followerCount?: number;
  verificationStage?: unknown;
  verification?: unknown;
};

type StudentProfile = {
  displayName?: string;
  schoolOfStudy?: string;
  courseOfStudy?: string;
  level?: string;
  profilePicture?: string;
  dateOfBirth?: string;
  gender?: string;
  phoneNumber?: string;
  emergencyContact?: string;
  socialLinks?: Record<string, string>;
  status?: string;
} | null;

type ProviderPage = {
  displayName?: string;
  businessName?: string;
  providerType?: string;
  description?: string;
  profilePicture?: string;
  phone?: string;
  email?: string;
  businessAddress?: string;
  additionalContactNumbers?: string[];
  payoutAccounts?: Array<{ provider?: string; accountName?: string; accountNumber?: string }>;
  socialLinks?: Record<string, string>;
  status?: string;
  verifiedAt?: string;
} | null;

type Listing = {
  id: string;
  title?: string;
  description?: string;
  price?: number;
  discountedPrice?: number;
  status?: string;
  campus?: string;
  address?: string;
  createdAt?: string;
  photos?: Array<string | { url?: string }>;
  likeCount?: number;
  viewCount?: number;
};
type StudentEngagement = { totalInteractions: number; follows: number; likes: number; comments: number; recommendations: number };
type ProviderStats = { trustScore: number | null; recommendationCount: number; followerCount: number; activeDays: number };

function readable(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "";
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString(undefined, { year: "numeric", month: "long" });
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return <div className="min-w-0 border-t border-black/10 py-3 first:border-t-0"><dt className="text-xs font-medium uppercase tracking-[0.12em] text-black/45">{label}</dt><dd className="mt-1 break-words text-sm leading-6 text-safecrib-black">{value}</dd></div>;
}

function SafeLinks({ links }: { links?: Record<string, string> }) {
  const entries = Object.entries(links ?? {}).filter(([, value]) => typeof value === "string" && /^https?:\/\//i.test(value));
  if (entries.length === 0) return null;
  return <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-black/10 pt-4">{entries.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noreferrer" className="text-sm font-medium text-safecrib-green hover:underline">{readable(label) || "Website"}</a>)}</div>;
}

function ProfileStat({ label, value }: { label: string; value: string | number }) {
  return <div className="min-w-[8.5rem] shrink-0 snap-start border-l border-white/15 pl-4 first:border-l-0 first:pl-0 sm:min-w-0 sm:shrink">
    <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-white/55">{label}</p>
    <p className="mt-1 truncate text-lg font-semibold text-white">{value}</p>
  </div>;
}

function ListingGrid({ listings, own = false }: { listings: Listing[]; own?: boolean }) {
  if (listings.length === 0) return <p className="mt-5 rounded-xl border border-dashed border-black/15 bg-white px-5 py-8 text-center text-sm text-black/55">{own ? "Your homes and posts will appear here." : "There are no public posts to show yet."}</p>;
  return <div className="mt-5 grid gap-4 sm:grid-cols-2">
    {listings.map((listing) => {
      const photo = listing.photos?.[0];
      const image = typeof photo === "string" ? photo : photo?.url;
      return <article key={listing.id} className="overflow-hidden rounded-xl border border-black/10 bg-white">
        {image && <Image src={image} alt="" width={720} height={440} unoptimized className="h-44 w-full object-cover" />}
        <div className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-medium text-safecrib-black">{listing.title || "Untitled home"}</h3>
            {own && listing.status && <span className="rounded-full bg-black/[0.05] px-2.5 py-1 text-xs font-medium text-black/60">{readable(listing.status)}</span>}
          </div>

          <p className="mt-2 line-clamp-2 text-sm leading-5 text-black/55">{listing.description || "View this home for details."}</p>
          <p className="mt-3 font-semibold text-safecrib-black">{typeof (listing.discountedPrice ?? listing.price) === "number" ? `₦${(listing.discountedPrice ?? listing.price)?.toLocaleString()}` : "Price on request"}</p>
          <p className="mt-1 text-xs text-black/45">{listing.address || listing.campus || ""}</p>
          {listing.status === "VERIFIED" && <p className="mt-2 text-xs text-black/50">{listing.viewCount ?? 0} views · {listing.likeCount ?? 0} likes</p>}
          <Link href={`/dashboard/listings/${encodeURIComponent(listing.id)}`} className="mt-4 inline-flex text-sm font-semibold text-safecrib-green hover:underline">View home <span aria-hidden="true" className="ml-1">→</span></Link>
        </div>
      </article>;
    })}
  </div>;
}

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [student, setStudent] = useState<StudentProfile>(null);
  const [provider, setProvider] = useState<ProviderPage>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [studentEngagement, setStudentEngagement] = useState<StudentEngagement | null>(null);
  const [providerStats, setProviderStats] = useState<ProviderStats | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationStageResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => subscribeClientCacheUpdates(({ path, value }) => {
    if (path === "/api/v1/users/me" || path === "/api/v1/auth/me") {
      const currentUser = unwrapData<User | null>(value);
      if (currentUser) {
        setUser(currentUser);
        const cachedPicture = getCachedMediaUrl(currentUser.profilePicture);
        if (cachedPicture) setAvatarUrl(cachedPicture);
        if (currentUser.profilePicture) {
          void resolveMediaUrl(currentUser.profilePicture).then((url) => {
            if (url) setAvatarUrl(url);
          });
        }
      }
      return;
    }
    if (path === "/api/v1/student-profiles/me") {
      const studentProfile = unwrapData<StudentProfile>(value);
      setStudent(studentProfile);
      const picture = getCachedCurrentUser<User>()?.profilePicture ?? studentProfile?.profilePicture;
      const cachedPicture = getCachedMediaUrl(picture);
      if (cachedPicture) setAvatarUrl(cachedPicture);
      if (picture) void resolveMediaUrl(picture).then(setAvatarUrl);
      return;
    }
    if (path === "/api/v1/provider-pages/me") {
      const providerPage = unwrapData<ProviderPage>(value);
      setProvider(providerPage);
      const picture = getCachedCurrentUser<User>()?.profilePicture ?? providerPage?.profilePicture;
      const cachedPicture = getCachedMediaUrl(picture);
      if (cachedPicture) setAvatarUrl(cachedPicture);
      if (picture) void resolveMediaUrl(picture).then(setAvatarUrl);
      return;
    }
    if (path === "/api/v1/listings/my") {
      const ownListings = unwrapData<Listing[]>(value);
      setListings(Array.isArray(ownListings) ? ownListings : []);
      return;
    }
    if (path === "/api/v1/users/me/engagement-stats") {
      setStudentEngagement(unwrapData<StudentEngagement | null>(value));
    }
  }), []);

  useEffect(() => {
    if (!localStorage.getItem("safecrib_access_token")) {
      router.replace("/login");
      return;
    }

    const cachedUser = getCachedCurrentUser<User>();
    if (cachedUser) {
      setUser(cachedUser);
      const cachedPicture = getCachedMediaUrl(cachedUser.profilePicture);
      if (cachedPicture) setAvatarUrl(cachedPicture);
      setVerification(normalizeVerificationStage(getPersistedVerification(cachedUser.id)));
    }

    let active = true;
    void cachedCurrentUser<User>().then(async (currentUser) => {
      if (!active) return;
      setUser(currentUser);
      const role = String(currentUser.role ?? "").toUpperCase();
      const immediateVerification = currentUser.verification ?? getPersistedVerification(currentUser.id);
      if (immediateVerification) {
        const normalized = normalizeVerificationStage(immediateVerification);
        if (normalized) setVerification((current) => current ?? normalized);
      } else {
        setVerification((current) => current ?? normalizeVerificationStage(getPersistedVerification(currentUser.id)));
      }
      const verificationRequest = ["STUDENT", "AGENT", "LANDLORD", "ADMIN"].includes(role) && !currentUser.verification
        ? apiFetch<unknown>("/api/v1/trust/me/verification-stage")
            .then((response) => {
              const stage = normalizeVerificationStage(response);
              if (stage) setPersistedVerification(currentUser.id, response);
              return stage;
            })
            .catch(() => null)
        : Promise.resolve(null);
      void verificationRequest.then((stage) => {
        if (active && stage) setVerification(stage);
      });
      const isStudent = ["UNVERIFIED", "STUDENT"].includes(role);
      const isProvider = ["AGENT", "LANDLORD"].includes(role);
      const [studentProfile, providerPage, ownListings, studentStats, providerDiscovery] = await Promise.all([
        isStudent
          ? cachedApiFetch<unknown>("/api/v1/student-profiles/me").then(unwrapData<StudentProfile>)
          : Promise.resolve(null),
        isProvider
          ? cachedApiFetch<unknown>("/api/v1/provider-pages/me").then(unwrapData<ProviderPage>)
          : Promise.resolve(null),
        isProvider
          ? cachedApiFetch<unknown>("/api/v1/listings/my").then(unwrapData<Listing[]>)
          : Promise.resolve([]),
        role === "STUDENT"
          ? cachedApiFetch<unknown>("/api/v1/users/me/engagement-stats").then(unwrapData<StudentEngagement>).catch(() => null)
          : Promise.resolve(null),
        isProvider && currentUser.id
          ? cachedApiFetch<unknown>(`/api/v1/trust/users/${encodeURIComponent(currentUser.id)}/discovery-stats`).then(unwrapData<ProviderStats>).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (!active) return;
      setStudent(studentProfile);
      setProvider(providerPage);
      setListings(Array.isArray(ownListings) ? ownListings : []);
      setStudentEngagement(studentStats);
      setProviderStats(providerDiscovery);
      const picture = currentUser.profilePicture ?? studentProfile?.profilePicture ?? providerPage?.profilePicture;
      if (picture) {
        const cachedPicture = getCachedMediaUrl(picture);
        if (cachedPicture) setAvatarUrl(cachedPicture);
        void resolveMediaUrl(picture).then((resolvedPicture) => {
          if (active && resolvedPicture) setAvatarUrl(resolvedPicture);
        }).catch(() => undefined);
      }
    }).catch((loadError: unknown) => {
      if (isUnauthorizedError(loadError)) {
        clearSession();
        router.replace("/login?reason=session-expired");
        return;
      }
      if (active) setError(loadError instanceof Error ? loadError.message : "We could not load your profile.");
    });
    return () => { active = false; };
  }, [router]);

  const role = String(user?.role ?? "").toUpperCase();
  const studentStatus = normalizeAccountStatus(user?.studentProfileStatus);
  const name = displayName(user) || displayName(student) || displayName(provider) || "Your profile";
  const accountLabel = role === "UNVERIFIED" || role === "STUDENT" ? readable(studentStatus) : readable(role);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f2f5f3] pb-24 md:pb-8">
      <DashboardNav onCreatePage={() => router.push("/page/new")} pageStatus="none" canManagePage={["AGENT", "LANDLORD", "ADMIN"].includes(role)} />
      <section className="mx-auto w-full max-w-6xl px-0 py-4 sm:px-8 sm:py-10">
        <div className="flex items-center justify-between gap-4">
          <div className="px-4 sm:px-0"><BackHomeLink /></div>
          <span className="pr-4 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-black/40 sm:pr-0">Trust profile</span>
        </div>
        <section className="relative mt-4 overflow-hidden rounded-none border-y border-[#2a6652] bg-[#123b2f] shadow-[0_26px_70px_rgba(10,54,40,0.2)] sm:mt-6 sm:rounded-[1.75rem] sm:border" aria-labelledby="profile-heading">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:32px_32px]" />
          <div className="relative px-5 pb-5 pt-6 sm:px-8 sm:pb-7 sm:pt-8">
            <div className="flex items-center justify-between gap-4 border-b border-white/15 pb-4">
              <div className="flex items-center gap-3 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[#a8e7cb]"><span className="flex h-7 w-7 items-center justify-center border border-[#a8e7cb]/50 text-[0.55rem]">SC</span><span>Trust passport</span></div>
              <span className="font-mono text-[0.6rem] tracking-[0.16em] text-white/40">{user?.id ? `ID ${user.id.slice(0, 8).toUpperCase()}` : "ID RECORD"}</span>
            </div>
            <div className="mt-7 flex flex-col gap-6 sm:flex-row sm:items-center">
              <ProfileAvatar src={avatarUrl} seed={user?.id ?? user?.email ?? "safecrib-member-avatar"} alt={`${name} profile`} size="large" className="border-8 border-[#123b2f] ring-1 ring-[#a8e7cb]/40" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 id="profile-heading" className="break-words font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">{name}</h1>
                  {verification && <VerificationBadge verification={verification} compact iconOnly />}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/60"><span className="text-[#a8e7cb]">{accountLabel}</span><span aria-hidden="true">/</span>{dateLabel(user?.createdAt) && <span>Member since {dateLabel(user?.createdAt)}</span>}</div>
              </div>
              <Link href="/settings" className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 border border-white/25 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-[#a8e7cb] hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8e7cb] sm:w-auto">
                <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m12.5 3.5 4 4M4 16l3.5-.7L16.7 6a1.7 1.7 0 0 0-2.4-2.4L5.1 12.8 4 16Z" /><path d="M3.5 18h13" /></svg>
                Edit record
              </Link>
            </div>
            <div className="mt-8 -mx-1 flex snap-x gap-6 overflow-x-auto border-t border-white/15 pt-5 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-4">
              <ProfileStat label="Trust stage" value={verification ? readable(verification.stage) : "Building"} />
              <ProfileStat label="Followers" value={providerStats?.followerCount ?? user?.followerCount ?? 0} />
              <ProfileStat label={role === "STUDENT" ? "Interactions" : "Homes"} value={role === "STUDENT" ? studentEngagement?.totalInteractions ?? 0 : listings.length} />
            </div>
          </div>
        </section>

        {error && <p role="alert" className="mt-6 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

        <div className="mt-8 grid gap-10 lg:mt-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.85fr)]">
          <div className="order-2 min-w-0 space-y-10 px-4 sm:px-0 lg:order-1">
            <section aria-labelledby="about-heading">
              <div className="mt-2 flex items-end justify-between gap-4 border-b border-black/10 pb-4">
                <h2 id="about-heading" className="font-display text-2xl font-bold tracking-tight text-safecrib-black">About you</h2>
              </div>
              <dl className="mt-3 grid gap-x-8 sm:grid-cols-2">
                <Detail label="Email address" value={user?.email} />
                <Detail label="Account type" value={readable(role)} />
                <Detail label="Account status" value={accountLabel} />
                {student && <>
                  <Detail label="School" value={student.schoolOfStudy} />
                  <Detail label="Course of study" value={student.courseOfStudy} />
                  <Detail label="Level" value={student.level} />
                  <Detail label="Phone number" value={student.phoneNumber} />
                  <Detail label="Gender" value={readable(student.gender)} />
                  <Detail label="Date of birth" value={student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString() : ""} />
                  <Detail label="Emergency contact" value={student.emergencyContact} />
                </>}
                {provider && <>
                  <Detail label="Business name" value={provider.businessName} />
                  <Detail label="Provider type" value={readable(provider.providerType)} />
                  <Detail label="Contact number" value={provider.phone} />
                  <Detail label="Business email" value={provider.email} />
                  <Detail label="Business address" value={provider.businessAddress} />
                  <Detail label="Additional contact numbers" value={provider.additionalContactNumbers?.join(", ")} />
                </>}
              </dl>
              {provider?.description && <p className="mt-5 max-w-2xl border-l-2 border-safecrib-green/35 pl-4 text-sm leading-7 text-black/65">{provider.description}</p>}
              {student?.socialLinks && <div className="mt-5"><SafeLinks links={student.socialLinks} /></div>}
              {provider?.socialLinks && <div className="mt-5"><SafeLinks links={provider.socialLinks} /></div>}
            </section>

            <section aria-labelledby="posts-heading">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">Activity</p>
              <div className="mt-2 flex items-end justify-between gap-4 border-b border-black/10 pb-4">
                <h2 id="posts-heading" className="font-display text-2xl font-bold tracking-tight text-safecrib-black">{["AGENT", "LANDLORD"].includes(role) ? "Your homes and posts" : "Your posts"}</h2>
              </div>
              {["AGENT", "LANDLORD"].includes(role)
                ? <ListingGrid listings={listings} own />
                : <div className="mt-5 border border-dashed border-black/15 bg-white px-5 py-10 text-center text-sm text-black/50">No activity yet.</div>}
            </section>
          </div>

          <aside className="order-1 min-w-0 space-y-5 px-4 sm:px-0 lg:order-2">
            <section className="overflow-hidden border-l-2 border-safecrib-green bg-white p-6 shadow-[0_14px_36px_rgba(11,12,14,0.06)]" aria-labelledby="trust-heading">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-safecrib-green">Trust ledger</p><h2 id="trust-heading" className="mt-2 text-2xl font-semibold text-safecrib-black">{verification ? readable(verification.stage) : "Your trust journey"}</h2></div>
                {verification && <VerificationBadge verification={verification} compact iconOnly />}
              </div>
              {verification?.riskBlocked && <p className="mt-5 border-l-2 border-[#c28a20] pl-3 text-sm leading-6 text-[#8a5d00]">Your advanced badge progress is paused while your account is under review.</p>}
              {verification?.criteria?.length ? <ul className="mt-6 space-y-3 border-t border-black/10 pt-5">{verification.criteria.slice(0, 4).map((criterion) => <li key={criterion.key} className="flex items-center justify-between gap-3 text-sm"><span className="text-black/60">{criterion.label}</span><span className={criterion.met ? "text-safecrib-green" : "text-black/35"}>{criterion.met ? "Verified" : "In progress"}</span></li>)}</ul> : <p className="mt-6 border-t border-black/10 pt-5 text-sm text-black/55">Complete your profile and verified actions to build your trust record.</p>}
              {verification?.nextMilestone && <p className="mt-5 text-xs leading-5 text-black/45">Next milestone: {verification.nextMilestone}</p>}
            </section>

            {(role === "STUDENT" && studentEngagement) && <section className="border-t border-black/10 pt-5" aria-label="Private student engagement"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">Private to you</p><h2 className="mt-1 text-lg font-semibold text-safecrib-black">Your engagement</h2><div className="mt-4 grid grid-cols-2 gap-4"><div><p className="text-xs text-black/50">Interactions</p><p className="mt-1 text-2xl font-semibold text-safecrib-black">{studentEngagement.totalInteractions}</p></div><div><p className="text-xs text-black/50">Follows</p><p className="mt-1 text-2xl font-semibold text-safecrib-black">{studentEngagement.follows}</p></div></div></section>}
            {["AGENT", "LANDLORD"].includes(role) && providerStats && <section className="border-t border-black/10 pt-5" aria-label="Public provider engagement"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">Public activity</p><h2 className="mt-1 text-lg font-semibold text-safecrib-black">Your provider reach</h2><div className="mt-4 grid grid-cols-3 gap-3"><div><p className="text-xs text-black/50">Recs</p><p className="mt-1 text-2xl font-semibold text-safecrib-black">{providerStats.recommendationCount}</p></div><div><p className="text-xs text-black/50">Likes</p><p className="mt-1 text-2xl font-semibold text-safecrib-black">{listings.reduce((sum, listing) => sum + (listing.likeCount ?? 0), 0)}</p></div><div><p className="text-xs text-black/50">Followers</p><p className="mt-1 text-2xl font-semibold text-safecrib-black">{providerStats.followerCount}</p></div></div></section>}
          </aside>
        </div>

        {student && studentStatus !== "approved" && (
          <div className="mt-6 flex flex-col justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center">
            <p className="text-sm leading-6 text-amber-900">Complete or update your student profile to finish account verification.</p>
            <Link href="/profile/complete" className="shrink-0 text-sm font-semibold text-amber-900 underline underline-offset-2">Update student profile</Link>
          </div>
        )}
      </section>
    </main>
  );
}
