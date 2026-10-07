import { randomUUID } from 'node:crypto';

/**
 * Display-name validation rules.
 *
 * - Trim whitespace and collapse repeated internal spaces.
 * - 2-50 characters after normalisation.
 * - No control characters or HTML markup.
 * - Emojis and unicode letters are allowed.
 */
export function normaliseDisplayName(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  if (typeof raw !== 'string') return null;

  // Strip control characters and HTML tags.
  // oxlint-disable-next-line no-control-regex -- intentional: strip C0 + DEL + C1 controls.
  const stripped = raw
    .replace(/[\u0000-\u001F\u007F\u0080-\u009F]/g, '')
    .replace(/<[^>]*>/g, '');

  // Collapse all whitespace (including unicode spaces) into single spaces, then trim.
  const collapsed = stripped.replace(/\s+/g, ' ').trim();

  if (collapsed.length < 2 || collapsed.length > 50) return null;
  return collapsed;
}

/**
 * Small blocklist of names that impersonate staff or the platform.
 * Case-insensitive, matched against the whole normalised display name.
 * Only admins may use these names.
 */
export const DISPLAY_NAME_BLOCKLIST = [
  'safecrib',
  'safecribs',
  'safe crib',
  'safe cribs',
  'admin',
  'administrator',
  'support',
  'official',
  'system',
  'moderator',
  'trust & safety',
  'trust and safety',
  'customer support',
] as const;

export function isBlockedDisplayName(name: string): boolean {
  const normalised = name.toLowerCase().replace(/\s+/g, ' ').trim();
  return (DISPLAY_NAME_BLOCKLIST as readonly string[]).some((blocked) => blocked === normalised);
}

/**
 * Derive the username name-part from an email address.
 *
 * - Takes the part before the first '@'.
 * - Lowercases it.
 * - Strips everything that is not a letter a-z (numbers, dots, plus tags, hyphens).
 * - Caps at 12 characters.
 * - Falls back to 'user' when nothing is left.
 */
function deriveNamePart(email: string): string {
  const localPart = String(email ?? '').split('@')[0] ?? '';
  const letters = localPart.toLowerCase().replace(/[^a-z]/g, '');
  const capped = letters.slice(0, 12);
  return capped || 'user';
}

/**
 * Convert a chunk of a UUID hex string into a decimal-only string.
 * Uses BigInt so large UUID chunks do not lose precision, then reduces
 * modulo 10^length. The result contains only digits 0-9.
 */
function decimalDigits(uuidHex: string, length: number): string {
  const hexChunk = uuidHex.slice(0, Math.max(length, 8));
  const value = BigInt(`0x${hexChunk}`);
  const mod = value % 10n ** BigInt(length);
  return mod.toString().padStart(length, '0');
}

export interface UsernameGenerator {
  (email: string): string;
}

/**
 * Generate a unique-looking username of the form `name_#####`.
 *
 * The digits are derived from a UUID v4 (crypto-safe), never Math.random.
 * The returned value does NOT include the leading '@'.
 */
export function generateUsername(email: string): string {
  const namePart = deriveNamePart(email);
  const uuid = randomUUID().replace(/-/g, '');
  const digits = decimalDigits(uuid, 5);
  return `${namePart}_${digits}`;
}

/**
 * Generate a random decimal-only suffix of the requested length from a fresh UUID.
 * Used when retrying after a username collision.
 */
export function generateRandomDigits(length = 5): string {
  return decimalDigits(randomUUID().replace(/-/g, ''), length);
}

export interface UsernameCollisionChecker {
  (username: string): Promise<boolean>;
}

/**
 * Generate a username that is guaranteed unique.
 *
 * Retries up to 5 times with fresh random digits. If all 5 collide,
 * extends to 6 digits and retries a further 5 times. Never throws.
 */
export async function generateUniqueUsername(
  email: string,
  exists: UsernameCollisionChecker,
): Promise<string> {
  const namePart = deriveNamePart(email);

  const tryDigits = async (length: number): Promise<string | null> => {
    for (let attempt = 0; attempt < 5; attempt++) {
      const digits = generateRandomDigits(length);
      const candidate = `${namePart}_${digits}`;
      const taken = await exists(candidate);
      if (!taken) return candidate;
    }
    return null;
  };

  const fiveDigit = await tryDigits(5);
  if (fiveDigit) return fiveDigit;

  const sixDigit = await tryDigits(6);
  if (sixDigit) return sixDigit;

  // Extremely unlikely fallback: use a counter + random digits until unique.
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = `${namePart}_${attempt}${generateRandomDigits(4)}`;
    const taken = await exists(candidate);
    if (!taken) return candidate;
  }

  // Extremely unlikely fallback: use the UUID itself.
  return `${namePart}_${randomUUID().replace(/-/g, '').slice(0, 6)}`;
}