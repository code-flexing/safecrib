"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type BadgeStage = "PROFILE_VERIFIED" | "AGENT_VERIFIED" | "TRUST_CROWN";

const POPOVER_MESSAGES: Record<BadgeStage, string> = {
  PROFILE_VERIFIED: "Verified ✨ This profile's identity was checked by SafeCribs.",
  AGENT_VERIFIED: "Verified agent 🏠 This agent is verified and has a trusted provider page.",
  TRUST_CROWN: "Trust crown 👑 One of the most trusted accounts on SafeCribs.",
};

interface VerificationPopoverProps {
  stage: BadgeStage;
  triggerRef: React.RefObject<HTMLElement | null>;
  isOpen: boolean;
  onClose: () => void;
}

export function VerificationPopover({ stage, triggerRef, isOpen, onClose }: VerificationPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY + 6,
        left: rect.left + window.scrollX + rect.width / 2,
      });
    };

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [isOpen, triggerRef]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !position) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-50 pointer-events-none"
      style={{ top: position.top, left: position.left, transform: "translateX(-50%)" }}
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
  );
}

export function useVerificationPopover(stage: BadgeStage) {
  const triggerRef = useRef<HTMLElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = () => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    setIsOpen(true);
  };

  const close = () => {
    closeTimeout.current = setTimeout(() => setIsOpen(false), 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const popover = (
    <VerificationPopover
      stage={stage}
      triggerRef={triggerRef}
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
    />
  );

  return {
    triggerRef,
    triggerProps: {
      onMouseEnter: open,
      onMouseLeave: close,
      onFocus: open,
      onBlur: close,
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsOpen((prev) => !prev);
      },
      onKeyDown: handleKeyDown,
      tabIndex: 0,
      role: "button",
      "aria-haspopup": "tooltip",
    },
    popover,
  };
}