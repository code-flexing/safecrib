import { useEffect, useState } from "react";
import { normalizeVerificationStage, type VerificationStageResult } from "@/components/verification/VerificationBadge";

export type { VerificationStageResult };

/** A cached, normalised public stage for a user id. null = unknown (render nothing). */
export type CachedStage = VerificationStageResult | null;

const cache = new Map<string, CachedStage>();
const subscribers = new Set<() => void>();
const maxAgeMs = 10 * 60 * 1000; // 10 minutes — refreshed by the next normal payload
const storedAtKey = (userId: string) => `safecrib:verification-stage:${encodeURIComponent(userId)}:updatedAt`;

function notify() {
  subscribers.forEach((cb) => cb());
}

function readStored(userId: string): CachedStage {
  if (typeof window === "undefined") return null;
  try {
    const updatedAt = Number(localStorage.getItem(storedAtKey(userId)));
    if (Number.isFinite(updatedAt) && Date.now() - updatedAt >= maxAgeMs) return null;
    const raw = localStorage.getItem(`safecrib:verification-stage:${encodeURIComponent(userId)}`);
    if (!raw) return null;
    return normalizeVerificationStage(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function writeStored(userId: string, value: unknown) {
  if (typeof window === "undefined" || !userId) return;
  try {
    localStorage.setItem(`safecrib:verification-stage:${encodeURIComponent(userId)}`, JSON.stringify(value));
    localStorage.setItem(storedAtKey(userId), String(Date.now()));
  } catch {
    // Storage may be unavailable or full.
  }
}

/** Pull the public stage fields out of a user/agent object in any shape the API uses. */
export function extractStageFields(user: unknown): unknown {
  if (!user || typeof user !== "object") return null;
  const record = user as Record<string, unknown>;
  if (typeof record.verificationStage === "string") return { stage: record.verificationStage };
  const verification = record.verification;
  if (verification && typeof verification === "object") {
    const v = verification as Record<string, unknown>;
    if (typeof v.stage === "string" || typeof v.badge === "string" || typeof v.badgeColor === "string" || v.eligible === true || v.riskBlocked === true) {
      return {
        stage: v.stage,
        badge: v.badge,
        badgeColor: v.badgeColor,
        riskBlocked: v.riskBlocked,
        eligible: v.eligible,
      };
    }
  }
  return null;
}

/** Seed the cache from a user/agent object that carries a stage. Idempotent. */
export function recordUserStage(user: unknown): CachedStage {
  const fields = extractStageFields(user);
  if (!fields) return null;
  const record = user as Record<string, unknown>;
  const userId = typeof record.id === "string" ? record.id : undefined;
  const normalized = normalizeVerificationStage(fields);
  if (!normalized) return null;
  if (!userId) return normalized;
  const previous = cache.get(userId);
  if (previous && previous.stage === normalized.stage && previous.badgeColor === normalized.badgeColor && previous.riskBlocked === normalized.riskBlocked) {
    return previous;
  }
  cache.set(userId, normalized);
  writeStored(userId, fields);
  notify();
  return normalized;
}

/** Seed the cache from a list of user/agent objects. */
export function recordUserStages(users: unknown[]): void {
  if (!Array.isArray(users)) return;
  for (const user of users) recordUserStage(user);
}

export function getVerificationStage(userId: string | undefined | null): CachedStage {
  if (!userId) return null;
  const inMemory = cache.get(userId);
  if (inMemory !== undefined) return inMemory;
  const stored = readStored(userId);
  if (stored) cache.set(userId, stored);
  return stored;
}

export function subscribeVerificationStage(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function clearStageCache() {
  cache.clear();
  subscribers.clear();
  if (typeof window === "undefined") return;
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const key = localStorage.key(i);
    if (key?.startsWith("safecrib:verification-stage:")) localStorage.removeItem(key);
  }
}

/** React hook: returns the cached stage for a user id, updating when the cache changes. */
export function useVerificationStage(userId: string | undefined | null): CachedStage {
  const [stage, setStage] = useState<CachedStage>(() => getVerificationStage(userId));
  useEffect(() => {
    const current = getVerificationStage(userId);
    if (current && current !== stage) setStage(current);
    const unsubscribe = subscribeVerificationStage(() => {
      const next = getVerificationStage(userId);
      setStage((previous) => (previous && next && previous.stage === next.stage && previous.badgeColor === next.badgeColor && previous.riskBlocked === next.riskBlocked ? previous : next));
    });
    return unsubscribe;
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps
  return stage;
}

export const verificationStageCache = {
  record: recordUserStage,
  recordAll: recordUserStages,
  get: getVerificationStage,
  subscribe: subscribeVerificationStage,
  clear: clearStageCache,
};