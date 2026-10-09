"use client";

import { useEffect, useState } from "react";
import { VerificationBadge, normalizeVerificationStage, type VerificationStageResult } from "@/components/verification/VerificationBadge";
import { cachedApiFetch, getPersistedVerification, setPersistedVerification } from "@/lib/api";

interface UserVerificationBadgeProps {
  userId: string;
  compact?: boolean;
  iconOnly?: boolean;
}

export function UserVerificationBadge({
  userId,
  compact = false,
  iconOnly = false,
}: UserVerificationBadgeProps) {
  const [verification, setVerification] = useState<VerificationStageResult | null>(null);

  useEffect(() => {
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
  }, [userId]);

  return verification ? (
    <VerificationBadge verification={verification} compact={compact} iconOnly={iconOnly} />
  ) : null;
}