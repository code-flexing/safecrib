"use client";

import { useEffect, useState } from "react";
import { apiFetch, unwrapData } from "@/lib/api";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { SettingsSection, SettingsSectionDivider } from "@/components/settings/SettingsSection";
import { SettingsToggleRow } from "@/components/settings/SettingsToggleRow";
import { useToast } from "@/components/ui/Toast";

export function NotificationsContent() {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushSupported(false);
      return;
    }

    void navigator.serviceWorker.getRegistration("/").then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      setPushEnabled(Boolean(subscription) && Notification.permission === "granted");
    }).catch(() => undefined);
  }, []);

  function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
    return bytes;
  }

  const enablePush = async () => {
    setPushBusy(true);
    try {
      const config = unwrapData<{ enabled: boolean; publicKey: string | null }>(
        await apiFetch<unknown>("/api/v1/notifications/push/config", { cache: "no-store" }),
      );
      if (!config?.enabled || !config.publicKey) {
        throw new Error("Phone notifications are not configured on this server yet.");
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error(
          permission === "denied"
            ? "Phone notifications are blocked in your browser settings."
            : "Allow phone notifications to enable alerts.",
        );
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(config.publicKey),
      });

      const serialized = subscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
        throw new Error("Your browser returned an incomplete notification subscription.");
      }

      await apiFetch("/api/v1/notifications/push/subscriptions", {
        method: "POST",
        body: JSON.stringify({
          endpoint: serialized.endpoint,
          p256dh: serialized.keys.p256dh,
          auth: serialized.keys.auth,
        }),
      });

      setPushEnabled(true);
      showToast("Phone notifications enabled.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not enable phone notifications.", "error");
    } finally {
      setPushBusy(false);
    }
  };

  const disablePush = async () => {
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const endpoint = encodeURIComponent(subscription.endpoint);
        await apiFetch(`/api/v1/notifications/push/subscriptions/${endpoint}`, {
          method: "DELETE",
        });
      }
      setPushEnabled(false);
      showToast("Phone notifications disabled.");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not disable phone notifications.", "error");
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <>
      <SettingsSection
        title="Phone notifications"
        description={pushEnabled
          ? "This device can receive alerts when SafeCrib is closed."
          : "Get important SafeCrib updates on this device."}
      >
        {pushSupported && !pushEnabled && (
          <SettingsRow
            label="Push notifications"
            description="Receive push notifications on this browser"
          >
            <button
              type="button"
              disabled={pushBusy}
              onClick={() => void enablePush()}
              className="rounded-lg bg-safecrib-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pushBusy ? "Enabling…" : "Enable"}
            </button>
          </SettingsRow>
        )}
        {pushSupported && pushEnabled && (
          <SettingsToggleRow
            label="Push notifications"
            description="Receive push notifications on this device"
            checked={pushEnabled}
            onChange={(checked) => {
              if (checked) void enablePush();
              else void disablePush();
            }}
            disabled={pushBusy}
            loading={pushBusy}
          />
        )}
        {!pushSupported && (
          <p className="text-sm text-black/55">Phone notifications are not supported in your browser.</p>
        )}
      </SettingsSection>

      <SettingsSectionDivider />

      <SettingsSection title="Email notifications" description="You will always receive email notifications for security-relevant events.">
        <SettingsRow label="Security alerts" description="Emails for password changes, new logins, and review requests." />
        <SettingsRow label="Marketing emails" description="Product updates and SafeCrib news." />
      </SettingsSection>
    </>
  );
}
