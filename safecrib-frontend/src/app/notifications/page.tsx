"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { Icon } from "@/components/ui/Icon";
import { UserName } from "@/components/common/UserName";
import { apiFetch, getCachedMediaUrl, resolveMediaUrl, unwrapData } from "@/lib/api";
import {
  connectNotificationSocket,
  disconnectNotificationSocket,
  advanceNotificationCursor,
  getNotificationCache,
  notificationCursor,
  saveNotificationCache,
  type NotificationItem,
  type NotificationsResponse,
} from "@/lib/notifications";

function safeHref(href: string | null) {
  return href?.startsWith("/") && !href.startsWith("//") ? href : "/dashboard";
}

function decodeVapidKey(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function formatNotificationDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function NotificationActor({ notification }: { notification: NotificationItem }) {
  const actorName = typeof notification.data?.actorName === "string"
    ? notification.data.actorName
    : null;
  const actorId = typeof notification.data?.actorId === "string"
    ? notification.data.actorId
    : null;
  const photoReference = typeof notification.data?.actorProfilePicture === "string"
    ? notification.data.actorProfilePicture
    : null;
  const [photo, setPhoto] = useState<string | null>(() => getCachedMediaUrl(photoReference));

  useEffect(() => {
    const cached = getCachedMediaUrl(photoReference);
    if (cached) {
      setPhoto(cached);
      return;
    }
    setPhoto(null);
    if (!photoReference) return;
    let active = true;
    void resolveMediaUrl(photoReference)
      .then((url) => { if (active) setPhoto(url); })
      .catch((error: unknown) => {
        if (active) console.error("Could not load the notification sender's profile picture.", error);
      });
    return () => { active = false; };
  }, [photoReference]);

  return (
    <span className="flex shrink-0 flex-col items-center gap-1">
      <ProfileAvatar src={photo} alt={actorName ? `${actorName} profile` : "SafeCrib notification"} size="small" className="h-11 w-11" />
      {actorName && (
        <UserName
          user={{ id: actorId ?? undefined, displayName: actorName }}
          size="sm"
          showHandle={false}
          fallback="SafeCrib member"
          nameClassName="max-w-16 truncate text-[10px] text-black/50"
        />
      )}
    </span>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [latestCursor, setLatestCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const pendingNotifications = useRef(new Map<string, NotificationItem>());
  const notificationFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cacheReady, setCacheReady] = useState(false);
  const syncing = useRef(false);

  const syncNotifications = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    setError(null);
    try {
      const cached = getNotificationCache();
      const cursor = cached?.latestCursor
        ?? notificationCursor(cached?.notifications[0]);
      let response = unwrapData<NotificationsResponse>(
        await apiFetch<unknown>(
          `/api/v1/notifications?limit=30${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`,
          { cache: "no-store" },
        ),
      );
      const incoming = [...response.notifications];
      let newestCursor = response.latestCursor;
      while (response.hasMoreAfter && newestCursor) {
        response = unwrapData<NotificationsResponse>(
          await apiFetch<unknown>(
            `/api/v1/notifications?limit=30&after=${encodeURIComponent(newestCursor)}`,
            { cache: "no-store" },
          ),
        );
        incoming.push(...response.notifications);
        newestCursor = response.latestCursor;
      }
      if (cursor) {
        setItems((current) => {
          const merged = [
            ...incoming,
            ...current.filter((item) => !incoming.some((newItem) => newItem.id === item.id)),
          ].sort((left, right) =>
            right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
          );
          return merged;
        });
        setLatestCursor((current) =>
          incoming.reduce(
            (latest, notification) => advanceNotificationCursor(latest, notification) ?? latest,
            current ?? newestCursor ?? cursor,
          ),
        );
      } else {
        setItems(incoming);
        setNextCursor(response.nextCursor);
        setLatestCursor((current) =>
          incoming.reduce(
            (latest, notification) => advanceNotificationCursor(latest, notification) ?? latest,
            current ?? response.latestCursor,
          ),
        );
      }
      setUnreadCount(response.unreadCount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load notifications.");
    } finally {
      setLoading(false);
      setCacheReady(true);
      syncing.current = false;
    }
  }, []);

  useEffect(() => {
    const cached = getNotificationCache();
    if (cached) {
      setItems(cached.notifications);
      setUnreadCount(cached.unreadCount);
      setNextCursor(cached.nextCursor);
      setLatestCursor(cached.latestCursor ?? notificationCursor(cached.notifications[0]));
      setLoading(false);
      setCacheReady(true);
    }
    void syncNotifications();
  }, [syncNotifications]);

  useEffect(() => {
    if (!cacheReady) return;
    saveNotificationCache({
      notifications: items,
      unreadCount,
      nextCursor,
      latestCursor,
    });
  }, [cacheReady, items, latestCursor, nextCursor, unreadCount]);

  useEffect(() => {
    const socket = connectNotificationSocket();
    socket?.on("connect", () => { void syncNotifications(); });
    socket?.on("notification:new", (notification: NotificationItem) => {
      if (!notification?.id) return;
      pendingNotifications.current.delete(notification.id);
      pendingNotifications.current.set(notification.id, notification);
      setLatestCursor((current) => advanceNotificationCursor(current, notification));
      if (notificationFlushTimer.current) return;
      notificationFlushTimer.current = setTimeout(() => {
        notificationFlushTimer.current = null;
        const incoming = [...pendingNotifications.current.values()].reverse();
        pendingNotifications.current.clear();
        setItems((current) => [
          ...incoming,
          ...current.filter((item) => !incoming.some((newItem) => newItem.id === item.id)),
        ].sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
        ));
        void apiFetch<unknown>("/api/v1/notifications/unread-count")
          .then((response) => {
            const unread = unwrapData<{ count: number }>(response);
            if (Number.isInteger(unread?.count)) setUnreadCount(unread.count);
          })
          .catch((loadError: unknown) => {
            setError(loadError instanceof Error ? loadError.message : "Could not refresh unread notifications.");
          });
      }, 250);
    });
    return () => {
      disconnectNotificationSocket(socket);
      if (notificationFlushTimer.current) clearTimeout(notificationFlushTimer.current);
    };
  }, [syncNotifications]);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushSupported(false);
      return;
    }
    setNotificationPermission(Notification.permission);
    void navigator.serviceWorker.getRegistration("/").then(async (registration) => {
      const subscription = await registration?.pushManager.getSubscription();
      setPushEnabled(Boolean(subscription) && Notification.permission === "granted");
    }).catch((pushError: unknown) => {
      console.error("Could not inspect this device's phone notification subscription.", pushError);
    });
  }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const response = unwrapData<NotificationsResponse>(
        await apiFetch<unknown>(
          `/api/v1/notifications?limit=30&before=${encodeURIComponent(nextCursor)}`,
          { cache: "no-store" },
        ),
      );
      setItems((current) => [...current, ...response.notifications.filter(
        (item) => !current.some((existing) => existing.id === item.id),
      )]);
      setUnreadCount(response.unreadCount);
      setNextCursor(response.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load more notifications.");
    } finally {
      setLoadingMore(false);
    }
  };

  const markAllRead = async () => {
    setError(null);
    try {
      await apiFetch("/api/v1/notifications/read-all", { method: "PATCH" });
      const readAt = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
      setUnreadCount(0);
      window.dispatchEvent(new Event("safecrib:notifications-read"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not mark notifications as read.");
    }
  };

  const markRead = async (notification: NotificationItem) => {
    if (notification.readAt) return;
    setError(null);
    try {
      await apiFetch(`/api/v1/notifications/${encodeURIComponent(notification.id)}/read`, { method: "PATCH" });
      setItems((current) => current.map((item) => item.id === notification.id
        ? { ...item, readAt: new Date().toISOString() }
        : item));
      setUnreadCount((count) => Math.max(0, count - 1));
      window.dispatchEvent(new Event("safecrib:notifications-read"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not mark notification as read.");
    }
  };

  const deleteNotification = async (notification: NotificationItem) => {
    setError(null);
    try {
      const response = unwrapData<{ unreadCount: number }>(await apiFetch<unknown>(
        `/api/v1/notifications/${encodeURIComponent(notification.id)}`,
        { method: "DELETE" },
      ));
      setItems((current) => current.filter((item) => item.id !== notification.id));
      if (Number.isInteger(response?.unreadCount)) setUnreadCount(response.unreadCount);
      window.dispatchEvent(new Event("safecrib:notifications-read"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not delete notification.");
    }
  };

  const enablePhoneNotifications = async () => {
    setPushBusy(true);
    setError(null);
    try {
      const config = unwrapData<{ enabled: boolean; publicKey: string | null }>(
        await apiFetch<unknown>("/api/v1/notifications/push/config", { cache: "no-store" }),
      );
      if (!config?.enabled || !config.publicKey) {
        setError("Phone notifications are not configured on this server yet.");
        return;
      }
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission !== "granted") {
        setError(permission === "denied"
          ? "Phone notifications are blocked in your browser settings."
          : "Allow phone notifications to enable alerts.");
        return;
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
    } catch (pushError) {
      setError(pushError instanceof Error ? pushError.message : "Could not enable phone notifications.");
    } finally {
      setPushBusy(false);
    }
  };

  const openNotification = async (notification: NotificationItem) => {
    if (!notification.readAt) {
      try {
        await apiFetch(`/api/v1/notifications/${encodeURIComponent(notification.id)}/read`, {
          method: "PATCH",
        });
        setItems((current) => current.map((item) => item.id === notification.id
          ? { ...item, readAt: new Date().toISOString() }
          : item));
        setUnreadCount((count) => Math.max(0, count - 1));
        window.dispatchEvent(new Event("safecrib:notifications-read"));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not mark notification as read.");
      }
    }
    router.push(safeHref(notification.href));
  };

  return (
    <main className="min-h-screen bg-[#f7f8f6] pb-28 text-safecrib-black">
      <DashboardNav onCreatePage={() => router.push("/page/new")} pageStatus="none" canManagePage={false} />
      <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-safecrib-green">Your account</p>
            <h1 className="mt-1 text-3xl font-bold">Notifications</h1>
            <p className="mt-2 text-sm text-black/60">{unreadCount} unread</p>
          </div>
          <button
            type="button"
            onClick={() => void markAllRead()}
            disabled={unreadCount === 0}
            className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold transition hover:border-safecrib-green disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark all read
          </button>
        </header>

        {pushSupported && !pushEnabled && <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white p-4">
          <div>
            <h2 className="font-semibold">Phone notifications</h2>
            <p className="mt-1 text-sm text-black/55">{pushEnabled ? "This device can receive alerts when SafeCrib is closed." : "Get important SafeCrib updates on this device."}</p>
          </div>
          <button type="button" disabled={pushBusy} onClick={() => void enablePhoneNotifications()} className="rounded-full bg-safecrib-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {pushBusy ? "Saving…" : notificationPermission === "granted" ? "Finish enabling" : "Enable"}
          </button>
        </section>}

        {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {loading ? (
          <p className="rounded-2xl bg-white p-6 text-sm text-black/60">Loading notifications…</p>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-black/5 bg-white p-10 text-center">
            <Icon name="notifications" className="mx-auto h-8 w-8 text-black/35" />
            <h2 className="mt-3 font-semibold">You’re all caught up</h2>
            <p className="mt-1 text-sm text-black/60">Important updates about your SafeCrib account will appear here.</p>
            <Link className="mt-5 inline-block font-semibold text-safecrib-green underline" href="/dashboard">Back to home</Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((notification) => (
              <li key={notification.id} className={`rounded-2xl border p-4 transition ${notification.readAt ? "border-black/5 bg-white" : "border-safecrib-green/25 bg-safecrib-green/[0.06]"}`}>
                  <div className="flex items-start gap-3">
                    <NotificationActor notification={notification} />
                    <button type="button" onClick={() => void openNotification(notification)} className="min-w-0 flex-1 text-left">
                      <span className="flex items-center gap-2 font-semibold">
                        {!notification.readAt && <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-safecrib-green" />}
                        {notification.title}
                      </span>
                      <span className="mt-1 block text-sm text-black/70">{notification.body}</span>
                      <span className="mt-2 block text-xs text-black/50">{formatNotificationDate(notification.createdAt)}</span>
                    </button>
                  </div>
                  <div className="mt-3 flex justify-end gap-3 border-t border-black/5 pt-3">
                    {!notification.readAt && <button type="button" onClick={() => void markRead(notification)} className="text-xs font-semibold text-safecrib-green hover:underline">Mark as read</button>}
                    <button type="button" onClick={() => void deleteNotification(notification)} className="text-xs font-semibold text-red-700 hover:underline">Delete</button>
                  </div>
              </li>
            ))}
          </ul>
        )}
        {nextCursor && !loading && (
          <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="mt-5 w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50">
            {loadingMore ? "Loading…" : "Load older notifications"}
          </button>
        )}
      </section>
    </main>
  );
}
