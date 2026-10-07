"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ProfileCover } from "./ProfileCover";
import { ProfileAvatar } from "./ProfileAvatar";
import { ProfileActions } from "./ProfileActions";
import { ProfileIdentity } from "./ProfileIdentity";
import { ProfileStats } from "./ProfileStats";
import { ProfileTabs, useActiveTab, type TabKey } from "./ProfileTabs";
import { ProfileFeed } from "./ProfileFeed";
import { toProfileVM } from "./types";
import { apiFetch, cachedApiFetch, getCachedCurrentUser, unwrapData, isUnauthorizedError, clearSession, getCachedMediaUrl, resolveMediaUrl, subscribeClientCacheUpdates } from "@/lib/api";
import { BackHomeLink } from "@/components/ui/BackHomeLink";
import { useAvatarAccent } from "@/hooks/useAvatarAccent";

const AVAILABLE_TABS: TabKey[] = ["posts", "replies", "media", "reposts"];

type PublicProfile = {
  id: string;
  displayName?: string;
  username?: string | null;
  shortBio?: string | null;
  longBio?: string | null;
  profilePicture?: string | null;
  coverPicture?: string | null;
  isVerified?: boolean;
  role?: string;
  createdAt?: string;
  followerCount?: number;
  followingCount?: number;
  postsCount?: number;
  viewsCount?: number;
  isFollowingUser?: boolean;
  followsYou?: boolean;
  providerPageId?: string | null;
  isFollowingPage?: boolean;
  providerPageFollowerCount?: number;
  publicEngagement?: { likeCount: number; recommendationCount: number } | null;
  provider?: {
    displayName?: string;
    username?: string | null;
    description?: string;
    shortBio?: string;
    longBio?: string;
    providerType?: string;
    businessName?: string;
    verifiedAt?: string;
    socialLinks?: Record<string, string>;
  } | null;
  listings?: Array<{
    id: string;
    title?: string;
    description?: string;
    price?: number;
    discountAmount?: number;
    campus?: string;
    address?: string;
    likeCount?: number;
    viewCount?: number;
    photos?: Array<{ url?: string }>;
  }>;
  schoolOfStudy?: string;
  businessName?: string;
  agencyName?: string;
  location?: string;
  badgeLabel?: string;
  verificationBadge?: string;
  phoneNumber?: string;
  phone?: string;
  whatsapp?: string;
  avatarVersion?: string;
};

export function ProfilePage({ username }: { username: string }) {
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [followPending, setFollowPending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const me = getCachedCurrentUser<{ id?: string }>();
  const isOwnProfile = me?.id === username;

  const tab = useActiveTab(AVAILABLE_TABS);
  const accent = useAvatarAccent(profile?.id ?? username, avatarUrl, profile?.avatarVersion ?? profile?.profilePicture);

  useEffect(() => {
    if (!localStorage.getItem("safecrib_access_token")) {
      router.replace("/login");
      return;
    }

    if (isOwnProfile) {
      router.replace("/profile");
      return;
    }

    let active = true;
    let avatarTimeout: number | undefined;
    let pendingImage: HTMLImageElement | null = null;

    const resolveAvatar = (pictureReference?: string | null) => {
      if (avatarTimeout !== undefined) window.clearTimeout(avatarTimeout);
      if (pendingImage) {
        pendingImage.onload = null;
        pendingImage.onerror = null;
        pendingImage = null;
      }
      setAvatarUrl(null);
      if (!pictureReference) return;

      const finish = (loadedUrl: string | null) => {
        if (!active) return;
        if (avatarTimeout !== undefined) window.clearTimeout(avatarTimeout);
        if (pendingImage) {
          pendingImage.onload = null;
          pendingImage.onerror = null;
          pendingImage = null;
        }
        setAvatarUrl(loadedUrl);
      };

      // Check cache first
      const cachedUrl = getCachedMediaUrl(pictureReference);
      if (cachedUrl) {
        finish(cachedUrl);
        return;
      }

      // Resolve via API
      resolveMediaUrl(pictureReference).then((pictureUrl) => {
        if (!active) return;
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
      });
    };

    const publicProfilePath = `/api/v1/users/${encodeURIComponent(username)}/public-profile`;
    const unsubscribeCache = subscribeClientCacheUpdates(({ path, value }) => {
      if (path === publicProfilePath) {
        const refreshedProfile = unwrapData<PublicProfile>(value);
        if (!refreshedProfile) return;
        setProfile(refreshedProfile);
        resolveAvatar(refreshedProfile.profilePicture);
      }
    });

    cachedApiFetch<unknown>(publicProfilePath)
      .then((response) => unwrapData<PublicProfile>(response))
      .then((publicProfile) => {
        if (!active) return;
        setProfile(publicProfile);
        resolveAvatar(publicProfile.profilePicture);
      })
      .catch((loadError: unknown) => {
        if (isUnauthorizedError(loadError)) {
          clearSession();
          router.replace("/login?reason=session-expired");
          return;
        }
        if (active) {
          setUnavailable(true);
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
  }, [username, router, isOwnProfile]);

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
    updateLocalFollow(!following);
    try {
      const path = target === "user"
        ? `/api/v1/users/${encodeURIComponent(id)}/follow`
        : `/api/v1/users/pages/${encodeURIComponent(id)}/follow`;
      await apiFetch(path, { method: following ? "DELETE" : "POST" });
    } catch (err) {
      updateLocalFollow(following);
    } finally {
      setFollowPending(false);
    }
  };

  const handleMessage = () => {
    if (!profile) return;
    router.push(`/messages/${profile.id}`);
  };

  if (unavailable || !profile) {
    return (
      <main className="min-h-screen bg-white pb-24 md:pb-8">
        <section className="mx-auto w-full max-w-[680px] px-4 py-6 sm:px-8 sm:py-10">
          <BackHomeLink />
          <div className="mt-7 rounded-2xl border border-black/10 bg-white px-6 py-12 text-center">
            <h1 className="text-2xl font-semibold text-safecrib-black">This profile isn&apos;t available</h1>
            <p className="mt-2 text-sm leading-6 text-black/55">Only verified profiles are visible to other people.</p>
          </div>
        </section>
      </main>
    );
  }

  const p = toProfileVM(profile, me?.id);

  return (
    <main
      className="mx-auto w-full max-w-[680px] bg-white"
      style={{ ["--avatar-accent"]: accent } as React.CSSProperties}
      data-accent={accent ? "ready" : "none"}
    >
      <ProfileCover coverUrl={p.coverUrl} onMenu={() => setMenuOpen(true)} accentColor={accent} />

      <div className="-mt-12 flex items-end justify-between px-4 sm:-mt-14">
        <ProfileAvatar src={avatarUrl} name={p.displayName} size={96} accentColor={accent} />
        <div className="pb-1">
          <ProfileActions
            p={p}
            onToggleFollow={() => toggleFollow("user")}
            followPending={followPending}
            onMessage={handleMessage}
            accentColor={accent}
          />
        </div>
      </div>

      <ProfileIdentity p={p} accentColor={accent} />
      <ProfileStats p={p} />
      <ProfileTabs available={AVAILABLE_TABS} labelOverride={p.isAgent ? { posts: "Listings" } : undefined} accentColor={accent} />
      <ProfileFeed userId={p.id} tab={tab} />

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}
    </main>
  );
}