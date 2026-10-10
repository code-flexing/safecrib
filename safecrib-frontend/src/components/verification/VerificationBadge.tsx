import { BadgeCheck, Crown, ShieldCheck } from "lucide-react";

function StaffStar({ size, ...props }: { size: number; [key: string]: unknown }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <polygon points="12,1 15.2,5.6 19.4,6 16.2,9.7 17.7,14.5 12,11.4 6.3,14.5 7.8,9.7 4.6,6 8.8,5.6" />
    </svg>
  );
}

export type VerificationStage = "PROFILE_VERIFIED" | "AGENT_VERIFIED" | "TRUST_CROWN" | "STAFF";

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
  badge: "GREEN_CHECK" | "BLUE_SHIELD" | "GOLD_CROWN" | "STAFF_STAR";
  badgeColor: "green" | "charcoal" | "gold" | "purple" | "admin" | "agent";
  colorToken?: string;
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
  STAFF: {
    badge: "STAFF_STAR",
    color: "purple",
    label: "SafeCribs Team",
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
  if (originalStage !== "PROFILE_VERIFIED" && originalStage !== "AGENT_VERIFIED" && originalStage !== "TRUST_CROWN" && originalStage !== "STAFF") return null;

  const riskBlocked = response.riskBlocked === true;
  const stage: VerificationStage = riskBlocked ? "PROFILE_VERIFIED" : originalStage;
  const config = stageConfig[stage];
  const badgeColor = typeof response.badgeColor === "string" && ["green", "charcoal", "gold", "purple", "admin", "agent"].includes(response.badgeColor)
    ? response.badgeColor as "green" | "charcoal" | "gold" | "purple" | "admin" | "agent"
    : config.color;
  const badge = typeof response.badge === "string" && ["GREEN_CHECK", "BLUE_SHIELD", "GOLD_CROWN", "STAFF_STAR"].includes(response.badge)
    ? response.badge as "GREEN_CHECK" | "BLUE_SHIELD" | "GOLD_CROWN" | "STAFF_STAR"
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
  const badgeColor = verification?.badgeColor ?? (badge === "GOLD_CROWN" ? "gold" : badge === "BLUE_SHIELD" ? "charcoal" : badge === "STAFF_STAR" ? "purple" : "green");
  const colorToken = verification?.colorToken ?? (badgeColor === "admin" ? "--badge-admin" : badgeColor === "agent" ? "--badge-agent" : "--badge-green");
  const riskBlocked = verification?.riskBlocked === true;
  const label = badge === "GOLD_CROWN"
    ? "Trust crown"
    : badge === "BLUE_SHIELD"
    ? (role === "STUDENT" ? "Verified student" : "Verified provider")
    : badge === "STAFF_STAR"
    ? "SafeCribs team"
    : (role === "STUDENT" ? "Verified student" : "Verified");

  const resolvedSize = size ?? (iconOnly ? 20 : compact ? 16 : 20);
  const pixelSize = resolveSize(resolvedSize);
  const fullDetail = pixelSize >= 24; 
  const glyphAriaLabel = `${label}${riskBlocked ? ", advanced badge upgrade blocked for review" : ""}`;
  const BadgeIcon = badge === "GOLD_CROWN" ? Crown : badge === "BLUE_SHIELD" ? ShieldCheck : badge === "STAFF_STAR" ? StaffStar : BadgeCheck;

  return (
    <span
      title={glyphAriaLabel}
      aria-label={glyphAriaLabel}
      className="inline-flex shrink-0 items-center justify-center align-middle bg-transparent p-0"
      style={{ width: pixelSize, height: pixelSize, flexShrink: 0, color: `var(${colorToken})` }}
    >
      <BadgeIcon size={pixelSize} strokeWidth={2.25} aria-hidden="true" />
      {iconOnly ? null : <span className="sr-only">{glyphAriaLabel}</span>}
    </span>
  );
}

export function criterionLabel(key: string, providedLabel?: string) {
  return providedLabel || criterionLabels[key] || key;
}