"use client";

import { io, type Socket } from "socket.io-client";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

/** Newsletter signup is separate from the in-app notification system. */
export async function subscribeToNotifications(email: string): Promise<void> {
  void email;
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
};

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

  const origin = process.env.NEXT_PUBLIC_API_ORIGIN
    ?? process.env.NEXT_PUBLIC_API_URL
    ?? process.env.NEXT_PUBLIC_BACKEND_URL
    ?? "https://safecrib.onrender.com";
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
    transports: ["websocket", "polling"],
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
