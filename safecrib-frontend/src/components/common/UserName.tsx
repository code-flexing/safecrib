"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { VerificationBadge, type VerificationStageResult } from "@/components/verification/VerificationBadge";
import { resolveVerificationKind, type VerificationKind, VERIFICATION_KINDS } from "@/components/verification/verification-kinds";
import { userSessionClearedEvent } from "@/lib/api";

export type UserNameSize = "sm" | "md" | "lg" | "xl";

interface UserLike {
  id?: string;
  displayName?: string | null;
  username?: string | null;
  verification?: VerificationStageResult | { kind?: string | null } | null;
  isVerified?: boolean;
  role?: string;
}

const stageCache = new Map<string, VerificationStageResult>();

function getSnapshot(userId: string) {
  return stageCache.get(userId);
}

function subscribe(callback: () => void) {
  window.addEventListener("verification-stage-update", callback);
  return () => window.removeEventListener("verification-stage-update", callback);
}

function useCachedStage(userId: string | undefined): VerificationStageResult | undefined {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener("verification-stage-update", callback);
    return () => window.removeEventListener("verification-stage-update", callback);
  }, []);

  const getSnapshot = useCallback(() => {
    if (!userId) return undefined;
    return stageCache.get(userId);
  }, [userId]);

  const getServerSnapshot = useCallback(() => {
    if (!userId) return undefined;
    return stageCache.get(userId);
  }, [userId]);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function seedVerificationCache(user: UserLike) {
  if (!user?.id) return;
  // Don't cache staff as a normal verification stage - staff is determined from role at render time
  if (isStaff(user)) return;
  const { badgeColor, colorToken } = getAccountTypeColorToken(user);
  const existingVerification = user.verification;
  let stage: VerificationStageResult | null = null;

  if (existingVerification && "eligible" in existingVerification) {
    stage = existingVerification as VerificationStageResult;
  } else if (existingVerification && "kind" in existingVerification) {
    const kind = existingVerification.kind;
    if (kind && Object.keys(VERIFICATION_KINDS).includes(kind)) {
      stage = {
        eligible: true,
        stage: kind === "staff" ? "STAFF" : kind === "agent" || kind === "landlord" ? "AGENT_VERIFIED" : "PROFILE_VERIFIED",
        badge: kind === "staff" ? "STAFF_STAR" : kind === "agent" || kind === "landlord" ? "BLUE_SHIELD" : "GREEN_CHECK",
        badgeColor: kind === "staff" ? "admin" : kind === "agent" || kind === "landlord" ? "agent" : "green",
        colorToken,
        riskBlocked: false,
        nextMilestone: null,
        criteria: [],
        userId: user.id,
        role: user.role,
        kind: kind as VerificationKind,
      };
    }
  } else if (user.isVerified) {
    stage = {
      eligible: true,
      stage: "PROFILE_VERIFIED" as const,
      badge: "GREEN_CHECK" as const,
      badgeColor,
      colorToken,
      riskBlocked: false,
      nextMilestone: null,
      criteria: [],
      userId: user.id,
      role: user.role,
    };
  }
  if (stage) {
    stageCache.set(user.id, stage);
    window.dispatchEvent(new Event("verification-stage-update"));
  }
}

export function clearVerificationCache() {
  stageCache.clear();
  window.dispatchEvent(new Event("verification-stage-update"));
}

if (typeof window !== "undefined") {
  window.addEventListener(userSessionClearedEvent, () => clearVerificationCache());
}

const STAFF_ROLES = new Set(["ADMIN", "SUPER_ADMIN", "MODERATOR", "SUPPORT"]);
const PROVIDER_ROLES = new Set(["AGENT", "LANDLORD"]);

function isStaff(user: UserLike): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role.toUpperCase() : "";
  return STAFF_ROLES.has(role);
}

function isProvider(user: UserLike): boolean {
  if (!user) return false;
  const role = typeof user.role === "string" ? user.role.toUpperCase() : "";
  return PROVIDER_ROLES.has(role);
}

function getAccountTypeColorToken(user: UserLike): { badgeColor: VerificationStageResult["badgeColor"]; colorToken: string } {
  if (isStaff(user)) return { badgeColor: "admin", colorToken: "--badge-admin" };
  if (isProvider(user)) return { badgeColor: "agent", colorToken: "--badge-agent" };
  return { badgeColor: "green", colorToken: "--badge-green" };
}

