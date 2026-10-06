"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { EmptyListingsIllustration } from "@/components/branding/EmptyListingsIllustration";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { RestrictedActionModal } from "@/components/dashboard/RestrictedActionModal";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { normalizeVerificationStage, VerificationBadge, type VerificationStageResult } from "@/components/verification/VerificationBadge";
import { apiFetch, cachedApiFetch, cachedCurrentUser, clearClientCache, clearSession, displayName, getAuthenticatedDisplayName, getCachedCurrentUser, getCachedMediaUrl, getPersistedVerification, isUnauthorizedError, normalizeAccountStatus, normalizePageStatus, primeCurrentUserCache, resolveMediaUrl, setPersistedVerification, subscribeClientCacheUpdates, unwrapData, type AccountStatus, type PageStatus } from "@/lib/api";

type Listing = { id: string; ownerId?: string; title?: string; description?: string; price?: number; address?: string; campus?: string; photos?: string[]; images?: string[]; likeCount?: number; viewCount?: number; followedPage?: boolean; likedByCurrentUser?: boolean; providerRecommendationCount?: number; providerTrustScore?: number | null; providerActiveDays?: number; recommendationScore?: number };
type Profile = { id?: string; displayName?: unknown; email?: string; role?: string; profilePicture?: string; studentProfileStatus?: unknown; studentProfile?: { profilePicture?: string }; verification?: { stage?: string; badge?: string; badgeColor?: "green" | "blue" | "gold"; riskBlocked?: boolean; eligible?: boolean } | null; verificationStage?: unknown };
type StudentProfile = { profilePicture?: string } | null;
type ProviderPage = { id?: string; status?: string; profilePicture?: string; rejectionReason?: string; reason?: string } | null;

function accountMessage(status: AccountStatus, action: string) {
  if (status === "pending" || status === "not_submitted") return `Your account is still under review. You'll be able to ${action} once it's approved.`;
  if (status === "rejected") return "Your account submission wasn't approved. Please update and resubmit your profile.";
  return null;
}

function emailNameFallback(email?: string) {
  const username = email?.split("@")[0]?.split("+")[0]?.replace(/[._-]+/g, " ").trim();
  return username ? username.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) : "";
}

