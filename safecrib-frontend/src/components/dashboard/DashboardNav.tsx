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

function iconLinkClass(active: boolean) {
  return `relative inline-flex h-11 w-11 items-center justify-center rounded-xl border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safecrib-green ${active ? "border-safecrib-green/20 bg-safecrib-green/10 text-safecrib-green" : "border-transparent text-black/60 hover:border-black/10 hover:bg-black/[0.03] hover:text-safecrib-black"}`;
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
      const cachedUrl = getCachedMediaUrl(reference);
      if (cachedUrl) {
        setAvatarUrl(cachedUrl);
        return cachedUrl;
      }
      return resolveMediaUrl(reference);
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
      setAvatarUrl(getCachedMediaUrl(cachedUser.profilePicture));
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
          const cachedUrl = getCachedMediaUrl(profile.profilePicture);
          if (cachedUrl) setAvatarUrl(cachedUrl);
          void resolveMediaUrl(profile.profilePicture).then((url) => { if (active) setAvatarUrl(url); });
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
  const profileLinkClass = `inline-flex items-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safecrib-green ${pathname === "/dashboard" ? "hidden md:inline-flex" : ""} ${pathname === "/profile" ? "ring-2 ring-safecrib-green ring-offset-2" : ""}`;
  const handleSignOut = () => {
    void logoutSession().finally(() => router.replace("/login"));
  };

  return (
    <>
      <header className="hidden border-b border-safecrib-green/20 bg-safecrib-green text-white backdrop-blur-xl md:sticky md:top-0 md:z-40 md:block md:border-b md:border-safecrib-green/20 md:bg-safecrib-green md:text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
          <Link href="/dashboard" aria-label="SafeCrib home" title="SafeCrib home" className="hidden md:block">
            <SafeCribLogo height={28} href={false} />
          </Link>
          <nav aria-label="Dashboard navigation" className="ml-auto hidden items-center gap-2 md:flex">
            <Link href="/connect" aria-label="Search people" title="Search people" aria-current={pathname.startsWith("/connect") ? "page" : undefined} className={iconLinkClass(pathname.startsWith("/connect"))}>
              <Icon name="search" />
            </Link>
            {items.map((item) => <Link key={item.href} href={item.href} aria-label={item.label} title={item.label} aria-current={pathname === item.href ? "page" : undefined} className={iconLinkClass(pathname === item.href)}>
              <Icon name={item.icon} />
              {item.href === "/support" && <SupportCount count={supportCount} />}
            </Link>)}
            <Link href="/notifications" aria-label="Notifications" title="Notifications" aria-current={pathname.startsWith("/notifications") ? "page" : undefined} className={iconLinkClass(pathname.startsWith("/notifications"))}>
              <Icon name="notifications" />
              <NotificationCount count={unreadNotifications} />
            </Link>
            {canManagePage && <button type="button" onClick={onCreatePage} aria-label={pageLabel} title={pageLabel} aria-current={pageActive ? "page" : undefined} className={iconLinkClass(pageActive)}><Icon name="page" /></button>}
            <button type="button" onClick={handleSignOut} aria-label="Sign out" title="Sign out" className={iconLinkClass(false)}><Icon name="logout" /></button>
          </nav>
          <Link href="/profile" aria-label="View your profile" title="Your profile" aria-current={pathname === "/profile" ? "page" : undefined} className={profileLinkClass}>
            <span className="relative inline-flex">
              <ProfileAvatar src={avatarUrl} seed={navUser?.id ?? navUser?.email ?? "safecrib-member-avatar"} alt={`${accountName} profile`} size="small" />
              {verification && <span className="absolute -bottom-1 -right-1 z-10 rounded-full border border-white bg-white shadow-sm"><VerificationBadge verification={verification} compact iconOnly /></span>}
            </span>
          </Link>
        </div>
      </header>
      <nav aria-label="Mobile dashboard navigation" className="fixed inset-x-3 bottom-3 z-50 md:hidden">
        <div className="mx-auto flex max-w-md items-center gap-1 rounded-[2.4rem] border border-black/10 bg-white/25 p-1.5 shadow-[0_14px_36px_rgba(11,12,14,0.12)] backdrop-blur-2xl">
          <Link href="/dashboard" aria-label="Home" title="Home" aria-current={pathname === "/dashboard" ? "page" : undefined} className={`relative flex h-12 flex-1 items-center justify-center rounded-[1.9rem] transition-all duration-200 ${pathname === "/dashboard" ? "bg-black/[0.05] text-current" : "text-current/70 hover:bg-black/[0.03]"}`}><Icon name="home" className="h-5 w-5" /></Link>
          <Link href="/connect" aria-label="Search people" title="Search people" aria-current={pathname.startsWith("/connect") ? "page" : undefined} className={`relative flex h-12 flex-1 items-center justify-center rounded-[1.9rem] transition-all duration-200 ${pathname.startsWith("/connect") ? "bg-black/[0.05] text-current" : "text-current/70 hover:bg-black/[0.03]"}`}><Icon name="search" className="h-5 w-5" /></Link>
          <Link href="/support" aria-label="Support" title="Support" aria-current={pathname.startsWith("/support") ? "page" : undefined} className={`relative flex h-12 flex-1 items-center justify-center rounded-[1.9rem] transition-all duration-200 ${pathname.startsWith("/support") ? "bg-black/[0.05] text-current" : "text-current/70 hover:bg-black/[0.03]"}`}><Icon name="support" className="h-5 w-5" /><SupportCount count={supportCount} /></Link>
          <Link href="/notifications" aria-label="Notifications" title="Notifications" aria-current={pathname.startsWith("/notifications") ? "page" : undefined} className={`relative flex h-12 flex-1 items-center justify-center rounded-[1.9rem] transition-all duration-200 ${pathname.startsWith("/notifications") ? "bg-black/[0.05] text-current" : "text-current/70 hover:bg-black/[0.03]"}`}><Icon name="notifications" className="h-5 w-5" /><NotificationCount count={unreadNotifications} /></Link>
          {canManagePage && <button type="button" onClick={onCreatePage} aria-label={pageLabel} title={pageLabel} aria-current={pageActive ? "page" : undefined} className={`flex h-12 flex-1 items-center justify-center rounded-[1.9rem] transition-all duration-200 ${pageActive ? "bg-black/[0.05] text-current" : "text-current/70 hover:bg-black/[0.03]"}`}><Icon name="page" className="h-5 w-5" /></button>}
          <Link href="/settings" aria-label="Settings" title="Settings" aria-current={pathname === "/settings" ? "page" : undefined} className={`flex h-12 flex-1 items-center justify-center rounded-[1.9rem] transition-all duration-200 ${pathname === "/settings" ? "bg-black/[0.05] text-current" : "text-current/70 hover:bg-black/[0.03]"}`}><Icon name="settings" className="h-5 w-5" /></Link>
        </div>
      </nav>
    </>
  );
}

function NotificationCount({ count }: { count: number }) {
  if (count < 1) return null;
  return <span aria-label={`${count} unread notifications`} className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[10px] font-bold text-white">{count > 99 ? "99+" : count}</span>;
}