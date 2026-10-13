/**
 * Global burst registry.
 *
 * Two constraints, enforced here so every button shares one rule:
 *  1. Per button: only one burst active at a time, plus an 800ms cooldown
 *     between bursts on the same button. Rapid taps still toggle state and
 *     counts instantly (that lives in the optimistic hook / click handler);
 *     this only stops particles stacking and prevents duplicate bursts.
 *  2. Global: at most 3 bursts on screen at once. New fires that would exceed
 *     the cap are silently dropped (no queue, no state change).
 *
 * Module-level singleton: state is intentionally global so the cap is shared
 * across every button in the feed, on the detail page, etc.
 */

const GLOBAL_CAP = 3;
const COOLDOWN_MS = 800;

const activeIds = new Set<string>();
const buttonActiveId = new Map<string, string>();
const buttonNextAllowedAt = new Map<string, number>();
let counter = 0;

export function canFire(buttonKey: string): boolean {
  if (buttonActiveId.has(buttonKey)) return false;
  const nextAllowed = buttonNextAllowedAt.get(buttonKey) ?? 0;
  if (Date.now() < nextAllowed) return false;
  if (activeIds.size >= GLOBAL_CAP) return false;
  return true;
}

/** Returns a burst id if this button may fire now, otherwise null. */
export function acquire(buttonKey: string): string | null {
  if (!canFire(buttonKey)) return null;
  const id = `burst-${(counter += 1)}`;
  activeIds.add(id);
  buttonActiveId.set(buttonKey, id);
  buttonNextAllowedAt.set(buttonKey, Date.now() + COOLDOWN_MS);
  return id;
}

export function release(buttonKey: string, id: string): void {
  if (buttonActiveId.get(buttonKey) !== id) return;
  activeIds.delete(id);
  buttonActiveId.delete(buttonKey);
}

export function getActiveCount(): number {
  return activeIds.size;
}