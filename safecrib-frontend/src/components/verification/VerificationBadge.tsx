import { BadgeCheck, Crown, ShieldCheck } from "lucide-react";

export type VerificationStage = "PROFILE_VERIFIED" | "AGENT_VERIFIED" | "TRUST_CROWN";

export type VerificationCriterion = {
  key: string;
  label?: string;
  met: boolean;
  required?: boolean;
};

export type VerificationStageResult = {
  userId?: string;
  role?: string;
  eligible: boolean;
  stage: VerificationStage;
  badge: "GREEN_CHECK" | "BLUE_SHIELD" | "GOLD_CROWN";
  badgeColor: "green" | "charcoal" | "gold";
  riskBlocked: boolean;
  nextMilestone: string | null;
  criteria: VerificationCriterion[];
  generatedAt?: string;
};

const stageConfig = {
  PROFILE_VERIFIED: {
    badge: "GREEN_CHECK",
    color: "green",
    label: "Verified",
  },
  AGENT_VERIFIED: {
    badge: "BLUE_SHIELD",
    color: "charcoal",
    label: "Verified provider",
  },
  TRUST_CROWN: {
    badge: "GOLD_CROWN",
    color: "gold",
    label: "Trusted provider",
  },
} as const;

const criterionLabels: Record<string, string> = {
  identity: "Identity verified",
  provider: "Provider verification",
  student: "Student verification",
  trust: "Trust score threshold",
  followers: "Followers",
};

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

export function normalizeVerificationStage(value: unknown): VerificationStageResult | null {
  const outer = recordValue(value);
  const response = recordValue(outer.data ?? value);
  const originalStage = response.stage;
  if (originalStage !== "PROFILE_VERIFIED" && originalStage !== "AGENT_VERIFIED" && originalStage !== "TRUST_CROWN") return null;

  const riskBlocked = response.riskBlocked === true;
  const stage: VerificationStage = riskBlocked ? "PROFILE_VERIFIED" : originalStage;
  const config = stageConfig[stage];
  const badgeColor = typeof response.badgeColor === "string" && ["green", "charcoal", "gold"].includes(response.badgeColor)
    ? response.badgeColor as "green" | "charcoal" | "gold"
    : config.color;
  const badge = typeof response.badge === "string" && ["GREEN_CHECK", "BLUE_SHIELD", "GOLD_CROWN"].includes(response.badge)
    ? response.badge as "GREEN_CHECK" | "BLUE_SHIELD" | "GOLD_CROWN"
    : config.badge;
  const criteria = Array.isArray(response.criteria)
    ? response.criteria.flatMap((item): VerificationCriterion[] => {
        const criterion = recordValue(item);
        if (typeof criterion.key !== "string" || typeof criterion.met !== "boolean") return [];
        return [{
          key: criterion.key,
          label: typeof criterion.label === "string" ? criterion.label : criterionLabels[criterion.key] ?? criterion.key,
          met: criterion.met,
          required: typeof criterion.required === "boolean" ? criterion.required : undefined,
        }];
      })
    : [];

  return {
    userId: typeof response.userId === "string" ? response.userId : undefined,
    role: typeof response.role === "string" ? response.role : undefined,
    eligible: response.eligible === true,
    stage,
    badge,
    badgeColor,
    riskBlocked,
    nextMilestone: typeof response.nextMilestone === "string" ? response.nextMilestone : null,
    criteria,
    generatedAt: typeof response.generatedAt === "string" ? response.generatedAt : undefined,
  };
}

type BadgeSize = "sm" | "md" | "lg" | "xl" | number;

const SIZE_MAP: Record<string, number> = {
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
};

function resolveSize(size: BadgeSize): number {
  if (typeof size === "number") return size;
  return SIZE_MAP[size] ?? 16;
}

function getGlyphColor(badgeColor: "green" | "charcoal" | "gold"): string {
  return badgeColor === "gold" ? "var(--badge-gold-glyph)" : "white";
}

function getFillColor(badgeColor: "green" | "charcoal" | "gold"): string {
  return badgeColor === "charcoal" ? "#111827" : `var(--badge-${badgeColor})`;
}

function SealIcon({ badgeColor, size, fullDetail }: { badgeColor: "green" | "charcoal" | "gold"; size: number; fullDetail: boolean }) {
  const fillColor = getFillColor(badgeColor);
  const accentColor = getGlyphColor(badgeColor);
  const Icon = badgeColor === "green" ? BadgeCheck : badgeColor === "charcoal" ? ShieldCheck : Crown;
  const iconSize = fullDetail ? Math.max(12, size * 0.7) : Math.max(10, size * 0.64);

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        background: fillColor,
        color: accentColor,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
      }}
    >
      <Icon size={iconSize} strokeWidth={2.25} aria-hidden="true" />
    </span>
  );
}

export function VerificationBadge({
  verification,
  verified = false,
  compact = false,
  iconOnly = false,
  size,
}: {
  verification?: VerificationStageResult | null;
  verified?: boolean;
  compact?: boolean;
  iconOnly?: boolean;
  size?: BadgeSize;
}) {
  if (!verification?.eligible && !verified) return null;

  const badge = verification?.badge ?? "GREEN_CHECK";
  const role = verification?.role ?? "STUDENT";
  const badgeColor = verification?.badgeColor ?? (badge === "GOLD_CROWN" ? "gold" : badge === "BLUE_SHIELD" ? "charcoal" : "green");
  const riskBlocked = verification?.riskBlocked === true;
  const label = badge === "GOLD_CROWN"
    ? "Trust crown"
    : badge === "BLUE_SHIELD"
    ? (role === "STUDENT" ? "Verified student" : "Verified provider")
    : (role === "STUDENT" ? "Verified student" : "Verified");

  const resolvedSize = size ?? (iconOnly ? 20 : compact ? 16 : 20);
  const pixelSize = resolveSize(resolvedSize);
  const fullDetail = pixelSize >= 24;
  const glyphAriaLabel = `${label}${riskBlocked ? ", advanced badge upgrade blocked for review" : ""}`;

  return (
    <span
      title={glyphAriaLabel}
      aria-label={glyphAriaLabel}
      className={`inline-flex items-center justify-center shrink-0 verification-badge verification-badge--${badgeColor} ${iconOnly ? "verification-badge--icon" : ""}`}
      style={{ width: pixelSize, height: pixelSize, flexShrink: 0 }}
    >
      <SealIcon badgeColor={badgeColor} size={pixelSize} fullDetail={fullDetail} />
      {iconOnly ? null : <span className="sr-only">{glyphAriaLabel}</span>}
    </span>
  );
}

export function criterionLabel(key: string, providedLabel?: string) {
  return providedLabel || criterionLabels[key] || key;
}