function resolveAccountName(profile: Profile | null) {
  return displayName(profile) || getAuthenticatedDisplayName() || emailNameFallback(profile?.email);
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [verification, setVerification] = useState<VerificationStageResult | null>(null);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("not_submitted");
  const [pageStatus, setPageStatus] = useState<PageStatus>("none");
  const [listings, setListings] = useState<Listing[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [recommendedProviderIds, setRecommendedProviderIds] = useState<string[]>([]);
  const [recommendationsLoaded, setRecommendationsLoaded] = useState(false);
  const [pendingEngagement, setPendingEngagement] = useState<Set<string>>(() => new Set());
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [openSupportCount, setOpenSupportCount] = useState(0);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [resolvedListingImages, setResolvedListingImages] = useState<Record<string, string | null>>({});

  useEffect(() => subscribeClientCacheUpdates(({ path, value }) => {
    if (path === "/api/v1/users/me" || path === "/api/v1/auth/me") {
      const currentUser = unwrapData<Profile | null>(value);
      if (!currentUser) return;
      setProfile({ ...currentUser, displayName: displayName(currentUser) || getAuthenticatedDisplayName() });
      const userVerification = currentUser.verification ?? getPersistedVerification(currentUser.id);
      if (userVerification) {
        const normalized = normalizeVerificationStage(userVerification);
        if (normalized) setVerification(normalized);
      }
      if (["STUDENT", "UNVERIFIED"].includes(String(currentUser.role ?? "").toUpperCase())) {
        setAccountStatus(normalizeAccountStatus(currentUser.studentProfileStatus));
      }
      const picture = currentUser.profilePicture ?? currentUser.studentProfile?.profilePicture;
      const cachedPicture = getCachedMediaUrl(picture);
      if (cachedPicture) setProfileImage(cachedPicture);
      if (picture) void resolveMediaUrl(picture).then((url) => { if (url) setProfileImage(url); });
      return;
    }

    if (path === "/api/v1/student-profiles/me") {
      const student = unwrapData<StudentProfile>(value);
      const currentUser = getCachedCurrentUser<Profile>();
      const picture = currentUser?.profilePicture ?? student?.profilePicture;
      const cachedPicture = getCachedMediaUrl(picture);
      if (cachedPicture) setProfileImage(cachedPicture);
      if (picture) void resolveMediaUrl(picture).then((url) => { if (url) setProfileImage(url); });
      return;
    }

    if (path === "/api/v1/provider-pages/me") {
      const page = unwrapData<ProviderPage>(value);
      setPageStatus(normalizePageStatus(page?.status));
      const currentUser = getCachedCurrentUser<Profile>();
      const picture = currentUser?.profilePicture ?? page?.profilePicture;
      const cachedPicture = getCachedMediaUrl(picture);
      if (cachedPicture) setProfileImage(cachedPicture);
      if (picture) void resolveMediaUrl(picture).then((url) => { if (url) setProfileImage(url); });
      return;
    }

    if (path === "/api/v1/listings") {
      const listings = unwrapData<Listing[]>(value);
      setListings(Array.isArray(listings) ? listings : []);
      return;
    }

    if (path === "/api/v1/listings/bookmarks") {
      const bookmarks = unwrapData<Listing[]>(value);
      setBookmarkedIds(Array.isArray(bookmarks) ? bookmarks.map((listing) => listing.id) : []);
      return;
    }

    if (path === "/api/v1/trust/me/recommendations") {
      const recommendations = unwrapData<string[]>(value);
      setRecommendedProviderIds(Array.isArray(recommendations) ? recommendations : []);
      setRecommendationsLoaded(true);
      return;
    }

    if (path === "/api/v1/support/conversations") {
      const conversations = unwrapData<unknown[]>(value);
      setOpenSupportCount(Array.isArray(conversations)
        ? conversations.filter((conversation) => typeof conversation === "object" && conversation !== null && "status" in conversation && String(conversation.status).toUpperCase() === "OPEN").length
        : 0);
    }
  }), []);

  useEffect(() => {
    setDashboardLoading(true);
    if (!localStorage.getItem("safecrib_access_token")) {
      router.replace("/login");
      setDashboardLoading(false);
      return;
    }

    const cachedProfile = getCachedCurrentUser<Profile>();
    if (cachedProfile) {
      setProfile({ ...cachedProfile, displayName: resolveAccountName(cachedProfile) });
      setVerification(normalizeVerificationStage(getPersistedVerification(cachedProfile.id)));
      const cachedPicture = getCachedMediaUrl(cachedProfile.profilePicture ?? cachedProfile.studentProfile?.profilePicture);
      if (cachedPicture) setProfileImage(cachedPicture);
    }
    else {
      const tokenName = getAuthenticatedDisplayName();
      if (tokenName) setProfile({ displayName: tokenName });
    }

    void cachedCurrentUser<Profile>().then(async (currentUser) => {
      let user = currentUser;
      if (!displayName(user)) user = { ...user, displayName: resolveAccountName(user) };
      primeCurrentUserCache(user);
      setProfile({ ...user, displayName: displayName(user) || getAuthenticatedDisplayName() });
      const role = String(user.role ?? "").toUpperCase();
      const immediateVerification = user.verification ?? getPersistedVerification(user.id);
      if (immediateVerification) {
        const normalized = normalizeVerificationStage(immediateVerification);
        if (normalized) setVerification((current) => current ?? normalized);
      } else {
        setVerification((current) => current ?? normalizeVerificationStage(getPersistedVerification(user.id)));
      }
      if (["AGENT", "LANDLORD"].includes(role) && user.id) {
        const today = new Date().toISOString().slice(0, 10);
        const activityKey = `safecrib-provider-active-day:${user.id}`;
        if (localStorage.getItem(activityKey) !== today) {
          void apiFetch("/api/v1/trust/me/activity", { method: "POST" })
            .then(() => localStorage.setItem(activityKey, today))
            .catch(() => setActionMessage("We could not record today’s activity. Please refresh to retry."));
        }
      }
      const studentMode = ["STUDENT", "UNVERIFIED"].includes(role);
      const studentStatusRequest = studentMode
        ? apiFetch<unknown>("/api/v1/student-profiles/status")
            .then(unwrapData<unknown>)
            .then(normalizeAccountStatus)
            .catch(() => null)
        : Promise.resolve(null);
      const verificationRequest = ["STUDENT", "AGENT", "LANDLORD", "ADMIN"].includes(role) && !user.verification
        ? apiFetch<unknown>("/api/v1/trust/me/verification-stage")
            .then((response) => {
              const stage = normalizeVerificationStage(response);
              if (stage) setPersistedVerification(user.id, response);
              return stage;
            })
            .catch(() => null)
        : Promise.resolve(null);
      void verificationRequest.then((stage) => {
        if (stage) setVerification(stage);
      });
      const [studentProfile, providerPage, homes, bookmarks, conversations, recommendations] = await Promise.all([
        studentMode ? cachedApiFetch<StudentProfile>("/api/v1/student-profiles/me").catch(() => null) : Promise.resolve(null),
        cachedApiFetch<ProviderPage>("/api/v1/provider-pages/me").catch(() => null),
        cachedApiFetch<Listing[]>("/api/v1/listings").catch(() => []),
        role === "STUDENT" ? cachedApiFetch<Listing[]>("/api/v1/listings/bookmarks").catch(() => []) : Promise.resolve([]),
        cachedApiFetch<unknown>("/api/v1/support/conversations").catch(() => []),
        role === "STUDENT"
          ? cachedApiFetch<string[]>("/api/v1/trust/me/recommendations")
              .then((value) => {
                setRecommendationsLoaded(true);
                return value;
              })
              .catch((error: unknown) => {
                setActionMessage(error instanceof Error ? error.message : "We could not load your recommendations.");
                return [];
              })
          : Promise.resolve([]),
      ]);
      return { user, studentProfile, studentStatusRequest, providerPage, homes, bookmarks, conversations, recommendations };
    }).then(({ user, studentProfile, studentStatusRequest, providerPage, homes, bookmarks, conversations, recommendations }) => {
      setProfile({ ...user, displayName: displayName(user) || getAuthenticatedDisplayName() });
      const role = String(user.role ?? "").toUpperCase();
      const studentMode = ["STUDENT", "UNVERIFIED"].includes(role);
      const profileStatus = normalizeAccountStatus(user.studentProfileStatus);
      const providerVerified = ["AGENT", "LANDLORD"].includes(role) && String(providerPage?.status ?? "").toUpperCase() === "VERIFIED";
      const studentProfileData = unwrapData<StudentProfile>(studentProfile);
      const pictureReference = user.profilePicture ?? user.studentProfile?.profilePicture ?? studentProfileData?.profilePicture ?? providerPage?.profilePicture;
      setAccountStatus(providerVerified ? "approved" : ["AGENT", "LANDLORD"].includes(role) ? "pending" : normalizeAccountStatus(profileStatus));
      if (studentMode) {
        void studentStatusRequest.then((latestStatus) => {
          if (!latestStatus) return;
          clearClientCache("/api/v1/student-profiles/status");
          setAccountStatus(latestStatus);
          if (latestStatus === "not_submitted") {
            void apiFetch("/api/v1/notifications/student-profile-reminder", { method: "POST" })
              .catch((reminderError: unknown) => console.error("Could not add the student profile reminder to notifications.", reminderError));
          }
        });
      }
      if (pictureReference) {
        const cachedPicture = getCachedMediaUrl(pictureReference);
        if (cachedPicture) setProfileImage(cachedPicture);
        void resolveMediaUrl(pictureReference).then((url) => {
          if (url) setProfileImage(url);
        }).catch(() => undefined);
      }
      setPageStatus(normalizePageStatus(providerPage?.status));
      setListings(Array.isArray(homes) ? homes : []);
      setBookmarkedIds(Array.isArray(bookmarks) ? bookmarks.map((listing) => listing.id) : []);
      setRecommendedProviderIds(Array.isArray(recommendations) ? recommendations : []);
      const conversationList = Array.isArray(conversations) ? conversations : [];
      setOpenSupportCount(conversationList.filter((conversation) => typeof conversation === "object" && conversation !== null && "status" in conversation && String(conversation.status).toUpperCase() === "OPEN").length);
    }).catch((loadError: unknown) => {
      if (isUnauthorizedError(loadError)) {
        clearSession();
        router.replace("/login?reason=session-expired");
        setDashboardLoading(false);
        return;
      }
      setProfile(null);
      setVerification(null);
      setAccountStatus("not_submitted");
      setPageStatus("none");
      setListings([]);
      setBookmarkedIds([]);
    }).finally(() => {
      setDashboardLoading(false);
    });
  }, [router]);

  useEffect(() => {
    const nextImageMap: Record<string, string | null> = {};
    listings.forEach((listing) => {
      const imageReference = listing.photos?.[0] ?? listing.images?.[0];
      if (!imageReference) return;
      const cachedImage = getCachedMediaUrl(imageReference);
      if (cachedImage) {
        nextImageMap[listing.id] = cachedImage;
        return;
      }
      void resolveMediaUrl(imageReference).then((resolvedUrl) => {
        if (resolvedUrl) {
          setResolvedListingImages((current) => ({ ...current, [listing.id]: resolvedUrl }));
        }
      }).catch(() => undefined);
    });
    if (Object.keys(nextImageMap).length > 0) {
      setResolvedListingImages((current) => ({ ...current, ...nextImageMap }));
    }
  }, [listings]);

  useEffect(() => {
    if (accountStatus !== "pending" || !["STUDENT", "UNVERIFIED"].includes(String(profile?.role ?? "").toUpperCase())) return;

    let checkingStatus = false;
    const refreshStatus = async () => {
      if (checkingStatus || document.visibilityState === "hidden") return;
      checkingStatus = true;
      try {
        const response = unwrapData<unknown>(
          await apiFetch<unknown>("/api/v1/student-profiles/status"),
        );
        if (normalizeAccountStatus(response) !== "pending") {
          clearClientCache();
          window.location.reload();
        }
      } catch {
        // Keep the current dashboard state if a temporary status check fails.
      } finally {
        checkingStatus = false;
      }
    };

    window.addEventListener("focus", refreshStatus);
    document.addEventListener("visibilitychange", refreshStatus);
    const interval = window.setInterval(refreshStatus, 30_000);
    return () => {
      window.removeEventListener("focus", refreshStatus);
      document.removeEventListener("visibilitychange", refreshStatus);
      window.clearInterval(interval);
    };
  }, [accountStatus, profile?.role]);

  const toggleBookmark = async (listingId: string) => {
    const isSaved = bookmarkedIds.includes(listingId);
    const message = accountMessage(accountStatus, isSaved ? "remove this saved listing" : "save this listing");
    if (message) {
      setActionMessage(message);
      return;
    }
    try {
      await apiFetch(`/api/v1/listings/${listingId}/bookmark`, { method: isSaved ? "DELETE" : "POST" });
      setBookmarkedIds((current) => isSaved ? current.filter((id) => id !== listingId) : [...current, listingId]);
    } catch {
      setActionMessage("We could not update your saved listings. Please try again.");
    }
  };

  const toggleLike = async (listing: Listing) => {
    const actionKey = `like:${listing.id}`;
    if (pendingEngagement.has(actionKey)) return;
    const liked = listing.likedByCurrentUser === true;
    setPendingEngagement((current) => new Set(current).add(actionKey));
    try {
      await apiFetch(`/api/v1/listings/${encodeURIComponent(listing.id)}/like`, { method: liked ? "DELETE" : "POST" });
      setListings((current) => current.map((item) => item.id === listing.id
        ? { ...item, likedByCurrentUser: !liked, likeCount: Math.max(0, (item.likeCount ?? 0) + (liked ? -1 : 1)) }
        : item));
    } catch {
      setActionMessage("We could not update your like. Please try again.");
    } finally {
      setPendingEngagement((current) => {
        const next = new Set(current);
        next.delete(actionKey);
        return next;
      });
    }
  };

  const toggleRecommendation = async (providerId: string) => {
    const actionKey = `recommend:${providerId}`;
    if (pendingEngagement.has(actionKey)) return;
    const recommended = recommendedProviderIds.includes(providerId);
    setPendingEngagement((current) => new Set(current).add(actionKey));
    try {
      await apiFetch(`/api/v1/trust/users/${encodeURIComponent(providerId)}/recommendation`, { method: recommended ? "DELETE" : "POST" });
      clearClientCache("/api/v1/listings", "/api/v1/trust/me/recommendations");
      setRecommendedProviderIds((current) => recommended
        ? current.filter((id) => id !== providerId)
        : [...current, providerId]);
      setListings((current) => current.map((item) => {
        if (item.ownerId !== providerId) return item;
        const recommendationCount = Math.max(0, (item.providerRecommendationCount ?? 0) + (recommended ? -1 : 1));
        const trust = Math.max(0, Math.min(100, item.providerTrustScore ?? 50));
        const activeDays = Math.max(0, Math.min(30, item.providerActiveDays ?? 0));
        const recommendationSignal = Math.min(100, Math.log1p(recommendationCount) / Math.log1p(50) * 100);
        return {
          ...item,
          providerRecommendationCount: recommendationCount,
          recommendationScore: Math.round(trust * 0.45 + activeDays / 30 * 25 + recommendationSignal * 0.3),
        };
      }).sort((a, b) => (b.recommendationScore ?? 0) - (a.recommendationScore ?? 0)));
    } catch {
      setActionMessage("We could not update your recommendation. Please try again.");
    } finally {
      setPendingEngagement((current) => {
        const next = new Set(current);
        next.delete(actionKey);
        return next;
      });
    }
  };

  const openPage = () => router.push(pageStatus === "none" ? "/page/new" : "/page");
  const accountName = resolveAccountName(profile);
  const canCreateProviderPage = ["AGENT", "LANDLORD"].includes(String(profile?.role ?? "").toUpperCase());

  if (dashboardLoading) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
        <DashboardNav onCreatePage={openPage} pageStatus={pageStatus} canManagePage={canCreateProviderPage} supportCount={openSupportCount} />
        <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="flex items-center gap-4">
              <Skeleton className="h-16 w-16 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
            <Skeleton className="h-10 w-36" />
          </div>
          <div className="mx-auto mt-8 max-w-3xl space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="overflow-hidden rounded-2xl border border-black/10 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-64 w-full rounded-xl" />
                    <div className="flex items-center justify-between gap-3 pt-2">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-5 w-16" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
      <DashboardNav onCreatePage={openPage} pageStatus={pageStatus} canManagePage={canCreateProviderPage} supportCount={openSupportCount} />
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div className="flex items-center gap-4">
            <Link href="/profile" aria-label="View your profile" title="View your profile" className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safecrib-green">
              <ProfileAvatar src={profileImage} seed={profile?.id ?? profile?.email ?? "safecrib-member-avatar"} alt={`${accountName || "Your"} profile photo`} size="medium" />
            </Link>
            <div>
              {accountName && <div className="flex flex-wrap items-center gap-3"><h1 className="font-display text-3xl font-bold text-safecrib-green sm:text-4xl">{accountName}</h1>{verification && <VerificationBadge verification={verification} compact iconOnly />}</div>}
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm font-medium">
            {canCreateProviderPage && <Link href={pageStatus === "none" ? "/page/new" : "/page"} className="text-safecrib-green hover:underline">{pageStatus === "none" ? "Create a provider Page" : "View my Page"}</Link>}
          </div>
        </div>
        {listings.length === 0 && <div className="mt-8 flex min-h-64 items-center justify-center rounded-xl border border-black/10 bg-white px-5 py-8 sm:min-h-72" aria-label="No listings are available yet"><EmptyListingsIllustration /></div>}
        <div className="mx-auto mt-8 max-w-3xl space-y-4">
          {listings.map((listing) => {
            const imageReference = listing.photos?.[0] ?? listing.images?.[0];
            const image = resolvedListingImages[listing.id] ?? imageReference ?? null;
            const ownerLabel = listing.ownerId ? "Verified provider" : "Verified home";
            return <article key={listing.id} className="overflow-hidden rounded-2xl border border-black/10 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.04)]">
              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  <ProfileAvatar src={profileImage} seed={listing.ownerId ?? listing.id ?? "home-listing-avatar"} alt={listing.title ?? "Home listing"} size="small" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-bold text-safecrib-black">{listing.title ?? "Verified home"}</span>
                      <span className="text-xs text-black/45">·</span>
                      <span className="text-xs text-black/45">{ownerLabel}</span>
                    </div>
                    <div className="relative">
                      <button type="button" aria-label="More options" onClick={() => setOpenMenuId((current) => current === listing.id ? null : listing.id)} className="rounded-full p-1 text-black/50 hover:bg-black/[0.04]">
                        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
                      </button>
                      {openMenuId === listing.id && (
                        <div className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.12)]">
                          <Link href={`/dashboard/listings/${listing.id}`} onClick={() => setOpenMenuId(null)} className="block border-b border-black/5 px-3 py-2.5 text-sm text-black/75 transition hover:bg-black/[0.03]">View details</Link>
                          {listing.ownerId && <Link href={`/profile/${encodeURIComponent(listing.ownerId)}`} onClick={() => setOpenMenuId(null)} className="block border-b border-black/5 px-3 py-2.5 text-sm text-black/75 transition hover:bg-black/[0.03]">View provider</Link>}
                          {["UNVERIFIED", "STUDENT"].includes(String(profile?.role ?? "").toUpperCase()) && (
                            <button type="button" onClick={() => { void toggleBookmark(listing.id); setOpenMenuId(null); }} className="block w-full border-b border-black/5 px-3 py-2.5 text-left text-sm text-black/75 transition hover:bg-black/[0.03]">
                              {bookmarkedIds.includes(listing.id) ? "Remove save" : "Save listing"}
                            </button>
                          )}
                          {listing.ownerId && (
                            <button type="button" onClick={() => { void toggleRecommendation(listing.ownerId); setOpenMenuId(null); }} disabled={String(profile?.role ?? "").toUpperCase() !== "STUDENT" || listing.ownerId === profile?.id || pendingEngagement.has(`recommend:${listing.ownerId}`)} className="block w-full px-3 py-2.5 text-left text-sm text-black/75 transition hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-50">
                              {recommendedProviderIds.includes(listing.ownerId) ? "Remove recommendation" : "Recommend provider"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-black/60">{listing.address ?? listing.campus ?? "Location details available"}</p>
                  <p className="mt-3 text-[15px] leading-7 text-black/75">{listing.description ?? "View this home for more details."}</p>
                  {image && <div className="mt-4 overflow-hidden rounded-2xl border border-black/10 bg-black/5"><Image src={image} alt={listing.title ?? "Listing"} width={1200} height={700} className="h-[270px] w-full object-cover sm:h-[360px]" /></div>}
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-black/10 pt-3 text-sm text-black/60">
                    <button type="button" onClick={() => void toggleLike(listing)} disabled={listing.ownerId === profile?.id || pendingEngagement.has(`like:${listing.id}`)} aria-pressed={listing.likedByCurrentUser === true} className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-50">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 11h9.2a3 3 0 0 0 2.9-2.2l2-7A3 3 0 0 0 18.2 8H14l.7-3.2A2.4 2.4 0 0 0 12.4 2L7 10v11Z" /></svg>
                      <span>{listing.likeCount ?? 0}</span>
                    </button>
                    <Link href={`/dashboard/listings/${listing.id}#comments`} className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 transition hover:bg-black/[0.04]">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /></svg>
                      <span>{listing.viewCount ?? 0}</span>
                    </Link>
                    <button type="button" onClick={() => listing.ownerId && void toggleRecommendation(listing.ownerId)} disabled={!listing.ownerId || String(profile?.role ?? "").toUpperCase() !== "STUDENT" || !recommendationsLoaded || listing.ownerId === profile?.id || pendingEngagement.has(`recommend:${listing.ownerId}`)} aria-pressed={Boolean(listing.ownerId && recommendedProviderIds.includes(listing.ownerId))} title={String(profile?.role ?? "").toUpperCase() === "STUDENT" ? "Recommend this provider to students" : "Student accounts can recommend providers"} className="inline-flex items-center gap-2 rounded-full px-2 py-1.5 transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-50">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m13 2-3 8h7l-6 12 2-9H6l7-11Z" /></svg>
                      <span>{listing.providerRecommendationCount ?? 0}</span>
                    </button>
                    <Link href={`/dashboard/listings/${listing.id}`} className="rounded-full bg-safecrib-green px-3 py-1.5 text-xs font-medium text-safecrib-white hover:bg-[#0a5f47]">View details</Link>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {listing.ownerId && <Link href={`/profile/${encodeURIComponent(listing.ownerId)}`} className="text-xs font-medium text-safecrib-green hover:underline">View provider</Link>}
                    {["UNVERIFIED", "STUDENT"].includes(String(profile?.role ?? "").toUpperCase()) && <Button type="button" variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => void toggleBookmark(listing.id)}>{bookmarkedIds.includes(listing.id) ? "Saved" : "Save"}</Button>}
                  </div>
                  <p className="mt-3 text-sm font-medium text-safecrib-black">{typeof listing.price === "number" ? `₦${listing.price.toLocaleString()}` : "Price available in details"}</p>
                </div>
              </div>
            </article>;
          })}
        </div>
      </section>
      <RestrictedActionModal message={actionMessage} onClose={() => setActionMessage(null)} />
    </main>
  );
}
