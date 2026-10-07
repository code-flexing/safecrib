"use client";

import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";

type ReauthState = "idle" | "verifying" | "verified" | "error";

export function ReauthDialog({
  open,
  onClose,
  onVerified,
}: {
  open: boolean;
  onClose: () => void;
  onVerified: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [state, setState] = useState<ReauthState>("idle");
  const [error, setError] = useState("");

  const verify = async () => {
    if (!password) {
      setError("Enter your current password.");
      return;
    }
    setState("verifying");
    setError("");
    try {
      await apiFetch("/api/v1/auth/verify-password", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setState("verified");
      onVerified(password);
    } catch (error) {
      const message = error instanceof ApiError
        ? "Current password was not accepted. Check it and try again."
        : error instanceof Error
          ? error.message
          : "We could not verify your password.";
      setError(message);
      setState("error");
    }
  };

  const reset = () => {
    setPassword("");
    setState("idle");
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={handleClose} titleId="reauth-dialog-title">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100">
            <Icon name="key" className="h-6 w-6 text-blue-600" />
          </div>
          <h2 id="reauth-dialog-title" className="text-lg font-semibold text-safecrib-black">
            Re-enter password
          </h2>
        </div>
        <p className="text-sm text-black/60 mb-4">
          Enter your current password to change your password.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-safecrib-black">
            Current password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full border border-black/15 px-3 py-2 text-sm focus:border-safecrib-green focus:outline-none"
              autoComplete="current-password"
              onKeyDown={(e) => e.key === "Enter" && state !== "verifying" && void verify()}
            />
          </label>
        </div>
        {error && (
          <p role="alert" className="mb-3 text-sm text-red-800 bg-red-50 border-l-4 border-red-200 px-3 py-2 rounded">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={handleClose} disabled={state === "verifying"}>
            Cancel
          </Button>
          <Button onClick={verify} loading={state === "verifying"} disabled={state === "verifying"}>
            Verify
          </Button>
        </div>
      </div>
    </Modal>
  );
}
