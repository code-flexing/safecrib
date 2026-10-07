export type HSL = { h: number; s: number; l: number };

const memory = new Map<string, HSL | null>();
const LS_PREFIX = "sc:avatar-accent:";

function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s, l };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function extractAvatarAccent(src: string): Promise<HSL | null> {
  try {
    const img = await loadImage(src);
    const size = 32;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);

    const buckets = new Array(36).fill(0).map(() => ({ w: 0, s: 0, l: 0 }));
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! < 200) continue;
      const { h, s, l } = rgbToHsl(data[i]!, data[i + 1]!, data[i + 2]!);
      if (s < 0.2 || l < 0.12 || l > 0.9) continue;
      const weight = s * (1 - Math.abs(l - 0.5));
      const b = buckets[Math.floor(h / 10) % 36]!;
      b.w += weight;
      b.s += s * weight;
      b.l += l * weight;
    }
    let best = -1;
    let bestW = 0;
    buckets.forEach((b, i) => {
      if (b.w > bestW) {
        bestW = b.w;
        best = i;
      }
    });
    if (best < 0 || bestW < 0.5) return null;
    const b = buckets[best]!;
    return { h: best * 10 + 5, s: b.s / b.w, l: b.l / b.w };
  } catch {
    return null;
  }
}

export function toAccentCss(c: HSL, mode: "dark" | "light") {
  const s = Math.min(0.72, Math.max(0.38, c.s));
  const l = mode === "dark" ? Math.min(0.42, Math.max(0.28, c.l * 0.7)) : Math.min(0.62, Math.max(0.48, c.l));
  return `hsl(${Math.round(c.h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

export async function getAvatarAccent(userId: string, version: string, src: string) {
  const key = `${userId}:${version}`;
  if (memory.has(key)) return memory.get(key)!;
  try {
    const cached = localStorage.getItem(LS_PREFIX + key);
    if (cached) {
      const v = JSON.parse(cached) as HSL | null;
      memory.set(key, v);
      return v;
    }
  } catch {}
  const result = await extractAvatarAccent(src);
  memory.set(key, result);
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(result));
  } catch {}
  return result;
}

export function clearAvatarAccentCache(userId: string) {
  if (typeof window === "undefined") return;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LS_PREFIX + userId + ":")) {
      localStorage.removeItem(key);
    }
  }
}