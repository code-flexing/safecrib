"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { connectNotificationSocket, disconnectNotificationSocket } from "@/lib/notifications";
import { SafeCribLogo } from "@/components/branding/SafeCribLogo";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { Icon, type IconName } from "@/components/ui/Icon";
import { normalizeVerificationStage, VerificationBadge, type VerificationStageResult } from "@/components/verification/VerificationBadge";
import { apiFetch, cachedApiFetch, displayName as getDisplayName, getAuthenticatedDisplayName, getCachedCurrentUser, getCachedMediaUrl, getPersistedVerification, logoutSession, resolveMediaUrl, setPersistedVerification, subscribeClientCacheUpdates, unwrapData } from "@/lib/api";

type DashboardNavProps = {
  onCreatePage: () => void;
  pageStatus: "none" | "pending" | "approved" | "rejected";
  canManagePage?: boolean;
  supportCount?: number;
};

const items = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/support", label: "Support", icon: "support" },
  { href: "/settings", label: "Settings", icon: "settings" },
] satisfies { href: string; label: string; icon: IconName }[];

type NavUser = { id?: string; email?: string; displayName?: unknown; role?: string; profilePicture?: string; verification?: { stage?: string; badge?: string; badgeColor?: "green" | "blue" | "gold"; riskBlocked?: boolean; eligible?: boolean } | null };

function iconLinkClass(active: boolean, desktopVertical = false) {
  if (desktopVertical) {
    return `group relative flex w-full items-center gap-3 rounded-full px-4 py-3 text-left text-base font-medium transition-all duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safecrib-green ${active ? "bg-black/[0.04] text-safecrib-black shadow-[0_0_0_1px_rgba(15,23,42,0.04)]" : "text-black/70 hover:bg-black/[0.03] hover:text-safecrib-black"}`;
  }
  return `relative inline-flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safecrib-green ${active ? "border-safecrib-green/20 bg-safecrib-green/10 text-safecrib-green shadow-[0_0_0_1px_rgba(12,115,85,0.08)] scale-[1.02]" : "border-transparent text-black/60 hover:-translate-y-0.5 hover:border-black/10 hover:bg-black/[0.03] hover:text-safecrib-black"}`;
}

function SupportCount({ count }: { count: number }) {
  if (count < 1) return null;
  return <span aria-label={`${count} open support conversations`} className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-safecrib-green px-1 text-[10px] font-bold text-white">{count > 9 ? "9+" : count}</span>;
}

