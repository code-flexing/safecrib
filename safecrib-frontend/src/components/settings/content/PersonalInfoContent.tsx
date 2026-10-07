"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { cachedApiFetch, cachedCurrentUser, apiFetch, getCachedMediaUrl, getCachedUserAvatar, primeCurrentUserCache, resolveMediaUrl, setCachedUserAvatar, subscribeClientCacheUpdates, unwrapData, uploadDocument, userSessionClearedEvent } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { SettingsSection, SettingsSectionDivider } from "@/components/settings/SettingsSection";
import { useToast } from "@/components/ui/Toast";
import { Icon } from "@/components/ui/Icon";

type Account = { id?: string; email?: string; role?: string; displayName?: unknown; username?: string | null; profilePicture?: string };

function nameFrom(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.displayName === "string") return record.displayName;
    if (typeof record.name === "string") return record.name;
  }
  return "";
}

function UsernameCopyButton({ username }: { username: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(`@${username}`).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-black/15 px-2.5 py-1 text-xs font-medium text-black/75 transition-colors hover:bg-black/[0.03]"
      aria-label={`Copy username @${username}`}
    >
      <Icon name="copy" className="h-3.5 w-3.5" />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function PersonalInfoContent() {
  const [account, setAccount] = useState<Account | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const avatarPreviewUrl = useRef<string | null>(null);
  const [error, setError] = useState("");
  const { showToast } = useToast();

  useEffect(() => {
    const unsubscribeCache = subscribeClientCacheUpdates(({ path, value }) => {
      if (path !== "/api/v1/users/me" && path !== "/api/v1/auth/me") return;
      const currentAccount = unwrapData<Account | null>(value);
      if (currentAccount) updateAccountState(currentAccount);
    });

    void cachedCurrentUser<Account>().then(async (currentAccount) => {
      updateAccountState(currentAccount);
      let profilePicture = currentAccount.profilePicture;
      if (!profilePicture && ["UNVERIFIED", "STUDENT"].includes(String(currentAccount.role ?? "").toUpperCase())) {
        const student = unwrapData<{ profilePicture?: string } | null>(await cachedApiFetch<unknown>("/api/v1/student-profiles/me"));
        profilePicture = student?.profilePicture;
      } else if (!profilePicture && ["AGENT", "LANDLORD"].includes(String(currentAccount.role ?? "").toUpperCase())) {
        const provider = unwrapData<{ profilePicture?: string } | null>(await cachedApiFetch<unknown>("/api/v1/provider-pages/me"));
        profilePicture = provider?.profilePicture;
      }
      if (currentAccount.id) {
        const cachedAvatar = getCachedUserAvatar(currentAccount.id);
        if (cachedAvatar) setAvatarUrl(cachedAvatar);
      }
      const resolvedUrl = getCachedMediaUrl(profilePicture) ?? await resolveMediaUrl(profilePicture);
      if (resolvedUrl) {
        setAvatarUrl(resolvedUrl);
        if (currentAccount.id) setCachedUserAvatar(currentAccount.id, resolvedUrl, profilePicture);
      }
    }).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "We could not load your profile.");
    });

    const handleSessionCleared = () => {
      setAccount(null);
      setDisplayName("");
      setAvatarUrl(null);
      setError("");
      if (avatarPreviewUrl.current) URL.revokeObjectURL(avatarPreviewUrl.current);
      avatarPreviewUrl.current = null;
    };
    window.addEventListener(userSessionClearedEvent, handleSessionCleared);

    return () => {
      unsubscribeCache();
      window.removeEventListener(userSessionClearedEvent, handleSessionCleared);
      if (avatarPreviewUrl.current) URL.revokeObjectURL(avatarPreviewUrl.current);
    };
  }, []);

  function updateAccountState(currentAccount: Account) {
    setAccount(currentAccount);
    setDisplayName(nameFrom(currentAccount.displayName));
    if (currentAccount.id) {
      const cachedAvatar = getCachedUserAvatar(currentAccount.id);
      if (cachedAvatar) setAvatarUrl(cachedAvatar);
    }
    const cachedPicture = getCachedMediaUrl(currentAccount.profilePicture);
    if (cachedPicture) {
      setAvatarUrl(cachedPicture);
      if (currentAccount.id) setCachedUserAvatar(currentAccount.id, cachedPicture, currentAccount.profilePicture);
    }
    if (currentAccount.profilePicture) {
      void resolveMediaUrl(currentAccount.profilePicture).then((url) => {
        if (url) {
          setAvatarUrl(url);
          if (currentAccount.id) setCachedUserAvatar(currentAccount.id, url, currentAccount.profilePicture);
        }
      });
    }
  }

  const updateProfilePicture = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file for your profile photo.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Your profile photo must be 10 MB or smaller.");
      return;
    }

    setAvatarSaving(true);
    setError("");
    const previousAvatar = avatarUrl;
    const previewUrl = URL.createObjectURL(file);
    if (avatarPreviewUrl.current) URL.revokeObjectURL(avatarPreviewUrl.current);
    avatarPreviewUrl.current = previewUrl;
    setAvatarUrl(previewUrl);

    try {
      const profilePicture = await uploadDocument(file, "AVATAR");
      const response = await apiFetch<unknown>("/api/v1/users/me", {
        method: "PATCH",
        body: JSON.stringify({ profilePicture }),
      });
      const updated = unwrapData<Account>(response);
      const nextAccount = { ...account, ...updated, profilePicture: updated?.profilePicture ?? profilePicture };
      setAccount(nextAccount);
      primeCurrentUserCache(nextAccount);
      const resolvedAvatar = await resolveMediaUrl(nextAccount.profilePicture);
      if (resolvedAvatar) {
        setAvatarUrl(resolvedAvatar);
        if (nextAccount.id) setCachedUserAvatar(nextAccount.id, resolvedAvatar, nextAccount.profilePicture);
        URL.revokeObjectURL(previewUrl);
        avatarPreviewUrl.current = null;
      }
      showToast("Profile photo updated.");
    } catch (uploadError) {
      setAvatarUrl(previousAvatar);
      URL.revokeObjectURL(previewUrl);
      avatarPreviewUrl.current = null;
      setError(uploadError instanceof Error ? uploadError.message : "We could not update your profile photo.");
    } finally {
      setAvatarSaving(false);
    }
  };

  const updateDisplayName = async (event: FormEvent) => {
    event.preventDefault();
    const value = displayName.trim();
    if (!value) {
      setError("Enter a display name.");
      return;
    }
    setNameSaving(true);
    setError("");
    try {
      const response = await apiFetch<unknown>("/api/v1/users/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName: value }),
      });
      const updated = unwrapData<Account>(response);
      const nextAccount = { ...account, ...updated, displayName: updated?.displayName ?? value };
      setAccount(nextAccount);
      primeCurrentUserCache(nextAccount);
      setDisplayName(nameFrom(updated?.displayName ?? value));
      showToast("Display name updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "We could not update your display name.");
    } finally {
      setNameSaving(false);
    }
  };

  return (
    <>
      <SettingsSection title="Profile photo">
        <SettingsRow label="Photo" description="Click to change your profile photo.">
          <div className="flex items-center gap-3">
            <ProfileAvatar
              src={avatarUrl}
              seed={account?.id ?? account?.email ?? "safecrib-member-avatar"}
              alt={`${nameFrom(account?.displayName) || "Your"} profile`}
              size="large"
            />
            <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/75 transition-colors hover:bg-black/[0.03]">
              {avatarSaving ? "Uploading..." : "Change photo"}
              <input
                type="file"
                accept="image/*"
                disabled={avatarSaving}
                onChange={(event) => void updateProfilePicture(event)}
                className="sr-only"
              />
            </label>
            {avatarSaving && (
              <span aria-label="Uploading" className="inline-flex h-5 w-5 animate-spin rounded-full border-2 border-safecrib-green border-t-transparent" />
            )}
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSectionDivider />

      <SettingsSection title="Display name" description="How your name appears on your profile.">
        <form onSubmit={updateDisplayName} className="grid gap-4">
          <div>
            <label className="block text-sm font-medium text-safecrib-black">
              Display name
              <input
                required
                maxLength={120}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-2 block w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none"
              />
            </label>
            {account?.username && (
              <div className="mt-3 rounded-lg border border-black/10 bg-[#f7f8f5] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">Username</p>
                    <p className="mt-1 font-mono text-sm font-medium text-safecrib-black">@{account.username}</p>
                  </div>
                  <UsernameCopyButton username={account.username} />
                </div>
                <p className="mt-2 text-xs leading-5 text-black/50">
                  Your username is created automatically and cannot be changed.
                </p>
              </div>
            )}
          </div>
          <Button type="submit" loading={nameSaving} className="w-fit">
            Save name
          </Button>
        </form>
      </SettingsSection>

      {error && (
        <p role="alert" className="mt-4 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}
    </>
  );
}
