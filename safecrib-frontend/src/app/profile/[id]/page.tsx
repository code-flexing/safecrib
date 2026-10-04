"use client";

import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { PageLoader } from "@/components/loading/PageLoader";
import { BackHomeLink } from "@/components/ui/BackHomeLink";
import { Icon } from "@/components/ui/Icon";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { apiFetch, cachedApiFetch, clearSession, getCachedCurrentUser, isUnauthorizedError, resolveMediaUrl, subscribeClientCacheUpdates, unwrapData } from "@/lib/api";

type Listing = {
  id: string;
  title?: string;
  description?: string;
  price?: number;
  discountAmount?: number;
  campus?: string;
  address?: string;
  likeCount?: number;
  viewCount?: number;
  providerRecommendationCount?: number;
  photos?: Array<{ url?: string }>;
};

type PublicProfile = {
  id: string;
  displayName?: string;
  profilePicture?: string | null;
  isVerified?: boolean;
  role?: string;
  createdAt?: string;
  identityVerified?: boolean;
  followerCount?: number;
  isFollowingUser?: boolean;
  providerPageId?: string | null;
  isFollowingPage?: boolean;
  providerPageFollowerCount?: number;
  publicEngagement?: { likeCount: number; recommendationCount: number } | null;
  provider?: {
    displayName?: string;
    description?: string;
    providerType?: string;
    businessName?: string;
    verifiedAt?: string;
    socialLinks?: Record<string, string>;
  } | null;
  listings?: Listing[];
};

function readable(value?: string) {
  return (value ?? "").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function SafeLinks({ links }: { links?: Record<string, string> }) {
  const entries = Object.entries(links ?? {}).filter(([, value]) => typeof value === "string" && /^https?:\/\//i.test(value));
  if (entries.length === 0) return null;
  return <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">{entries.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noreferrer" className="text-sm font-medium text-safecrib-green hover:underline">{readable(label) || "Website"}</a>)}</div>;
}

function PublicListings({ listings }: { listings: Listing[] }) {
  if (listings.length === 0) return <p className="mt-5 rounded-xl border border-dashed border-black/15 bg-white px-5 py-8 text-center text-sm text-black/55">No public posts to show yet.</p>;
  return <div className="mt-5 grid gap-4 sm:grid-cols-2">
    {listings.map((listing) => <article key={listing.id} className="overflow-hidden rounded-xl border border-black/10 bg-white">
      {listing.photos?.[0]?.url && <Image src={listing.photos[0].url} alt="" width={720} height={440} unoptimized className="h-44 w-full object-cover" />}
      <div className="p-4">
        <h3 className="font-medium text-safecrib-black">{listing.title || "Untitled home"}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-black/55">{listing.description || "View this home for details."}</p>
        <p className="mt-3 font-semibold text-safecrib-black">{typeof listing.price === "number" ? `₦${(listing.price - (listing.discountAmount ?? 0)).toLocaleString()}` : "Price on request"}</p>
        <p className="mt-1 text-xs text-black/45">{listing.address || listing.campus || ""}</p>
        <div className="mt-3 flex gap-4 text-xs text-black/50"><span>{listing.viewCount ?? 0} views</span><span>{listing.likeCount ?? 0} likes</span></div>
      </div>
    </article>)}
  </div>;
}

