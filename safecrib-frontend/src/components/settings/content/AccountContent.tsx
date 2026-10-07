"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cachedCurrentUser, clearSession, getCachedMediaUrl, isUnauthorizedError, resolveMediaUrl, subscribeClientCacheUpdates, unwrapData, userSessionClearedEvent } from "@/lib/api";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { SettingsSection, SettingsSectionDivider } from "@/components/settings/SettingsSection";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type Account = {
  id?: string;
  email?: string;
  role?: string;
  displayName?: unknown;
  profilePicture?: string;
  emailVerified?: boolean;
};

function nameFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.displayName === "string") return record.displayName;
    if (typeof record.name === "string") return record.name;
  }
  return "";
}

export function AccountContent() {
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    if (!localStorage.getItem("safecrib_access_token")) {
      router.replace("/login?reason=session-expired");
      return;
    }

    const unsubscribeCache = subscribeClientCacheUpdates(({ path, value }) => {
      if (path !== "/api/v1/users/me" && path !== "/api/v1/auth/me") return;
      const currentAccount = unwrapData<Account | null>(value);
      if (currentAccount) {
        setAccount(currentAccount);
        resolveAvatar(currentAccount);
      }
    });

    void cachedCurrentUser<Account>().then((currentAccount) => {
      setAccount(currentAccount);
      resolveAvatar(currentAccount);
     }).catch((loadError: unknown) => {
      if (isUnauthorizedError(loadError)) {
        clearSession();
        router.replace("/login?reason=session-expired");
      }
    });

    const handleSessionCleared = () => {
      setAccount(null);
      setAvatarUrl(null);
    };
    window.addEventListener(userSessionClearedEvent, handleSessionCleared);

    return () => {
      unsubscribeCache();
      window.removeEventListener(userSessionClearedEvent, handleSessionCleared);
    };
  }, [router]);

  function resolveAvatar(currentAccount: Account) {
    const cached = getCachedMediaUrl(currentAccount.profilePicture);
    if (cached) {
      setAvatarUrl(cached);
      return;
    }
    void resolveMediaUrl(currentAccount.profilePicture).then((url) => {
      if (url) setAvatarUrl(url);
    });
  }

  return (
    <>
      <SettingsSection title="Account" description="Your SafeCrib account details.">
        <SettingsRow
          label="Email"
          description={account?.email ?? "Loading..."}
        />
        <SettingsRow
          label="Role"
          description={account?.role?.replaceAll("_", " ") ?? "Loading..."}
        />
        <SettingsRow
          label="Email verification"
          description={account?.emailVerified ? "Verified" : "Not verified"}
        />
        {account?.id && (
          <SettingsRow
            label="Profile photo"
            description={account?.profilePicture ? "Set" : "Not set"}
          >
            <ProfileAvatar
              src={avatarUrl}
              seed={account?.id ?? account?.email ?? "safecrib-member"}
              alt={`${nameFrom(account?.displayName) || "Your"} profile`}
              size="small"
            />
          </SettingsRow>
        )}
      </SettingsSection>

      <SettingsSectionDivider />

      <SettingsSection
        title="Delete account"
        description="Deactivating removes your profile and listings. This cannot be undone."
      >
        <Button
          variant="secondary"
          onClick={() => showToast("Contact SafeCrib support to delete your account.")}
          className="text-red-700 border-red-300 hover:bg-red-50"
        >
          Deactivate account
        </Button>
      </SettingsSection>
    </>
  );
}
