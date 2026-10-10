"use client";

import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { VerificationBadge, type VerificationStageResult } from "@/components/verification/VerificationBadge";

export type UserNameSize = "sm" | "md" | "lg" | "xl";

interface UserLike {
  id?: string;
  displayName?: string | null;
  username?: string | null;
  verification?: VerificationStageResult | null;
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
  const stage = user.verification ?? (user.isVerified ? { eligible: true, stage: "PROFILE_VERIFIED" as const, badge: "GREEN_CHECK" as const, badgeColor: "green" as const, riskBlocked: false, nextMilestone: null, criteria: [], userId: user.id, role: user.role } : null);
  if (stage) {
    stageCache.set(user.id, stage);
    window.dispatchEvent(new Event("verification-stage-update"));
  }
}

export function clearVerificationCache() {
  stageCache.clear();
  window.dispatchEvent(new Event("verification-stage-update"));
}

export function getVerificationStage(user: UserLike): VerificationStageResult | null {
  if (!user) return null;
  if (user.verification?.eligible) return user.verification;
  if (user.id) {
    const cached = stageCache.get(user.id);
    if (cached) return cached;
  }
  if (user.isVerified) {
    return {
      eligible: true,
      stage: "PROFILE_VERIFIED",
      badge: "GREEN_CHECK",
      badgeColor: "green",
      riskBlocked: false,
      nextMilestone: null,
      criteria: [],
      userId: user.id,
      role: user.role,
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

  const popover = isOpen && triggerRef.current ? createPortal(
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        top: triggerRef.current.getBoundingClientRect().bottom + window.scrollY + 6,
        left: triggerRef.current.getBoundingClientRect().left + window.scrollX + triggerRef.current.getBoundingClientRect().width / 2,
        transform: "translateX(-50%)",
      }}
      role="tooltip"
      aria-label={POPOVER_MESSAGES[stage]}
    >
      <div className="pointer-events-auto relative">
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-3 h-3 rotate-45 bg-white/95 border-l border-t border-black/10 shadow-[0_-4px_8px_rgba(11,12,14,0.08)]" />
        <div
          className="rounded-2xl bg-white/95 backdrop-blur-sm border border-black/10 shadow-[0_12px_32px_rgba(11,12,14,0.18)] px-4 py-3 max-w-xs text-sm leading-6 text-black/80 whitespace-nowrap"
          style={{ animation: "popover-in 180ms ease-out" }}
        >
          {POPOVER_MESSAGES[stage]}
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
}: UserNameProps) {
  const cachedStage = useCachedStage(user?.id);
  const stage = useMemo(() => {
    if (!user) return null;
    return getVerificationStage({ ...user, verification: cachedStage });
  }, [user, cachedStage]);

  const displayName = typeof user?.displayName === "string" && user.displayName.trim()
    ? truncateName(user.displayName.trim(), SIZE_TRUNCATE[size])
    : fallback;
  const handle = typeof user?.username === "string" && user.username.trim() ? user.username.trim() : null;

  const showBadge = !!stage?.eligible;

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
      <span className={`${SIZE_CLASSES[size].name} ${handleClassName} shrink-0`}>@{handle}</span>
      {showBadge && stage && <VerificationBadgeWithPopover verification={stage} size={size} />}
    </span>
  );
}