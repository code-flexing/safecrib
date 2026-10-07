"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  SETTINGS_CATEGORIES,
  getSettingsCategory,
  isCategoryVisible,
  SETTINGS_CATEGORY_ALIASES,
  type SettingsCategoryKey,
} from "@/lib/settings-config";
import {
  cachedCurrentUser,
  clearSession,
  isUnauthorizedError,
  subscribeClientCacheUpdates,
  unwrapData,
  userSessionClearedEvent,
} from "@/lib/api";
import { SettingsCategoryPage } from "@/components/settings/SettingsCategoryPage";
import { Skeleton } from "@/components/ui/Skeleton";
import { PersonalInfoContent } from "@/components/settings/content/PersonalInfoContent";
import { AccountContent } from "@/components/settings/content/AccountContent";
import { AppearanceContent } from "@/components/settings/content/AppearanceContent";
import { NotificationsContent } from "@/components/settings/content/NotificationsContent";
import { SecurityContent } from "@/components/settings/content/SecurityContent";
import { VerificationContent } from "@/components/settings/content/VerificationContent";
import { HelpSupportContent } from "@/components/settings/content/HelpSupportContent";
import { LogoutContent } from "@/components/settings/content/LogoutContent";

type User = { id?: string; email?: string; role?: string; displayName?: unknown; profilePicture?: string };

function CategoryContentLoader() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-6 w-6 rounded" />
        <Skeleton className="h-6 w-48 rounded" />
      </div>
      <Skeleton className="h-4 w-full max-w-sm rounded" />
      <div className="mt-6 space-y-4">
        <Skeleton className="h-14 w-full rounded" />
        <Skeleton className="h-14 w-full rounded" />
        <Skeleton className="h-14 w-full rounded" />
      </div>
    </div>
  );
}

function renderCategoryContent(categoryKey: SettingsCategoryKey) {
  switch (categoryKey) {
    case "personal":
      return <PersonalInfoContent />;
    case "account":
      return <AccountContent />;
    case "appearance":
      return <AppearanceContent />;
    case "notifications":
      return <NotificationsContent />;
    case "security":
      return <SecurityContent />;
    case "verification":
      return <VerificationContent />;
    case "help":
      return <HelpSupportContent />;
    case "logout":
      return <LogoutContent />;
    default:
      return null;
  }
}

export default function SettingsCategoryRoute() {
  const router = useRouter();
  const params = useParams<{ category: string }>();
  const [resolvedCategoryKey, setResolvedCategoryKey] = useState<SettingsCategoryKey | null>(null);
  const [ready, setReady] = useState(false);

  const categoryParam = params?.category ?? "";

  useEffect(() => {
    if (!localStorage.getItem("safecrib_access_token")) {
      router.replace("/login?reason=session-expired");
      return;
    }

    let active = true;

    const unsubscribeCache = subscribeClientCacheUpdates(({ path, value }) => {
      if (path !== "/api/v1/users/me" && path !== "/api/v1/auth/me") return;
      const currentUser = unwrapData<User | null>(value);
      if (active && currentUser) {
        const role = String(currentUser.role ?? "").toUpperCase();
        resolveCategory(role);
      }
    });

    void cachedCurrentUser<User>().then((currentUser) => {
      if (active) {
        const role = String(currentUser.role ?? "").toUpperCase();
        resolveCategory(role);
      }
    }).catch((loadError: unknown) => {
      if (active) {
        if (isUnauthorizedError(loadError)) {
          clearSession();
          router.replace("/login?reason=session-expired");
        } else {
          setReady(true);
        }
      }
    });

    const handleSessionCleared = () => {
      if (active) {
        router.replace("/login?reason=session-expired");
      }
    };
    window.addEventListener(userSessionClearedEvent, handleSessionCleared);

    function resolveCategory(role: string) {
      if (!categoryParam) {
        router.replace("/settings");
        return;
      }

      const key = categoryParam as SettingsCategoryKey;

      if (SETTINGS_CATEGORY_ALIASES[key]) {
        const aliasTarget = SETTINGS_CATEGORY_ALIASES[key];
        const aliasUrl = SETTINGS_CATEGORIES.find((c) => c.id === aliasTarget)?.route;
        if (aliasUrl && aliasUrl !== `/settings/${key}`) {
          router.replace(aliasUrl);
          return;
        }
      }

      const category = getSettingsCategory(key);
      if (!category || !isCategoryVisible(category, role)) {
        router.replace("/settings");
        return;
      }

      if (key === "logout") {
        router.replace("/settings");
        return;
      }

      setResolvedCategoryKey(key);
      setReady(true);
    }

    return () => {
      active = false;
      unsubscribeCache();
      window.removeEventListener(userSessionClearedEvent, handleSessionCleared);
    };
  }, [router, categoryParam]);

  if (!ready || !resolvedCategoryKey) {
    return (
      <main className="min-h-screen bg-[#f7f8f5]">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
          <div className="mb-6">
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
          <CategoryContentLoader />
        </div>
      </main>
    );
  }

  const category = getSettingsCategory(resolvedCategoryKey)!;

  return (
    <SettingsCategoryPage category={category}>
      {renderCategoryContent(resolvedCategoryKey)}
    </SettingsCategoryPage>
  );
}
