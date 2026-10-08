"use client";

import type { ApiError } from "@/lib/api";

export type NotificationVariant = "error" | "success" | "info";

export interface NotificationMessage {
  message: string;
  action?: { label: string };
  variant: NotificationVariant;
}

export interface ResolvedNotification {
  key: string;
  status?: number;
}

const NETWORK_KEY = "error.network";
const SESSION_KEY = "error.session";
const FORBIDDEN_KEY = "error.forbidden";
const NOT_FOUND_KEY = "error.not_found";
const RATE_LIMITED_KEY = "error.rate_limited";
const SERVER_KEY = "error.server";
const UNKNOWN_KEY = "error.unknown";

const contextFallbackKeys: Record<string, string> = {
  like: "error.like_failed",
  "video-like": "error.like_failed",
  bookmark: "error.bookmark_failed",
  recommend: "error.recommend_failed",
  follow: "error.follow_failed",
  comment: "error.comment_failed",
  upload: "error.upload_failed",
  login: "error.login_failed",
  signup: "error.signup_failed",
  default: UNKNOWN_KEY,
};

const catalog: Record<string, NotificationMessage> = {
  [NETWORK_KEY]: {
    message: "Looks like your network took a break. We'll be here when it's back 📶",
    variant: "error",
  },
  [SESSION_KEY]: {
    message: "Your session took a nap. Log in again to continue.",
    action: { label: "Log in" },
    variant: "error",
  },
  [FORBIDDEN_KEY]: {
    message: "You don't have access to that one.",
    variant: "error",
  },
  [NOT_FOUND_KEY]: {
    message: "We couldn't find that. It may have been removed.",
    variant: "error",
  },
  [RATE_LIMITED_KEY]: {
    message: "Easy there, too many taps! Give it a few seconds.",
    variant: "error",
  },
  [SERVER_KEY]: {
    message: "Something went wrong on our side. We're on it, try again shortly.",
    variant: "error",
  },
  [UNKNOWN_KEY]: {
    message: "Something didn't work out. Please try again.",
    variant: "error",
  },
  "error.like_failed": {
    message: "Hey buddy, that post didn't get your like. Give it another tap 👍",
    action: { label: "Try again" },
    variant: "error",
  },
  "error.bookmark_failed": {
    message: "Hey buddy, we couldn't save that. Try again in a moment.",
    action: { label: "Try again" },
    variant: "error",
  },
  "error.recommend_failed": {
    message: "That recommendation didn't go through. Try again?",
    action: { label: "Try again" },
    variant: "error",
  },
  "error.follow_failed": {
    message: "Couldn't follow them just now. Try again in a moment.",
    action: { label: "Try again" },
    variant: "error",
  },
  "error.comment_failed": {
    message: "Oops, your comment didn't go through. Try sending it again.",
    action: { label: "Try again" },
    variant: "error",
  },
  "error.upload_failed": {
    message: "That upload slipped away. Check your connection and try once more.",
    action: { label: "Try again" },
    variant: "error",
  },
  "error.login_failed": {
    message: "That login didn't work. Double-check your email and password.",
    action: { label: "Try again" },
    variant: "error",
  },
  "error.signup_failed": {
    message: "That signup didn't work. Check your details and try again.",
    action: { label: "Try again" },
    variant: "error",
  },
};

const successCatalog: Record<string, NotificationMessage> = {
  "success.like": { message: "Liked! 👍", variant: "success" },
  "success.bookmark": { message: "Saved! 🎉", variant: "success" },
  "success.recommend": { message: "Recommendation saved! 🎉", variant: "success" },
  "success.follow": { message: "You're following them now! 👍", variant: "success" },
  "success.comment": { message: "Comment posted! 💬", variant: "success" },
};

const infoCatalog: Record<string, NotificationMessage> = {
  "info.network": {
    message: "Looks like your network took a break. We'll be here when it's back 📶",
    variant: "info",
  },
};

export function resolveNotificationKey(error: unknown, context: string): ResolvedNotification {
  const isOffline =
    typeof navigator !== "undefined" &&
    "onLine" in navigator &&
    navigator.onLine === false;

  if (error instanceof Error) {
    const err = error as Partial<ApiError>;
    if (err.name === "AbortError") {
      return { key: "error.aborted" };
    }
    if (typeof err.status === "number") {
      const status = err.status;
      if (status === 401) return { key: SESSION_KEY, status };
      if (status === 403) return { key: FORBIDDEN_KEY, status };
      if (status === 404) return { key: NOT_FOUND_KEY, status };
      if (status === 429) return { key: RATE_LIMITED_KEY, status };
      if (status >= 500) return { key: SERVER_KEY, status };
      if (status >= 400) {
        const fallback = contextFallbackKeys[context] ?? UNKNOWN_KEY;
        return { key: fallback, status };
      }
    }
    if (isOffline || err.name === "TypeError" || err.message?.includes("fetch")) {
      return { key: NETWORK_KEY };
    }
  }

  if (isOffline) {
    return { key: NETWORK_KEY };
  }

  const fallback = contextFallbackKeys[context] ?? UNKNOWN_KEY;
  return { key: fallback };
}

export function getNotificationMessage(key: string): NotificationMessage {
  const all: Record<string, NotificationMessage> = {
    ...catalog,
    ...successCatalog,
    ...infoCatalog,
  };
  return all[key] ?? catalog[UNKNOWN_KEY]!;
}

export function getNotificationCatalog(): Record<string, NotificationMessage> {
  return catalog;
}

export function getSuccessCatalog(): Record<string, NotificationMessage> {
  return successCatalog;
}
