"use client";

import { io, type Socket } from "socket.io-client";
import { apiFetch } from "@/lib/api";
import { getBackendOrigin } from "@/lib/backend-origin";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function base64UrlToUint8Array(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const slice = value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  return slice as ArrayBuffer;
}

function keyToBase64Url(key: CryptoKey | ArrayBuffer | null): string {
  if (!key) return "";
  const raw = key instanceof ArrayBuffer ? key : key instanceof Uint8Array ? key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) : null;
  const bytes = raw instanceof ArrayBuffer ? new Uint8Array(raw) : null;
  if (!bytes) return "";
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (typeof byte !== "number") continue;
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

export async function enableBrowserPushNotifications(): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }

  const token = localStorage.getItem("safecrib_access_token");
  if (!token) return false;

  if (Notification.permission === "denied") {
    return false;
  }

  if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return false;
  }

  const config = await apiFetch<{ enabled?: boolean; publicKey?: string | null }>('/api/v1/notifications/push/config');
  if (!config.enabled || !config.publicKey) return false;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    localStorage.setItem("safecrib_push_enabled", "true");
    return true;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: toArrayBuffer(base64UrlToUint8Array(config.publicKey)),
  });

  const p256dh = subscription.getKey("p256dh");
  const auth = subscription.getKey("auth");

  await apiFetch("/api/v1/notifications/push/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: keyToBase64Url(p256dh),
      auth: keyToBase64Url(auth),
    }),
  });

  localStorage.setItem("safecrib_push_enabled", "true");
  return true;
}

export async function disableBrowserPushNotifications(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await apiFetch("/api/v1/notifications/push/subscriptions", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  await subscription.unsubscribe();
  localStorage.removeItem("safecrib_push_enabled");
}

/** Newsletter signup is separate from the in-app notification system. */
export async function subscribeToNotifications(email: string): Promise<void> {
  void email;
  const subscribed = await enableBrowserPushNotifications();
  if (subscribed) return;
  throw new NotificationBackendUnavailableError();
}

export class NotificationBackendUnavailableError extends Error {
  constructor() {
    super("Email subscriptions aren't connected yet.");
    this.name = "NotificationBackendUnavailableError";
  }
}

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  href: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsResponse = {
  notifications: NotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
  latestCursor: string | null;
  hasMoreAfter?: boolean;
};

export type NotificationCache = {
  notifications: NotificationItem[];
  unreadCount: number;
  nextCursor: string | null;
  latestCursor: string | null;
};

const NOTIFICATION_CACHE_PREFIX = "safecrib:notifications:v1:";

let notificationSocket: Socket | null = null;
let socketSubscribers = 0;
let socketUserId: string | null = null;

function tokenSubject(token: string) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const encoded = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const subject: unknown = (JSON.parse(atob(padded)) as { sub?: unknown }).sub;
    return typeof subject === "string" ? subject : null;
  } catch {
    return null;
  }
}

function notificationCacheKey() {
  const token = typeof window === "undefined"
    ? null
    : localStorage.getItem("safecrib_access_token");
  const userId = token ? tokenSubject(token) : null;
  return userId ? `${NOTIFICATION_CACHE_PREFIX}${userId}` : null;
}

export function getNotificationCache(): NotificationCache | null {
  const key = notificationCacheKey();
  if (!key) return null;
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const cache: unknown = JSON.parse(stored);
    if (
      typeof cache !== "object" ||
      cache === null ||
      !Array.isArray((cache as NotificationCache).notifications)
    ) {
      return null;
    }
    return cache as NotificationCache;
  } catch (error) {
    console.error("Could not read locally stored notifications.", error);
    return null;
  }
}

export function saveNotificationCache(cache: NotificationCache): void {
  const key = notificationCacheKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(cache));
  } catch (error) {
    console.error("Could not save notifications in local storage.", error);
  }
}

export function notificationCursor(item: NotificationItem | undefined): string | null {
  if (!item) return null;
  try {
    return btoa(`${item.createdAt}|${item.id}`)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  } catch (error) {
    console.error("Could not create a notification sync cursor.", error);
    return null;
  }
}

export function advanceNotificationCursor(
  current: string | null,
  item: NotificationItem,
): string | null {
  const candidate = notificationCursor(item);
  if (!candidate || !current) return candidate ?? current;
  try {
    const decode = (cursor: string) => {
      const normalized = cursor.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      return atob(padded).split("|", 2);
    };
    const [candidateDate, candidateId] = decode(candidate);
    const [currentDate, currentId] = decode(current);
    if (
      candidateDate &&
      currentDate &&
      (candidateDate > currentDate ||
        (candidateDate === currentDate && (candidateId ?? "") > (currentId ?? "")))
    ) {
      return candidate;
    }
  } catch (error) {
    console.error("Could not compare notification sync cursors.", error);
  }
  return current;
}

export function connectNotificationSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("safecrib_access_token");
  if (!token) return null;
  const currentUserId = tokenSubject(token);
  if (notificationSocket) {
    if (socketUserId === currentUserId) {
      socketSubscribers += 1;
      return notificationSocket;
    }
    notificationSocket.disconnect();
    notificationSocket = null;
    socketSubscribers = 0;
  }

  const origin = getBackendOrigin();
  let backendOrigin: string;
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported protocol");
    backendOrigin = parsed.origin;
  } catch {
    console.error("Cannot connect to notifications: the configured API origin is invalid.");
    return null;
  }

  notificationSocket = io(`${backendOrigin}/notifications`, {
    auth: (callback) => callback({ token: localStorage.getItem("safecrib_access_token") }),
    transports: ["polling", "websocket"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30_000,
    timeout: 10_000,
  });
  socketSubscribers = 1;
  socketUserId = currentUserId;
  return notificationSocket;
}

export function disconnectNotificationSocket(socket: Socket | null) {
  if (!socket || socket !== notificationSocket) return;
  socketSubscribers = Math.max(0, socketSubscribers - 1);
  if (socketSubscribers === 0) {
    socket.disconnect();
    notificationSocket = null;
    socketUserId = null;
  }
}
