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

function getGlyphColor(badgeColor: "green" | "blue" | "gold"): string {
  return badgeColor === "gold" ? "var(--badge-gold-glyph)" : "white";
}

function getFillColor(badgeColor: "green" | "blue" | "gold"): string {
  return `var(--badge-${badgeColor})`;
}

function getRingColor(): string {
  return "var(--badge-ring)";
}

function SealIcon({ badgeColor, size, fullDetail }: { badgeColor: "green" | "blue" | "gold"; size: number; fullDetail: boolean }) {
  const glyphColor = getGlyphColor(badgeColor);
  const fillColor = getFillColor(badgeColor);
  const ringColor = getRingColor();
  const unit = size / 28;
  const sealSize = 56 * unit;
  const radius = sealSize / 2;
  const ringRadius = 25 * unit;
  const ringStroke = 1.5 * unit;
  const glyphStroke = size <= 20 ? 6 * unit : 5 * unit;

  const checkPath = `M${-10 * unit},0 L${-3 * unit},${7 * unit} L${11 * unit},${-8 * unit}`;
  const shieldPath = `M0,${-13 * unit} L${11 * unit},${-9 * unit} V0 Q${11 * unit},${9 * unit} 0,${14 * unit} Q${-11 * unit},${9 * unit} ${-11 * unit},0 V${-9 * unit} Z`;
  const crownPath = `M${-12 * unit},${7 * unit} L${-14 * unit},${-8 * unit} L${-6 * unit},${-1 * unit} L0,${-12 * unit} L${6 * unit},${-1 * unit} L${14 * unit},${-8 * unit} L${12 * unit},${7 * unit} Z`;
  const crownBase = `M${-12 * unit},${9 * unit} h${24 * unit} v${3.5 * unit} h${-24 * unit} Z`;

  // Create a scalloped circle path - 12 scallops around the circle
  const scallopCount = 12;
  const scallopAngle = (Math.PI * 2) / scallopCount;
  const outerRadius = radius;
  const innerRadius = radius - 4 * unit;
  
  let scallopedPath = `M${outerRadius},0`;
  for (let i = 1; i <= scallopCount; i++) {
    const angle = i * scallopAngle;
    const nextAngle = (i + 1) * scallopAngle;
    // Outer point
    const ox = Math.cos(angle) * outerRadius;
    const oy = Math.sin(angle) * outerRadius;
    // Inner point (for the scallop dip)
    const ix = Math.cos(angle + scallopAngle / 2) * innerRadius;
    const iy = Math.sin(angle + scallopAngle / 2) * innerRadius;
    scallopedPath += ` L${ox},${oy} Q${ix},${iy} ${Math.cos(nextAngle) * outerRadius},${Math.sin(nextAngle) * outerRadius}`;
  }
  scallopedPath += "Z";

  return (
    <svg
      viewBox={`-${sealSize / 2} -${sealSize / 2} ${sealSize} ${sealSize}`}
      width={size}
      height={size}
      role="img"
      aria-hidden="true"
      className="shrink-0"
      style={{ flexShrink: 0 }}
    >
      <path
        d={scallopedPath}
        fill={fillColor}
      />
      {fullDetail && (
        <circle
          cx="0"
          cy="0"
          r={ringRadius}
          fill="none"
          stroke={ringColor}
          strokeWidth={ringStroke}
        />
      )}
      <g transform="scale(1, -1)" fill={glyphColor}>
        {badgeColor === "green" && (
          <path
            d={checkPath}
            fill="none"
            stroke={glyphColor}
            strokeWidth={glyphStroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {badgeColor === "blue" && (
          <path d={shieldPath} />
        )}
        {badgeColor === "gold" && (
          <>
            <path d={crownPath} />
            {fullDetail && <path d={crownBase} rx={1.5 * unit} />}
          </>
        )}
      </g>
    </svg>
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
  const badgeColor = verification?.badgeColor ?? (badge === "GOLD_CROWN" ? "gold" : badge === "BLUE_SHIELD" ? "blue" : "green");
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