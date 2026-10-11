import type { VerificationStageResult } from "./VerificationBadge";

export type VerificationKind = "student" | "agent" | "landlord" | "staff";

export interface VerificationKindConfig {
  kind: VerificationKind;
  glyph: "check" | "star";
  size: "sm" | "md" | "lg" | "xl" | number;
  colorToken: string;
  label: string;
  ariaLabel: string;
  tooltipTitle: string;
  popoverText: string;
  className: string;
}

export const VERIFICATION_KINDS: Record<VerificationKind, VerificationKindConfig> = {
  student: {
    kind: "student",
    glyph: "check",
    size: 16,
    colorToken: "--badge-green",
    label: "Verified student",
    ariaLabel: "Verified student",
    tooltipTitle: "Verified student",
    popoverText: "Verified student \u2728 This student's identity was checked by SafeCribs.",
    className: "text-green-500",
  },
  agent: {
    kind: "agent",
    glyph: "check",
    size: 16,
    colorToken: "--badge-agent",
    label: "Verified agent",
    ariaLabel: "Verified agent",
    tooltipTitle: "Verified agent",
    popoverText: "Verified agent 🏡 This agent's identity and provider page were checked by SafeCribs.",
    className: "text-orange-500",
  },
  landlord: {
    kind: "landlord",
    glyph: "check",
    size: 16,
    colorToken: "--badge-agent",
    label: "Verified landlord",
    ariaLabel: "Verified landlord",
    tooltipTitle: "Verified landlord",
    popoverText: "Verified landlord 🏡 This landlord's identity and provider page were checked by SafeCribs.",
    className: "text-orange-500",
  },
  staff: {
    kind: "staff",
    glyph: "star",
    size: 16,
    colorToken: "--badge-admin",
    label: "SafeCribs team",
    ariaLabel: "SafeCribs team",
    tooltipTitle: "SafeCribs team",
    popoverText: "SafeCribs team 💜 This account belongs to the SafeCribs team.",
    className: "text-blue-500",
  },
} as const;

export function kindFromVerification(verification: { kind?: string | null } | VerificationStageResult | null | undefined): VerificationKind | null {
  if (!verification) return null;
  const kind = (verification as { kind?: string | null }).kind;
  if (kind && typeof kind === "string" && Object.keys(VERIFICATION_KINDS).includes(kind)) return kind as VerificationKind;
  return null;
}

export function resolveVerificationKind(verification: { kind?: string | null } | VerificationStageResult | null | undefined): VerificationKindConfig | null {
  const kind = kindFromVerification(verification);
  if (!kind) return null;
  return VERIFICATION_KINDS[kind];
}
