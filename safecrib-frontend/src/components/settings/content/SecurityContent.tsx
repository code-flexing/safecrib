"use client";

import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { SettingsSection, SettingsSectionDivider } from "@/components/settings/SettingsSection";
import { Button } from "@/components/ui/Button";
import { ReauthDialog } from "@/components/settings/ReauthDialog";
import { useToast } from "@/components/ui/Toast";

export function SecurityContent() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [error, setError] = useState("");
  const [showReauth, setShowReauth] = useState(false);
  const [pendingPasswordValues, setPendingPasswordValues] = useState<{ current: string; new: string; confirm: string } | null>(null);
  const { showToast } = useToast();

  const changePassword = async (values: { current: string; new: string; confirm: string }) => {
    if (values.new.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (values.new !== values.confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setPasswordSaving(true);
    setError("");
    try {
      await apiFetch("/api/v1/users/me/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: values.current, newPassword: values.new }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast("Password changed.");
    } catch (changeError) {
      setError(
        changeError instanceof ApiError && changeError.status === 400
          ? "Current password was not accepted. Check it and try again."
          : changeError instanceof Error ? changeError.message : "We could not change your password.",
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleSubmit = () => {
    const values = { current: currentPassword, new: newPassword, confirm: confirmPassword };
    if (!values.current) {
      setError("Enter your current password.");
      return;
    }
    if (!values.new || !values.confirm) {
      setError("Enter a new password and confirmation.");
      return;
    }
    if (values.new === values.current) {
      setPendingPasswordValues(values);
      setShowReauth(true);
      return;
    }
    void changePassword(values);
  };

  const handleReauthVerified = (password: string) => {
    setShowReauth(false);
    if (pendingPasswordValues) {
      void changePassword({ ...pendingPasswordValues, current: password });
      setPendingPasswordValues(null);
    }
  };

  return (
    <>
      <SettingsSection title="Password" description="Use your current password to set a new one.">
        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium text-safecrib-black">
              Current password
              <input
                required
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="mt-2 block w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none"
              />
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-safecrib-black">
              New password
              <input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-2 block w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none"
              />
            </label>
            <p className="mt-1 text-xs text-black/45">Must be at least 8 characters.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-safecrib-black">
              Confirm new password
              <input
                required
                minLength={8}
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-2 block w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none"
              />
            </label>
          </div>
          {error && (
            <p role="alert" className="border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          )}
          <Button type="button" onClick={handleSubmit} loading={passwordSaving} className="w-fit">
            Change password
          </Button>
        </div>
      </SettingsSection>

      <SettingsSectionDivider />

      <SettingsSection title="Active sessions" description="Currently logged-in sessions.">
        <SettingsRow label="Current browser session" description="This browser" />
        <p className="text-xs text-black/45">
          Other active sessions and devices can be managed when the sessions endpoint is available.
        </p>
      </SettingsSection>

      <ReauthDialog open={showReauth} onClose={() => setShowReauth(false)} onVerified={handleReauthVerified} />
    </>
  );
}
