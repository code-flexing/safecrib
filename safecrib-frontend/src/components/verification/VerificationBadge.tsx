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
  badgeColor: "green" | "blue" | "gold";
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
    color: "blue",
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
  const badgeColor = typeof response.badgeColor === "string" && ["green", "blue", "gold"].includes(response.badgeColor)
    ? response.badgeColor as "green" | "blue" | "gold"
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

export function VerificationBadge({ verification, verified = false, compact = false, iconOnly = false }: { verification?: VerificationStageResult | null; verified?: boolean; compact?: boolean; iconOnly?: boolean }) {
  if (!verification?.eligible && !verified) return null;

  const badge = verification?.badge ?? "GREEN_CHECK";
  const role = verification?.role ?? "STUDENT";
  const badgeColor = verification?.badgeColor ?? (badge === "GOLD_CROWN" ? "gold" : badge === "BLUE_SHIELD" ? "blue" : "green");
  const riskBlocked = verification?.riskBlocked === true;
  const label = badge === "GOLD_CROWN" ? "Trusted provider" : badge === "BLUE_SHIELD" ? (role === "STUDENT" ? "Verified student" : "Verified provider") : (role === "STUDENT" ? "Verified student" : "Verified");
  return (
    <span
      title={`${label}${riskBlocked ? ". Advanced badge upgrade is blocked for review." : ""}`}
      aria-label={`${label}${riskBlocked ? ", risk review required" : ""}`}
      className={`verification-badge verification-badge--${badgeColor} inline-flex w-fit items-center gap-2 rounded-full border font-semibold ${iconOnly ? "verification-badge--icon h-5 w-5 justify-center border-0 bg-transparent p-0" : compact ? "px-2 py-0.5 text-[0.7rem]" : "px-3 py-1.5 text-sm"}`}
    >
      {iconOnly ? <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path fill="currentColor" stroke="none" d="M12 1.25 14.1 3.1l2.8-.75L18 5.1l2.9.45-.45 2.9 2.3 2.05-1.9 2.3.75 2.9-2.75 1.15-.5 2.9-2.9-.45-2.1 2.7-2.3-1.9-2.85.75-1.15-2.75-2.9-.45.45-2.9L2.3 12.7l1.9-2.3-.75-2.9L6.2 6.35l.5-2.9 2.9.45Z" />
        {badge === "GOLD_CROWN" ? <path d="m5.5 9 4 2.6L12 6l2.5 5.6L18.5 9l-1 8h-11z" /> : <path d="m7.5 12 3 3 6-6" />}
      </svg> : <svg aria-hidden="true" viewBox="0 0 20 20" className={`shrink-0 ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {badge === "GOLD_CROWN" && <path d="m2.5 6 4.3 3.2L10 3l3.2 6.2L17.5 6l-1.2 9H3.7L2.5 6Zm1.2 12h12.6" />}
        {(badge === "GREEN_CHECK" || badge === "BLUE_SHIELD") && <path d="m4 10 4 4 8-9" />}
      </svg>}
      <span className={iconOnly ? "sr-only" : undefined}>{label}</span>
    </span>
  );
}

export function criterionLabel(key: string, providedLabel?: string) {
  return providedLabel || criterionLabels[key] || key;
}
