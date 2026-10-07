"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SETTINGS_CATEGORIES, isCategoryVisible, type SettingsCategory, type SettingsUserRole } from "@/lib/settings-config";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { cachedCurrentUser, isUnauthorizedError, clearSession, subscribeClientCacheUpdates, unwrapData, userSessionClearedEvent } from "@/lib/api";
import { Icon } from "@/components/ui/Icon";
import { SettingsSignOutButton } from "@/components/settings/SettingsSignOutButton";
import { SettingsCategoryIcon } from "./SettingsCategoryIcon";

type User = {
  id?: string;
  email?: string;
  role?: string;
  displayName?: unknown;
  profilePicture?: string;
};

function userRoleFrom(user: User | null): SettingsUserRole {
  const role = String(user?.role ?? "").toUpperCase();
  if (role === "ADMIN") return "admin";
  if (["AGENT", "LANDLORD"].includes(role)) return "agent";
  return "user";
}

function nameFrom(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.displayName === "string") return record.displayName.trim();
    if (typeof record.name === "string") return record.name.trim();
  }
  return "";
}

export function SettingsHub() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("safecrib_access_token")) {
      router.replace("/login?reason=session-expired");
      return;
    }

    let active = true;

    const unsubscribeCache = subscribeClientCacheUpdates(({ path, value }) => {
      if (path !== "/api/v1/users/me" && path !== "/api/v1/auth/me") return;
      const currentUser = unwrapData<User | null>(value);
      if (currentUser) setUser(currentUser);
    });

    void cachedCurrentUser<User>().then((currentUser) => {
      if (active) {
        setUser(currentUser);
        setLoading(false);
      }
    }).catch((loadError: unknown) => {
      if (active) {
        if (isUnauthorizedError(loadError)) {
          clearSession();
          router.replace("/login?reason=session-expired");
        } else {
          setError(loadError instanceof Error ? loadError.message : "We could not load your account.");
          setLoading(false);
        }
      }
    });

    const handleSessionCleared = () => {
      setUser(null);
      setError("");
      setLoading(true);
    };
    window.addEventListener(userSessionClearedEvent, handleSessionCleared);

    return () => {
      active = false;
      unsubscribeCache();
      window.removeEventListener(userSessionClearedEvent, handleSessionCleared);
    };
  }, [router]);

  const role = userRoleFrom(user);
  const visibleCategories = SETTINGS_CATEGORIES.filter((cat) => isCategoryVisible(cat, role));

  const filteredCategories = searchQuery.trim().length === 0
    ? visibleCategories
    : visibleCategories.filter((cat) =>
        cat.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cat.description.toLowerCase().includes(searchQuery.toLowerCase()),
      );

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && filteredCategories.length === 1) {
      const first = filteredCategories[0];
      if (first) router.push(first.route);
    }
  };

  const profilePicture = user?.profilePicture;

  return (
    <main className="min-h-screen bg-[#f7f8f5]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-safecrib-green">Account settings</p>
          <h1 className="mt-3 font-display text-3xl italic text-safecrib-black sm:text-4xl">Your settings</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-black/60">
            Manage your SafeCrib account preferences, verification status, and security settings.
          </p>
        </div>

        {error && (
          <p role="alert" className="mb-6 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}

        {!loading && user && (
          <aside className="mb-8 rounded-xl border border-black/10 bg-white p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <ProfileAvatar
                src={profilePicture ?? null}
                seed={user?.id ?? user?.email ?? "safecrib-member"}
                alt={`${nameFrom(user?.displayName) || "Your"} profile`}
                size="medium"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-safecrib-black">{nameFrom(user?.displayName) || "Your profile"}</p>
                <p className="text-sm text-black/55 break-all">{user?.email ?? "Loading..."}</p>
              </div>
            </div>
          </aside>
        )}

        <div className="relative mb-6">
          <Icon name="search" className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-black/35" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Search settings..."
            className="w-full rounded-xl border border-black/15 pl-10 pr-4 py-2.5 text-sm focus:border-safecrib-green focus:outline-none"
          />
        </div>

        {filteredCategories.length === 0 ? (
          <div className="rounded-xl border border-black/10 bg-white p-8 text-center">
            <Icon name="search" className="mx-auto h-8 w-8 text-black/35" />
            <h2 className="mt-3 text-lg font-semibold text-safecrib-black">No settings found</h2>
            <p className="mt-1 text-sm text-black/55">
              {searchQuery.trim() ? "Try different keywords." : "No settings are visible for your account."}
            </p>
          </div>
        ) : (
          <nav className="grid gap-2" aria-label="Settings categories">
            {filteredCategories.map((category) => (
              <CategoryLink key={category.id} category={category} isActive={false} />
            ))}
          </nav>
        )}
      </div>

      <footer className="mx-auto max-w-6xl px-4 py-6 border-t border-black/10">
        <div className="flex justify-between items-center">
          <p className="text-xs text-black/45">End of settings</p>
          <SettingsSignOutButton />
        </div>
      </footer>
    </main>
  );
}

function CategoryLink({
  category,
  isActive,
}: {
  category: SettingsCategory;
  isActive: boolean;
}) {
  return (
    <Link
      href={category.route}
      className={`flex items-center gap-4 rounded-xl border px-5 py-3.5 text-sm transition-all ${
        isActive
          ? "border-safecrib-green bg-safecrib-green/[0.06] text-safecrib-green"
          : "border-black/10 bg-white text-safecrib-black hover:border-safecrib-green/30 hover:bg-black/[0.02]"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          isActive ? "bg-safecrib-green text-white" : "bg-black/[0.04] text-black/60"
        }`}
      >
        <SettingsCategoryIcon category={category} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${isActive ? "text-safecrib-green" : "text-safecrib-black"}`}>{category.label}</p>
        <p className="mt-0.5 text-sm text-black/55">{category.description}</p>
      </div>
      <Icon name="chevron-right" className="h-4 w-4 shrink-0 text-black/30" />
    </Link>
  );
}
