/**
 * Whether the decorative burst effects (Like celebration, Recommend lightning)
 * should run at all.
 *
 * Evaluated once and cached because the checks are cheap and the values do
 * not change for the lifetime of the page.
 *
 * When disabled we still keep the instant button feedback (the pop, the
 * colour/fill transition and the count change) — only the particles, bolts
 * and glows are skipped.
 */

interface NavigatorConnection {
  saveData?: boolean;
}

interface ExtendedNavigator extends Navigator {
  connection?: NavigatorConnection;
  deviceMemory?: number;
  hardwareConcurrency: number;
}

type EffectsEnabled = {
  reducedMotion: boolean;
  dataSaver: boolean;
  lowMemory: boolean;
  lowCores: boolean;
  hidden: boolean;
};

let cached: EffectsEnabled | null = null;

function compute(): EffectsEnabled {
  const reducedMotion =
    typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false;

  const nav = (typeof navigator !== "undefined" ? navigator : null) as ExtendedNavigator | null;
  const connection = nav?.connection;
  const dataSaver = Boolean(connection?.saveData);

  const deviceMemory = nav?.deviceMemory;
  const lowMemory = typeof deviceMemory === "number" && deviceMemory <= 2;

  const hardwareConcurrency = nav?.hardwareConcurrency;
  const lowCores =
    typeof hardwareConcurrency === "number" && Number.isFinite(hardwareConcurrency) && hardwareConcurrency <= 2;

  return { reducedMotion, dataSaver, lowMemory, lowCores, hidden: typeof document !== "undefined" ? document.hidden : false };
}

export function areEffectsEnabled(): boolean {
  if (cached === null) {
    cached = compute();
  }
  return (
    !cached.reducedMotion &&
    !cached.dataSaver &&
    !cached.lowMemory &&
    !cached.lowCores &&
    !cached.hidden
  );
}

export function getEffectsFlags(): EffectsEnabled {
  if (cached === null) {
    cached = compute();
  }
  return cached;
}