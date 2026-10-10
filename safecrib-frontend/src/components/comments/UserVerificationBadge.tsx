"use client";

import { useEffect, useMemo, useState } from "react";
import { VerificationBadge, normalizeVerificationStage, type VerificationStageResult } from "@/components/verification/VerificationBadge";
import { cachedApiFetch, getPersistedVerification, setPersistedVerification } from "@/lib/api";

const STAFF_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "MODERATOR", "SUPPORT"]);

function isStaffRole(role?: string): boolean {
  if (!role) return false;
  return STAFF_ROLES.has(role.toUpperCase());
}

interface UserVerificationBadgeProps {
  userId: string;
  role?: string;
  compact?: boolean;
  iconOnly?: boolean;
}

export function UserVerificationBadge({
  userId,
  role,
  compact = false,
  iconOnly = false,
}: UserVerificationBadgeProps) {
  const [verification, setVerification] = useState<VerificationStageResult | null>(null);

  const isStaff = isStaffRole(role);
  const staffVerification = useMemo<VerificationStageResult | null>(() => {
    if (!isStaff) return null;
    return {
      eligible: true,
      stage: "STAFF",
      badge: "STAFF_STAR",
      badgeColor: "purple",
      riskBlocked: false,
      nextMilestone: null,
      criteria: [],
      userId,
      role,
    };
  }, [isStaff, userId, role]);

  useEffect(() => {
    // If staff, don't fetch from API - we already have the badge
    if (isStaff) {
      setVerification(staffVerification);
      return;
    }

    let active = true;
    setVerification(normalizeVerificationStage(getPersistedVerification(userId)));
    void cachedApiFetch<unknown>(`/api/v1/trust/users/${encodeURIComponent(userId)}/verification-stage`)
      .then((response) => {
        const stage = normalizeVerificationStage(response);
        if (!stage || !active) return;
        setPersistedVerification(userId, response);
        setVerification(stage);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId, isStaff, staffVerification]);

  return verification ? (
    <VerificationBadge verification={verification} compact={compact} iconOnly={iconOnly} />
  ) : null;
}