export function getVerificationStage(user: UserLike): VerificationStageResult | null {
  if (!user) return null;

  if (user.verification && !("eligible" in user.verification)) {
    const kind = (user.verification as { kind?: string | null }).kind;
    if (kind && Object.keys(VERIFICATION_KINDS).includes(kind)) {
      return {
        eligible: true,
        stage: kind === "staff" ? "STAFF" : kind === "agent" || kind === "landlord" ? "AGENT_VERIFIED" : "PROFILE_VERIFIED",
        badge: kind === "staff" ? "STAFF_STAR" : kind === "agent" || kind === "landlord" ? "BLUE_SHIELD" : "GREEN_CHECK",
        badgeColor: kind === "staff" ? "admin" : kind === "agent" || kind === "landlord" ? "agent" : "green",
        riskBlocked: false,
        nextMilestone: null,
        criteria: [],
        userId: user.id,
        role: user.role,
        kind: kind as VerificationKind,
      };
    }
    if (kind === null) return null;
  }

  const { badgeColor, colorToken } = getAccountTypeColorToken(user);

  // Staff badge wins over any trust stage - check this FIRST
  if (isStaff(user)) {
    return {
      eligible: true,
      stage: "STAFF",
      badge: "STAFF_STAR",
      badgeColor,
      colorToken,
      riskBlocked: false,
      nextMilestone: null,
      criteria: [],
      userId: user.id,
      role: user.role,
      kind: "staff",
    };
  }

  if (user.verification && "eligible" in user.verification && user.verification.eligible) {
    const v = user.verification as VerificationStageResult;
    return { ...v, badgeColor, colorToken };
  }
  if (user.id) {
    const cached = stageCache.get(user.id);
    if (cached)      return { ...cached, badgeColor, colorToken };
  }
  if (user.isVerified) {
    return {
      eligible: true,
      stage: "PROFILE_VERIFIED",
      badge: "GREEN_CHECK",
      badgeColor,
      colorToken,
      riskBlocked: false,
      nextMilestone: null,
      criteria: [],
      userId: user.id,
      role: user.role,
      kind: "student",
    };
  }
  return null;
}

function truncateName(name: string, maxLength: number): string {
  if (name.length <= maxLength) return name;
  return name.slice(0, Math.max(0, maxLength - 1)) + "…";
}

const SIZE_CLASSES: Record<UserNameSize, { name: string; badge: string; gap: string }> = {
  sm: { name: "text-sm", badge: "", gap: "gap-1" },
  md: { name: "text-base", badge: "", gap: "gap-1.5" },
  lg: { name: "text-lg", badge: "", gap: "gap-1.5" },
  xl: { name: "text-xl", badge: "", gap: "gap-2" },
};

const SIZE_TRUNCATE: Record<UserNameSize, number> = {
  sm: 20,
  md: 28,
  lg: 36,
  xl: 44,
};

const POPOVER_MESSAGES: Record<string, string> = {
  PROFILE_VERIFIED: "Verified ✨ This profile's identity was checked by SafeCribs.",
  AGENT_VERIFIED: "Verified agent 🏠 This agent is verified and has a trusted provider page.",
  TRUST_CROWN: "Trust crown 👑 One of the most trusted accounts on SafeCribs.",
  STAFF: "SafeCribs Team 💜 This account belongs to the SafeCribs team.",
};

