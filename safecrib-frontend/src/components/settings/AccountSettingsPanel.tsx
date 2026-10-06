"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ApiError, apiFetch, cachedApiFetch, cachedCurrentUser, getCachedMediaUrl, primeCurrentUserCache, resolveMediaUrl, subscribeClientCacheUpdates, unwrapData, uploadDocument, userSessionClearedEvent, getCachedUserAvatar, setCachedUserAvatar } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useTheme, type ThemeMode } from "@/components/theme/ThemeProvider";

type Account = { id?: string; email?: string; role?: string; displayName?: unknown; profilePicture?: string };

function nameFrom(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.displayName === "string") return record.displayName;
    if (typeof record.name === "string") return record.name;
  }
  return "";
}

export function AccountSettingsPanel({ heading = "Account details" }: { heading?: string }) {
  const { mode, setMode } = useTheme();
  const [account, setAccount] = useState<Account | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const avatarPreviewUrl = useRef<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const unsubscribeCache = subscribeClientCacheUpdates(({ path, value }) => {
      if (path !== "/api/v1/users/me" && path !== "/api/v1/auth/me") return;
      const currentAccount = unwrapData<Account | null>(value);
      if (!currentAccount) return;
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
          if (url) { setAvatarUrl(url); if (currentAccount.id) setCachedUserAvatar(currentAccount.id, url, currentAccount.profilePicture); }
        });
      }
    });
    void cachedCurrentUser<Account>().then(async (currentAccount) => {
      setAccount(currentAccount);
      setDisplayName(nameFrom(currentAccount.displayName));
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
      setError(loadError instanceof Error ? loadError.message : "We could not load account settings.");
    });

    const handleSessionCleared = () => {
      setAccount(null);
      setDisplayName("");
      setAvatarUrl(null);
      setError("");
      setNotice("");
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
    setNotice("");
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
      setNotice("Profile photo updated.");
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
    if (!value) { setError("Enter a display name."); return; }
    setNameSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await apiFetch<unknown>("/api/v1/users/me", { method: "PATCH", body: JSON.stringify({ displayName: value }) });
      const updated = unwrapData<Account>(response);
      const nextAccount = { ...account, ...updated, displayName: updated?.displayName ?? value };
      setAccount(nextAccount);
      primeCurrentUserCache(nextAccount);
      setDisplayName(nameFrom(updated?.displayName ?? value));
      setNotice("Display name updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "We could not update your display name.");
    } finally { setNameSaving(false); }
  };

  const updatePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentPassword) { setError("Enter your current password."); return; }
    if (newPassword.length < 8) { setError("Your new password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("The new passwords do not match."); return; }
    setPasswordSaving(true);
    setError("");
    setNotice("");
    try {
      await apiFetch("/api/v1/users/me/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice("Password changed.");
    } catch (changeError) {
      setError(changeError instanceof ApiError && changeError.status === 400 ? "Current password was not accepted. Check it and try again." : changeError instanceof Error ? changeError.message : "We could not change your password.");
    } finally { setPasswordSaving(false); }
  };

  return (
    <section aria-labelledby="account-settings-heading" className="mt-8 border border-black/10 bg-white">
      <div className="border-b border-black/10 px-5 py-4 sm:px-7"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-safecrib-green">Account</p><h2 id="account-settings-heading" className="mt-1 text-xl font-medium text-safecrib-black">{heading}</h2></div>
      <div className="p-5 sm:p-7">
        {error && <p role="alert" className="mb-5 border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{error}</p>}
        {notice && <p role="status" className="mb-5 border-l-4 border-[#2ECC71] bg-[#2ECC71]/10 px-4 py-3 text-sm leading-6 text-[#0B3D1E]">{notice}</p>}
        <fieldset>
          <legend className="font-medium text-safecrib-black">Appearance</legend>
          <p className="mt-1 text-sm leading-6 text-black/55">Choose the theme used across SafeCrib.</p>
          <div role="radiogroup" aria-label="Appearance theme" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([{ value: "light", label: "Light" }, { value: "dim", label: "Dim" }, { value: "dark", label: "Dark" }] as const).map((option) => <button key={option.value} type="button" role="radio" aria-checked={mode === option.value} onClick={() => setMode(option.value as ThemeMode)} className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${mode === option.value ? "border-safecrib-green bg-safecrib-green/10 text-safecrib-green" : "border-black/15 text-black/60 hover:bg-black/[0.03]"}`}>{option.label}</button>)}
          </div>
        </fieldset>
        <div className="grid gap-8 lg:grid-cols-2">
          <form onSubmit={updateDisplayName} className="grid content-start gap-4">
            <div><h3 className="font-medium text-safecrib-black">Personal details</h3><p className="mt-1 text-sm leading-6 text-black/55">Your email and account mode are managed by SafeCrib.</p></div>
            <div className="flex items-center gap-4">
              <ProfileAvatar src={avatarUrl} seed={account?.id ?? account?.email ?? "safecrib-member-avatar"} alt={`${nameFrom(account?.displayName) || "Your"} profile`} size="medium" />
              <label className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-black/15 px-4 py-2 text-sm font-medium text-black/75 transition-colors hover:bg-black/[0.03]">
                {avatarSaving ? "Uploading photo..." : "Change profile photo"}
                <input type="file" accept="image/*" disabled={avatarSaving} onChange={(event) => void updateProfilePicture(event)} className="sr-only" />
              </label>
            </div>
            <label className="block text-sm font-medium">Display name<input required maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" /></label>
            <div className="grid gap-3 sm:grid-cols-2"><p className="break-all text-sm"><span className="block text-xs uppercase tracking-[0.1em] text-black/45">Email</span><span className="mt-1 block text-black/75">{account?.email ?? "Loading..."}</span></p><p className="text-sm"><span className="block text-xs uppercase tracking-[0.1em] text-black/45">Account mode</span><span className="mt-1 block text-black/75">{account?.role?.replaceAll("_", " ") ?? "Loading..."}</span></p></div>
            <Button type="submit" loading={nameSaving} className="w-fit">Save name</Button>
          </form>
          <form onSubmit={updatePassword} className="grid content-start gap-4 border-t border-black/10 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
            <div><h3 className="font-medium text-safecrib-black">Password</h3><p className="mt-1 text-sm leading-6 text-black/55">Use your current password to set a new one.</p></div>
            <label className="block text-sm font-medium">Current password<input required autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" /></label>
            <label className="block text-sm font-medium">New password<input required minLength={8} autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" /></label>
            <label className="block text-sm font-medium">Confirm new password<input required minLength={8} autoComplete="new-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" /></label>
            <Button type="submit" variant="secondary" loading={passwordSaving} className="w-fit">Change password</Button>
          </form>
        </div>
      </div>
    </section>
  );
}