export function DashboardNav({ onCreatePage, pageStatus, canManagePage = true, supportCount = 0 }: DashboardNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const pageLabel = pageStatus === "none" ? "Create provider Page" : "My provider Page";
  const pageActive = pathname.startsWith("/page");
  const [navUser, setNavUser] = useState<NavUser | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [verification, setVerification] = useState<VerificationStageResult | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);

  useEffect(() => {
    let active = true;
    const resolveAvatar = async (user: NavUser) => {
      let reference = user.profilePicture;
      if (!reference) {
        const role = String(user.role ?? "").toUpperCase();
        const legacyAvatarPath = ["UNVERIFIED", "STUDENT"].includes(role)
          ? "/api/v1/student-profiles/me"
          : ["AGENT", "LANDLORD"].includes(role)
            ? "/api/v1/provider-pages/me"
            : null;
        if (legacyAvatarPath) {
          const profile = await cachedApiFetch<unknown>(legacyAvatarPath).catch(() => null);
          reference = unwrapData<{ profilePicture?: string } | null>(profile)?.profilePicture;
        }
      }
      const cachedUrl = getCachedMediaUrl(reference, "avatar_sm");
      if (cachedUrl) {
        setAvatarUrl(cachedUrl);
        return cachedUrl;
      }
      return resolveMediaUrl(reference, "avatar_sm");
    };

    const syncVerification = async (userId?: string, directVerification?: NavUser["verification"]) => {
      if (directVerification && typeof directVerification === "object") {
        const normalized = normalizeVerificationStage(directVerification);
        if (normalized) {
          setVerification(normalized);
          return;
        }
      }
      if (!userId) {
        setVerification(null);
        return;
      }
      const persisted = getPersistedVerification(userId);
      const normalized = persisted ? normalizeVerificationStage(persisted) : null;
      if (normalized) {
        setVerification(normalized);
        return;
      }
      try {
        const response = await apiFetch<unknown>("/api/v1/trust/me/verification-stage");
        const stage = normalizeVerificationStage(response);
        if (stage) {
          setPersistedVerification(userId, response);
          setVerification(stage);
        }
      } catch {
        setVerification(null);
      }
    };

    const cachedUser = getCachedCurrentUser<NavUser>();
    if (cachedUser) {
      setNavUser(cachedUser);
      setAvatarUrl(getCachedMediaUrl(cachedUser.profilePicture, "avatar_sm"));
    }
    else {
      const tokenName = getAuthenticatedDisplayName();
      if (tokenName) setNavUser({ displayName: tokenName });
    }

    if (cachedUser) {
      void syncVerification(cachedUser.id, cachedUser.verification);
      void resolveAvatar(cachedUser).then((url) => { if (active) setAvatarUrl(url); });
    }
    const unsubscribeCache = subscribeClientCacheUpdates(({ path, value }) => {
      if (path === "/api/v1/users/me" || path === "/api/v1/auth/me") {
        const updatedUser = unwrapData<NavUser | null>(value);
        if (!updatedUser) return;
        setNavUser(updatedUser);
        void syncVerification(updatedUser.id, updatedUser.verification);
        void resolveAvatar(updatedUser).then((url) => { if (active) setAvatarUrl(url); });
        return;
      }
      if (path === "/api/v1/student-profiles/me" || path === "/api/v1/provider-pages/me") {
        const profile = unwrapData<{ profilePicture?: string } | null>(value);
        if (profile?.profilePicture) {
          const cachedUrl = getCachedMediaUrl(profile.profilePicture, "avatar_sm");
          if (cachedUrl) setAvatarUrl(cachedUrl);
          void resolveMediaUrl(profile.profilePicture, "avatar_sm").then((url) => { if (active) setAvatarUrl(url); });
        }
      }
    });
    return () => { active = false; unsubscribeCache(); };
  }, []);

  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshUnread = async () => {
      if (!localStorage.getItem("safecrib_access_token")) return;
      try {
        const response = unwrapData<{ count: number }>(
          await apiFetch<unknown>("/api/v1/notifications/unread-count"),
        );
        if (active && Number.isInteger(response?.count)) setUnreadNotifications(response.count);
      } catch (error) {
        if (active) console.error("Could not refresh notification count.", error);
      }
    };
    const scheduleUnreadRefresh = () => {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void refreshUnread();
      }, 250);
    };
    const socket = connectNotificationSocket();
    void refreshUnread();
    window.addEventListener("safecrib:notifications-read", refreshUnread);
    socket?.on("connect", () => { void refreshUnread(); });
    socket?.on("notification:new", scheduleUnreadRefresh);
    return () => {
      active = false;
      window.removeEventListener("safecrib:notifications-read", refreshUnread);
      if (refreshTimer) clearTimeout(refreshTimer);
      disconnectNotificationSocket(socket);
    };
  }, []);

  const accountName = getDisplayName(navUser) || getAuthenticatedDisplayName() || "Your profile";
  const profileLinkClass = `inline-flex items-center gap-3 rounded-full p-1.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safecrib-green ${pathname === "/profile" ? "bg-black/[0.04]" : "hover:bg-black/[0.03]"}`;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const handleSignOut = () => {
    void logoutSession().finally(() => router.replace("/login"));
  };

  return (
    <>
      <header className="hidden md:fixed md:left-0 md:top-0 md:z-40 md:block md:h-screen md:w-72 md:border-r md:border-black/10 md:bg-white md:text-safecrib-black md:shadow-[0_0_0_1px_rgba(0,0,0,0.02)]">
        <div className="flex h-full flex-col px-4 py-5">
          <Link href="/dashboard" aria-label="SafeCrib home" title="SafeCrib home" className="mb-6 flex items-center gap-2 px-2">
            <SafeCribLogo height={32} href={false} />
          </Link>

          <nav aria-label="Desktop dashboard navigation" className="flex flex-1 flex-col gap-1.5">
            <Link href="/connect" aria-label="Search people" title="Search people" aria-current={pathname.startsWith("/connect") ? "page" : undefined} className={iconLinkClass(pathname.startsWith("/connect"), true)}>
              <span className="inline-flex h-6 w-6 items-center justify-center"><Icon name="search" className="h-5 w-5" /></span>
              <span>Search</span>
            </Link>
            {items.map((item) => <Link key={item.href} href={item.href} aria-label={item.label} title={item.label} aria-current={pathname === item.href ? "page" : undefined} className={iconLinkClass(pathname === item.href, true)}>
              <span className="relative inline-flex h-6 w-6 items-center justify-center"><Icon name={item.icon} className="h-5 w-5" />{item.href === "/support" && <SupportCount count={supportCount} />}</span>
              <span>{item.label}</span>
            </Link>)}
            <Link href="/notifications" aria-label="Notifications" title="Notifications" aria-current={pathname.startsWith("/notifications") ? "page" : undefined} className={iconLinkClass(pathname.startsWith("/notifications"), true)}>
              <span className="relative inline-flex h-6 w-6 items-center justify-center"><Icon name="notifications" className="h-5 w-5" /><NotificationCount count={unreadNotifications} /></span>
              <span>Notifications</span>
            </Link>
            {canManagePage && <button type="button" onClick={onCreatePage} aria-label={pageLabel} title={pageLabel} aria-current={pageActive ? "page" : undefined} className={iconLinkClass(pageActive, true)}><span className="inline-flex h-6 w-6 items-center justify-center"><Icon name="page" className="h-5 w-5" /></span><span>{pageStatus === "none" ? "Create Page" : "My Page"}</span></button>}
            <button type="button" onClick={handleSignOut} aria-label="Sign out" title="Sign out" className={`${iconLinkClass(false, true)} mt-auto`}><span className="inline-flex h-6 w-6 items-center justify-center"><Icon name="logout" className="h-5 w-5" /></span><span>Log out</span></button>
          </nav>

          <Link href="/profile" aria-label="View your profile" title="Your profile" aria-current={pathname === "/profile" ? "page" : undefined} className={`${profileLinkClass} mt-5 w-full justify-between border-t border-black/10 pt-4`}>
            <span className="flex items-center gap-3">
              <span className="relative inline-flex">
                <ProfileAvatar src={avatarUrl} seed={navUser?.id ?? navUser?.email ?? "safecrib-member-avatar"} alt={`${accountName} profile`} size="small" />
                {verification && <span className="absolute -bottom-1 -right-1 z-10 rounded-full border border-white bg-white shadow-sm"><VerificationBadge verification={verification} compact iconOnly /></span>}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-safecrib-black">{accountName}</span>
                <span className="block text-xs text-black/45">View profile</span>
              </span>
            </span>
          </Link>
        </div>
      </header>
      <div className="fixed inset-x-0 top-0 z-40 border-b border-black/10 bg-white/90 px-4 pb-2 pt-3 backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-center">
          <Link href="/dashboard" aria-label="SafeCrib home" title="SafeCrib home" className="inline-flex items-center justify-center rounded-full">
            <SafeCribLogo height={34} href={false} />
          </Link>
        </div>
      </div>
      <nav aria-label="Mobile dashboard navigation" className="fixed inset-x-0 bottom-3 z-50 md:hidden">
        <div className="mx-auto flex max-w-[22rem] items-end justify-center px-3">
          <div className="relative flex items-end justify-center">
            <div className={`absolute bottom-16 left-1/2 -translate-x-1/2 transition-all duration-300 ease-out ${mobileMenuOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}>
              <div className="flex items-end gap-2">
                <div className="flex flex-col items-center gap-2">
                  <Link href="/connect" aria-label="Search" title="Search" aria-current={pathname.startsWith("/connect") ? "page" : undefined} onClick={() => setMobileMenuOpen(false)} className={`relative flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/90 shadow-[0_10px_26px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all duration-200 ${pathname.startsWith("/connect") ? "scale-105 border-safecrib-green/20 bg-safecrib-green/10 text-safecrib-green" : "text-safecrib-black/75 hover:scale-105"}`}><Icon name="search" className="h-5 w-5" /></Link>
                  <Link href="/dashboard" aria-label="Home" title="Home" aria-current={pathname === "/dashboard" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)} className={`relative flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/90 shadow-[0_10px_26px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all duration-200 ${pathname === "/dashboard" ? "scale-105 border-safecrib-green/20 bg-safecrib-green/10 text-safecrib-green" : "text-safecrib-black/75 hover:scale-105"}`}><Icon name="home" className="h-5 w-5" /></Link>
                </div>
                <div className="flex flex-col items-center gap-2">
                  {canManagePage && <button type="button" onClick={() => { setMobileMenuOpen(false); onCreatePage(); }} aria-label={pageLabel} title={pageLabel} className={`relative flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/90 shadow-[0_10px_26px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all duration-200 ${pageActive ? "scale-105 border-safecrib-green/20 bg-safecrib-green/10 text-safecrib-green" : "text-safecrib-black/75 hover:scale-105"}`}><Icon name="page" className="h-5 w-5" /></button>}
                  <Link href="/profile" aria-label="Profile" title="Profile" aria-current={pathname === "/profile" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)} className={`relative flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/90 shadow-[0_10px_26px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all duration-200 ${pathname === "/profile" ? "scale-105 border-safecrib-green/20 bg-safecrib-green/10 text-safecrib-green" : "text-safecrib-black/75 hover:scale-105"}`}><ProfileAvatar src={avatarUrl} seed={navUser?.id ?? navUser?.email ?? "safecrib-member-avatar"} alt={`${accountName} profile`} size="small" /></Link>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Link href="/notifications" aria-label="Notifications" title="Notifications" aria-current={pathname.startsWith("/notifications") ? "page" : undefined} onClick={() => setMobileMenuOpen(false)} className={`relative flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/90 shadow-[0_10px_26px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all duration-200 ${pathname.startsWith("/notifications") ? "scale-105 border-safecrib-green/20 bg-safecrib-green/10 text-safecrib-green" : "text-safecrib-black/75 hover:scale-105"}`}><Icon name="notifications" className="h-5 w-5" /><NotificationCount count={unreadNotifications} /></Link>
                <Link href="/support" aria-label="Support" title="Support" aria-current={pathname.startsWith("/support") ? "page" : undefined} onClick={() => setMobileMenuOpen(false)} className={`relative flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/90 shadow-[0_10px_26px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all duration-200 ${pathname.startsWith("/support") ? "scale-105 border-safecrib-green/20 bg-safecrib-green/10 text-safecrib-green" : "text-safecrib-black/75 hover:scale-105"}`}><Icon name="support" className="h-5 w-5" /><SupportCount count={supportCount} /></Link>
                <Link href="/settings" aria-label="Settings" title="Settings" aria-current={pathname === "/settings" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)} className={`relative flex h-12 w-12 items-center justify-center rounded-full border border-black/10 bg-white/90 shadow-[0_10px_26px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all duration-200 ${pathname === "/settings" ? "scale-105 border-safecrib-green/20 bg-safecrib-green/10 text-safecrib-green" : "text-safecrib-black/75 hover:scale-105"}`}><Icon name="settings" className="h-5 w-5" /></Link>
              </div>
            </div>

            <button type="button" aria-label={mobileMenuOpen ? "Close navigation" : "Open navigation"} title={mobileMenuOpen ? "Close navigation" : "Open navigation"} onClick={() => setMobileMenuOpen((open) => !open)} className={`relative flex h-16 w-16 items-center justify-center rounded-full border border-safecrib-green/20 bg-safecrib-green text-white shadow-[0_18px_44px_rgba(12,115,85,0.35)] transition-all duration-300 ease-out ${mobileMenuOpen ? "scale-110 rotate-45" : "scale-100"}`}>
              <svg viewBox="0 0 64 64" className="h-8 w-8" fill="none" aria-hidden="true">
                <path d="M32 9c-5 0-9 4-9 9v3.5c0 2.1 1.2 4 3 5.1l1.3.9v7.3c0 2.3 1.9 4.2 4.2 4.2h1c2.3 0 4.2-1.9 4.2-4.2v-7.3l1.3-.9c1.8-1.1 3-3 3-5.1V18c0-5-4-9-9-9Zm0 18.5c-1.8 0-3.2-1.4-3.2-3.2V18c0-1.8 1.4-3.2 3.2-3.2s3.2 1.4 3.2 3.2v6.3c0 1.8-1.4 3.2-3.2 3.2Zm-9.5 11.7a2.5 2.5 0 0 1 2.5-2.5h14a2.5 2.5 0 1 1 0 5h-14a2.5 2.5 0 0 1-2.5-2.5Z" fill="currentColor" opacity="0.95"/>
                <path d="M22 22.5c1.8-2 4.4-3.3 7.2-3.3 2.9 0 5.5 1.2 7.3 3.2" stroke="rgba(255,255,255,0.8)" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}

function NotificationCount({ count }: { count: number }) {
  if (count < 1) return null;
  return <span aria-label={`${count} unread notifications`} className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-bold text-white">{count > 99 ? "99+" : count}</span>;
}