"use client";

import { VerificationBadge } from "@/components/verification/VerificationBadge";

type VerificationStage = "PROFILE_VERIFIED" | "AGENT_VERIFIED" | "TRUST_CROWN";

const STAGES: VerificationStage[] = ["PROFILE_VERIFIED", "AGENT_VERIFIED", "TRUST_CROWN"];

const STAGE_LABELS: Record<VerificationStage, string> = {
  PROFILE_VERIFIED: "Profile verified",
  AGENT_VERIFIED: "Agent verified",
  TRUST_CROWN: "Trust crown",
};

interface VerificationProgressLadderProps {
  currentStage: VerificationStageResult | null;
  nextMilestone?: string | null;
}

export function VerificationProgressLadder({ currentStage, nextMilestone }: VerificationProgressLadderProps) {
  const currentIndex = currentStage?.stage ? STAGES.indexOf(currentStage.stage) : -1;
  const isRiskBlocked = currentStage?.riskBlocked === true;

  return (
    <div className="space-y-4" aria-labelledby="progress-heading">
      <p id="progress-heading" className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">
        Verification progress
      </p>
      <div className="relative">
        <div className="absolute left-1/2 top-4 -translate-x-1/2 w-[2px] h-[calc(100%-1rem)] bg-black/10" aria-hidden="true" />
        <div className="relative flex items-start justify-between">
          {STAGES.map((stage, index) => {
            const isCurrent = index === currentIndex;
            const isPast = index < currentIndex;
            const isFuture = index > currentIndex;
            const badgeColor = stage === "PROFILE_VERIFIED" ? "green" : stage === "AGENT_VERIFIED" ? "blue" : "gold";

            return (
              <div key={stage} className="flex flex-col items-center relative z-10">
                <div
                  className={`relative inline-flex items-center justify-center w-14 h-14 rounded-[10px] border-2 transition-all duration-300 ${
                    isPast || isCurrent
                      ? "border-transparent shadow-[0_0_0_3px_rgba(18,161,80,0.15)]"
                      : "border-black/10 bg-white"
                  } ${isRiskBlocked && isCurrent ? "ring-2 ring-amber-300" : ""}`}
                  style={{
                    background: isPast || isCurrent ? `var(--badge-${badgeColor})` : undefined,
                  }}
                >
                  <VerificationBadge
                    verification={{
                      eligible: true,
                      stage,
                      badge: stage === "PROFILE_VERIFIED" ? "GREEN_CHECK" : stage === "AGENT_VERIFIED" ? "BLUE_SHIELD" : "GOLD_CROWN",
                      badgeColor,
                      riskBlocked: false,
                      nextMilestone: null,
                      criteria: [],
                    }}
                    size="lg"
                  />
                </div>
                <p className={`mt-2 text-xs font-medium text-center w-24 ${isPast || isCurrent ? "text-safecrib-black" : "text-black/40"}`}>
                  {STAGE_LABELS[stage]}
                </p>
                {isCurrent && nextMilestone && (
                  <p className="mt-1 text-[10px] text-black/50 text-center w-28">{nextMilestone}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {isRiskBlocked && (
        <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-3 border border-amber-200" role="status">
          Your advanced badge progress is paused while your account is under review.
        </p>
      )}
    </div>
  );
}

type VerificationStageResult = {
  userId?: string;
  role?: string;
  eligible: boolean;
  stage: VerificationStage;
  badge: "GREEN_CHECK" | "BLUE_SHIELD" | "GOLD_CROWN";
  badgeColor: "green" | "blue" | "gold";
  riskBlocked: boolean;
  nextMilestone: string | null;
  criteria: Array<{ key: string; label?: string; met: boolean; required?: boolean }>;
  generatedAt?: string;
};