function VerificationBadgeWithPopover({
  verification,
  size,
}: {
  verification: VerificationStageResult;
  size: UserNameSize;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  let closeTimeout: number | undefined;

  const open = () => {
    if (closeTimeout) clearTimeout(closeTimeout);
    setIsOpen(true);
  };

  const close = () => {
    closeTimeout = window.setTimeout(() => setIsOpen(false), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const stage = verification.stage;
  const kindConfig = resolveVerificationKind(verification);
  const popoverMessage = kindConfig?.popoverText ?? POPOVER_MESSAGES[stage] ?? "";

  const popover = isOpen && triggerRef.current ? createPortal(
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        top: triggerRef.current.getBoundingClientRect().bottom + window.scrollY + 6,
        left: triggerRef.current.getBoundingClientRect().left + window.scrollX + triggerRef.current.getBoundingClientRect().width / 2,
        transform: "translateX(-50%)",
      }}
      role="tooltip"
      aria-label={popoverMessage}
    >      <div className="pointer-events-auto relative">
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-3 h-3 rotate-45 bg-white/95 border-l border-t border-black/10 shadow-[0_-4px_8px_rgba(11,12,14,0.08)]" />
        <div
          className="rounded-2xl bg-white/95 backdrop-blur-sm border border-black/10 shadow-[0_12px_32px_rgba(11,12,14,0.18)] px-4 py-3 max-w-xs text-sm leading-6 text-black/80 whitespace-nowrap"
          style={{ animation: "popover-in 180ms ease-out" }}
        >
          {popoverMessage}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={open}
        onMouseLeave={close}
        onFocus={open}
        onBlur={close}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="button"
        aria-haspopup="dialog"
        className="inline-flex"
      >
        <VerificationBadge verification={verification} size={size} />
      </span>
      {popover}
    </>
  );
}

interface UserNameProps {
  user: UserLike | null | undefined;
  size?: UserNameSize;
  showHandle?: boolean;
  fallback?: string;
  className?: string;
  nameClassName?: string;
  handleClassName?: string;
  onNameClick?: () => void;
  showVerificationBadge?: boolean;
}

export function UserName({
  user,
  size = "md",
  showHandle = true,
  fallback = "SafeCrib member",
  className,
  nameClassName = "font-semibold text-safecrib-black",
  handleClassName = "font-normal text-black/45",
  onNameClick,
  showVerificationBadge = true,
}: UserNameProps) {
  const cachedStage = useCachedStage(user?.id);
  const stage = useMemo(() => {
    if (!user) return null;
    if (user.verification === undefined && process.env.NODE_ENV === "development") {
      if (user?.id) console.warn(`[UserName] Missing verification field for user ${user.id}. Badge will not render.`);
    }
    return getVerificationStage({ ...user, verification: cachedStage });
  }, [user, cachedStage]);

  const displayName = typeof user?.displayName === "string" && user.displayName.trim()
    ? truncateName(user.displayName.trim(), SIZE_TRUNCATE[size])
    : fallback;
  const handle = typeof user?.username === "string" && user.username.trim() ? user.username.trim() : null;

  const showBadge = showVerificationBadge && !!stage?.eligible;

  const nameContent = onNameClick ? (
    <button
      type="button"
      onClick={onNameClick}
      className={`inline-flex items-center ${SIZE_CLASSES[size].gap} ${SIZE_CLASSES[size].name} ${nameClassName} min-w-0 truncate focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safecrib-green`}
      style={{ textAlign: "left" }}
    >
      {displayName}
    </button>
  ) : (
    <span className={`inline-flex items-center ${SIZE_CLASSES[size].gap} ${SIZE_CLASSES[size].name} ${nameClassName} min-w-0 truncate`}>
      {displayName}
    </span>
  );

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      {nameContent}
      {showBadge && stage && <VerificationBadgeWithPopover verification={stage} size={size} />}
      {showHandle && handle && <span className={`ml-1.5 ${SIZE_CLASSES[size].name} ${handleClassName} shrink-0`}>@{handle}</span>}
    </span>
  );
}

export function UserHandleOnly({
  user,
  size = "md",
  fallback = "SafeCrib member",
  className,
  handleClassName = "font-mono font-normal text-black/45",
}: Omit<UserNameProps, "showHandle" | "nameClassName">) {
  const cachedStage = useCachedStage(user?.id);
  const stage = useMemo(() => {
    if (!user) return null;
    return getVerificationStage({ ...user, verification: cachedStage });
  }, [user, cachedStage]);

  const handle = typeof user?.username === "string" && user.username.trim()
    ? user.username.trim()
    : (typeof user?.displayName === "string" && user.displayName.trim() ? user.displayName.trim() : fallback);

  const showBadge = !!stage?.eligible;

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      {showBadge && stage && <VerificationBadgeWithPopover verification={stage} size={size} />}
      <span className={`${SIZE_CLASSES[size].name} ${handleClassName} shrink-0`}>@{handle}</span>
    </span>
  );
}