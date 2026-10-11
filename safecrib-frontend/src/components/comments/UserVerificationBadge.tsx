"use client";

import { useEffect, useMemo, useState } from "react";
import { VerificationBadge, normalizeVerificationStage, type VerificationStageResult } from "@/components/verification/VerificationBadge";
import { resolveVerificationKind } from "@/components/verification/verification-kinds";
import { cachedApiFetch, getPersistedVerification, setPersistedVerification } from "@/lib/api";

const STAFF_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "MODERATOR", "SUPPORT"]);
const PROVIDER_ROLES = new Set(["AGENT", "LANDLORD"]);

function isStaffRole(role?: string): boolean {
  if (!role) return false;
  return STAFF_ROLES.has(role.toUpperCase());
}

function isProviderRole(role?: string): boolean {
  if (!role) return false;
  return PROVIDER_ROLES.has(role.toUpperCase());
}

function getAccountTypeColorToken(role?: string): { badgeColor: VerificationStageResult["badgeColor"]; colorToken: string } {
  if (isStaffRole(role)) return { badgeColor: "admin", colorToken: "--badge-admin" };
  if (isProviderRole(role)) return { badgeColor: "agent", colorToken: "--badge-agent" };
  return { badgeColor: "green", colorToken: "--badge-green" };
}

interface UserVerificationBadgeProps {
  userId: string;
  role?: string;
  compact?: boolean;
  iconOnly?: boolean;
  verification?: { kind?: string | null } | VerificationStageResult | null;
}

export function UserVerificationBadge({
  userId,
  role,
  compact = false,
  iconOnly = false,
  verification,
}: UserVerificationBadgeProps) {
  const [cachedStage, setCachedStage] = useState<VerificationStageResult | null>(null);

  const isStaff = isStaffRole(role);
  const isProvider = isProviderRole(role);
  const { badgeColor, colorToken } = getAccountTypeColorToken(role);

  const staffVerification = useMemo<VerificationStageResult | null>(() => {
    if (!isStaff) return null;
    return {
      eligible: true,
      stage: "STAFF",
      badge: "STAFF_STAR",
      badgeColor,
      colorToken,
      riskBlocked: false,
      nextMilestone: null,
      criteria: [],
      userId,
      role,
      kind: "staff",
    };
  }, [isStaff, userId, role, badgeColor, colorToken]);

  const kindConfig = resolveVerificationKind(verification);

  useEffect(() => {
    if (isStaff) {
      return;
    }

    let active = true;
    const cached = normalizeVerificationStage(getPersistedVerification(userId));
    if (cached) {
      setCachedStage({ ...cached, badgeColor, colorToken });
    }
    void cachedApiFetch<unknown>(`/api/v1/trust/users/${encodeURIComponent(userId)}/verification-stage`)
      .then((response) => {
        const stage = normalizeVerificationStage(response);
        if (!stage || !active) return;
        setPersistedVerification(userId, response);
        setCachedStage({ ...stage, badgeColor, colorToken });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId, isStaff, badgeColor, colorToken]);

  if (kindConfig) {
    return <VerificationBadge verification={{ kind: kindConfig.kind, eligible: true, stage: "PROFILE_VERIFIED", badge: "GREEN_CHECK", badgeColor: "green", riskBlocked: false, nextMilestone: null, criteria: [] }} compact={compact} iconOnly={iconOnly} />;
  }

  const fallbackStage = staffVerification ?? cachedStage;
  return fallbackStage ? (
    <VerificationBadge verification={fallbackStage} compact={compact} iconOnly={iconOnly} />
  ) : null;
}