export default function PublicProfilePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const profileId = params.id;
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPending, setAvatarPending] = useState(false);
  const [avatarMissing, setAvatarMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [followError, setFollowError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("safecrib_access_token")) {
      router.replace("/login");
      return;
    }
    if (getCachedCurrentUser<{ id?: string }>()?.id === profileId) {
      router.replace("/profile");
      return;
    }

    let active = true;
    let avatarRequestId = 0;
    let avatarTimeout: number | undefined;
    let pendingImage: HTMLImageElement | null = null;
    const resolveAvatar = (pictureReference?: string | null, onSettled?: () => void) => {
      const requestId = ++avatarRequestId;
      if (avatarTimeout !== undefined) window.clearTimeout(avatarTimeout);
      if (pendingImage) {
        pendingImage.onload = null;
        pendingImage.onerror = null;
        pendingImage = null;
      }
      setAvatarUrl(null);
      setAvatarMissing(!pictureReference);
      setAvatarPending(Boolean(pictureReference));
      if (!pictureReference) {
        onSettled?.();
        return;
      }
      const finish = (loadedUrl: string | null) => {
        if (!active || requestId !== avatarRequestId) return;
        if (avatarTimeout !== undefined) window.clearTimeout(avatarTimeout);
        if (pendingImage) {
          pendingImage.onload = null;
          pendingImage.onerror = null;
          pendingImage = null;
        }
        setAvatarUrl(loadedUrl);
        setAvatarMissing(!loadedUrl);
        setAvatarPending(false);
        onSettled?.();
      };
      void resolveMediaUrl(pictureReference)
        .then((pictureUrl) => {
          if (!active || requestId !== avatarRequestId) return;
          if (!pictureUrl) {
            finish(null);
            return;
          }
          const image = new window.Image();
          pendingImage = image;
          image.onload = () => finish(pictureUrl);
          image.onerror = () => finish(null);
          avatarTimeout = window.setTimeout(() => finish(null), 5000);
          image.src = pictureUrl;
        })
        .catch(() => {
          finish(null);
        });
    };
    const publicProfilePath = `/api/v1/users/${encodeURIComponent(profileId)}/public-profile`;
    const unsubscribeCache = subscribeClientCacheUpdates(({ path, value }) => {
      if (path === publicProfilePath) {
        const refreshedProfile = unwrapData<PublicProfile>(value);
        if (!refreshedProfile) return;
        setLoading(true);
        setProfile(refreshedProfile);
        resolveAvatar(refreshedProfile.profilePicture, () => setLoading(false));
      }
    });
    void cachedApiFetch<unknown>(publicProfilePath)
      .then((response) => unwrapData<PublicProfile>(response))
      .then((publicProfile) => {
        if (!active) return;
        setProfile(publicProfile);
        resolveAvatar(publicProfile.profilePicture, () => setLoading(false));
      })
      .catch((loadError: unknown) => {
        if (isUnauthorizedError(loadError)) {
          clearSession();
          router.replace("/login?reason=session-expired");
          return;
        }
        if (active) {
          setUnavailable(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
      if (avatarTimeout !== undefined) window.clearTimeout(avatarTimeout);
      if (pendingImage) {
        pendingImage.onload = null;
        pendingImage.onerror = null;
      }
      unsubscribeCache();
    };
  }, [profileId, router]);

  const toggleFollow = async (target: "user" | "page") => {
    if (!profile) return;
    const following = target === "user" ? profile.isFollowingUser === true : profile.isFollowingPage === true;
    const id = target === "user" ? profile.id : profile.providerPageId;
    if (!id) return;
    const updateLocalFollow = (isFollowing: boolean) => {
      setProfile((current) => {
        if (!current) return current;
        if (target === "user") {
          const wasFollowing = current.isFollowingUser === true;
          const delta = Number(isFollowing) - Number(wasFollowing);
          return {
            ...current,
            isFollowingUser: isFollowing,
            followerCount: Math.max(0, (current.followerCount ?? 0) + delta),
          };
        }
        const wasFollowing = current.isFollowingPage === true;
        const delta = Number(isFollowing) - Number(wasFollowing);
        return {
          ...current,
          isFollowingPage: isFollowing,
          providerPageFollowerCount: Math.max(0, (current.providerPageFollowerCount ?? 0) + delta),
        };
      });
    };
    setFollowPending(true);
    setFollowError("");
    updateLocalFollow(!following);
    try {
      const path = target === "user"
        ? `/api/v1/users/${encodeURIComponent(id)}/follow`
        : `/api/v1/users/pages/${encodeURIComponent(id)}/follow`;
      await apiFetch(path, { method: following ? "DELETE" : "POST" });
    } catch (error) {
      updateLocalFollow(following);
      setFollowError(error instanceof Error ? error.message : "We could not update your follow.");
    } finally {
      setFollowPending(false);
    }
  };

  if (loading || avatarPending) return <PageLoader label={avatarPending ? "Loading profile picture" : "Loading profile"} />;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
      <DashboardNav onCreatePage={() => router.push("/page/new")} pageStatus="none" />
      <section className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
        <BackHomeLink />
        {unavailable || !profile ? (
          <div className="mt-7 rounded-2xl border border-black/10 bg-white px-6 py-12 text-center">
            <h1 className="text-2xl font-semibold text-safecrib-black">This profile isn’t available</h1>
            <p className="mt-2 text-sm leading-6 text-black/55">Only verified profiles are visible to other people.</p>
          </div>
        ) : (
          <>
            <section className="mt-6 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_18px_45px_rgba(11,12,14,0.05)]">
              <div className="h-28 bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.45),transparent_30%),linear-gradient(120deg,#0b684c,#b9dfc9)] sm:h-36" />
              <div className="flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-end sm:px-8">
                {avatarMissing
                  ? <div role="img" aria-label="Profile picture unavailable" className="-mt-14 flex h-32 w-32 shrink-0 items-center justify-center rounded-full border-4 border-white bg-black/[0.04] text-black/35 sm:-mt-16"><Icon name="page" className="h-9 w-9" /></div>
                  : avatarUrl && <Image src={avatarUrl} alt={`${profile.displayName || "Member"} profile`} width={128} height={128} unoptimized className="-mt-14 h-32 w-32 shrink-0 rounded-full border-4 border-white object-cover sm:-mt-16" />}
                <div className="min-w-0 flex-1 sm:pb-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-safecrib-green">SafeCrib member</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h1 className="break-words font-display text-3xl font-bold text-safecrib-black sm:text-4xl">{profile.displayName || "SafeCrib member"}</h1>
                    <VerificationBadge verified={profile.isVerified === true} compact iconOnly />
                  </div>
                  <p className="mt-2 text-sm text-black/55">{readable(profile.role)}{profile.createdAt ? ` · Member since ${new Date(profile.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long" })}` : ""}</p>
                  <p className="mt-1 text-sm text-black/55">{profile.followerCount ?? 0} followers</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={followPending} onClick={() => void toggleFollow("user")} className={`rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 ${profile.isFollowingUser ? "border border-black/15 text-black/65" : "bg-safecrib-green text-white"}`}>{profile.isFollowingUser ? "Following" : "Follow"}</button>
                  {profile.providerPageId && <button type="button" disabled={followPending} onClick={() => void toggleFollow("page")} className={`rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 ${profile.isFollowingPage ? "border border-black/15 text-black/65" : "bg-safecrib-green text-white"}`}>{profile.isFollowingPage ? "Page followed" : "Follow page"} · {profile.providerPageFollowerCount ?? 0}</button>}
                </div>
              </div>
            </section>

            {followError && <p role="alert" className="mt-4 text-sm text-red-700">{followError}</p>}

            {profile.publicEngagement && <section className="mt-6 grid gap-3 sm:grid-cols-2" aria-label="Public provider engagement">
              <div className="rounded-xl border border-black/10 bg-white p-4"><p className="text-xs uppercase tracking-wide text-black/45">Home likes</p><p className="mt-1 text-2xl font-semibold text-safecrib-black">{profile.publicEngagement.likeCount}</p></div>
              <div className="rounded-xl border border-black/10 bg-white p-4"><p className="text-xs uppercase tracking-wide text-black/45">Student recommendations</p><p className="mt-1 text-2xl font-semibold text-safecrib-black">{profile.publicEngagement.recommendationCount}</p></div>
            </section>}

            {profile.provider && <section className="mt-6 rounded-xl border border-black/10 bg-white p-5 sm:p-6" aria-labelledby="provider-about-heading">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-safecrib-green">Provider</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h2 id="provider-about-heading" className="text-xl font-semibold text-safecrib-black">{profile.provider.businessName || profile.provider.displayName || "About"}</h2>
              </div>
              {profile.provider.providerType && <p className="mt-1 text-sm text-black/50">{readable(profile.provider.providerType)}</p>}
              {profile.provider.description && <p className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-6 text-black/65">{profile.provider.description}</p>}
              <SafeLinks links={profile.provider.socialLinks} />
            </section>}

            <section className="mt-7" aria-labelledby="public-posts-heading">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-safecrib-green">Activity</p>
              <h2 id="public-posts-heading" className="mt-1 text-xl font-semibold text-safecrib-black">{profile.provider ? "Homes and posts" : "Public posts"}</h2>
              <PublicListings listings={profile.listings ?? []} />
            </section>
          </>
        )}
      </section>
    </main>
  );
}
