"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch, ApiError, unwrapData } from "@/lib/api";
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

function safeAdminHref(href: string | null) {
  return href?.startsWith("/") && !href.startsWith("//") ? href : "/admin";
}

function notificationDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Recently"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function AdminNotificationsPage() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [latestCursor, setLatestCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);
  const [error, setError] = useState("");
  const syncing = useRef(false);

  const syncNotifications = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const cache = getNotificationCache();
      const cursor = cache?.latestCursor ?? notificationCursor(cache?.notifications[0]);
      let response = unwrapData<NotificationsResponse>(
        await adminFetch<unknown>(
          `/api/v1/notifications?limit=30${cursor ? `&after=${encodeURIComponent(cursor)}` : ""}`,
          { cache: "no-store" },
        ),
      );
      const incoming = [...response.notifications];
      let newestCursor = response.latestCursor;
      while (response.hasMoreAfter && newestCursor) {
        response = unwrapData<NotificationsResponse>(
          await adminFetch<unknown>(
            `/api/v1/notifications?limit=30&after=${encodeURIComponent(newestCursor)}`,
            { cache: "no-store" },
          ),
        );
        incoming.push(...response.notifications);
        newestCursor = response.latestCursor;
      }
      if (cursor) {
        setItems((current) => [
          ...incoming,
          ...current.filter((item) => !incoming.some((newItem) => newItem.id === item.id)),
        ].sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
        ));
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
      setError("");
    } catch (syncError) {
      if (syncError instanceof ApiError && (syncError.status === 401 || syncError.status === 403)) {
        window.location.assign(`/admin/login?reason=${syncError.status === 403 ? "denied" : "session-expired"}`);
        return;
      }
      setError(syncError instanceof Error ? syncError.message : "Could not load admin notifications.");
    } finally {
      setLoading(false);
      setCacheReady(true);
      syncing.current = false;
    }
  }, []);

  useEffect(() => {
    const cache = getNotificationCache();
    if (cache) {
      setItems(cache.notifications);
      setUnreadCount(cache.unreadCount);
      setNextCursor(cache.nextCursor);
      setLatestCursor(cache.latestCursor ?? notificationCursor(cache.notifications[0]));
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
      setItems((current) => {
        if (current.some((item) => item.id === notification.id)) return current;
        return [notification, ...current].sort((left, right) =>
          right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
        );
      });
      setLatestCursor((current) => advanceNotificationCursor(current, notification));
      if (!notification.readAt) setUnreadCount((count) => count + 1);
    });
    return () => disconnectNotificationSocket(socket);
  }, [syncNotifications]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      const response = unwrapData<NotificationsResponse>(
        await adminFetch<unknown>(
          `/api/v1/notifications?limit=30&before=${encodeURIComponent(nextCursor)}`,
          { cache: "no-store" },
        ),
      );
      setItems((current) => [
        ...current,
        ...response.notifications.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setUnreadCount(response.unreadCount);
      setNextCursor(response.nextCursor);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load older notifications.");
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = async (notification: NotificationItem) => {
    if (notification.readAt) return;
    setError("");
    try {
      await adminFetch(`/api/v1/notifications/${encodeURIComponent(notification.id)}/read`, { method: "PATCH" });
      setItems((current) => current.map((item) => item.id === notification.id
        ? { ...item, readAt: new Date().toISOString() }
        : item));
      setUnreadCount((count) => Math.max(0, count - 1));
      window.dispatchEvent(new Event("safecrib:notifications-read"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not mark notification as read.");
    }
  };

  const markAllRead = async () => {
    setError("");
    try {
      await adminFetch("/api/v1/notifications/read-all", { method: "PATCH" });
      const readAt = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
      setUnreadCount(0);
      window.dispatchEvent(new Event("safecrib:notifications-read"));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not mark notifications as read.");
    }
  };

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">Operations</p>
          <h1 className="mt-2 text-3xl font-medium">Admin notifications</h1>
          <p className="mt-2 text-sm text-black/60">{unreadCount} unread</p>
        </div>
        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={unreadCount === 0}
          className="rounded-[4px] border border-black/15 bg-white px-4 py-2 text-sm font-medium disabled:opacity-40"
        >
          Mark all read
        </button>
      </header>
      {error && <p className="mt-6 rounded-[4px] border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">{error}</p>}
      {loading ? (
        <p className="mt-8 rounded-[8px] border border-black/10 bg-white p-6 text-sm text-black/55">Loading notifications...</p>
      ) : items.length === 0 ? (
        <p className="mt-8 rounded-[8px] border border-black/10 bg-white p-6 text-sm text-black/55">No admin notifications yet. New support messages and submissions will appear here.</p>
      ) : (
        <ul className="mt-8 space-y-3">
          {items.map((notification) => (
            <li key={notification.id} className={`rounded-[8px] border p-5 ${notification.readAt ? "border-black/10 bg-white" : "border-safecrib-green/25 bg-safecrib-green/[0.04]"}`}>
              <Link
                href={safeAdminHref(notification.href)}
                onClick={() => void markRead(notification)}
                className="block"
              >
                <span className="flex items-center gap-2 font-medium">
                  {!notification.readAt && <span aria-label="Unread" className="h-2 w-2 rounded-full bg-safecrib-green" />}
                  {notification.title}
                </span>
                <span className="mt-2 block text-sm leading-6 text-black/70">{notification.body}</span>
                <span className="mt-3 block text-xs text-black/45">{notificationDate(notification.createdAt)}</span>
              </Link>
              {!notification.readAt && (
                <button type="button" onClick={() => void markRead(notification)} className="mt-3 text-xs font-semibold text-safecrib-green hover:underline">
                  Mark as read
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {nextCursor && !loading && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-5 w-full rounded-[4px] border border-black/15 bg-white px-4 py-3 text-sm font-medium disabled:opacity-50"
        >
          {loadingMore ? "Loading..." : "Load older notifications"}
        </button>
      )}
    </div>
  );
}
