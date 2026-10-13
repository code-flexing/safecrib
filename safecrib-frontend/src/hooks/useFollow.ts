"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useOptimisticToggle } from "@/lib/optimistic";
import { acquire, canFire } from "@/lib/burst-registry";
import { areEffectsEnabled } from "@/lib/effects-enabled";
import { apiFetch } from "@/lib/api";
import { FollowBurst } from "@/components/follow/FollowBurst";

type FollowTargetType = "user" | "page";

interface FollowState {
  isFollowing: boolean;
  followerCount: number;
}

interface UseFollowOptions {
  targetType: FollowTargetType;
  targetId: string;
  initialState: FollowState;
  onFollowersCountChange?: (delta: number) => void;
  onMyFollowingCountChange?: (delta: number) => void;
  disabled?: boolean;
}

interface UseFollowReturn {
  isFollowing: boolean;
  followerCount: number;
  state: "idle" | "pending" | "confirmed";
  toggle: () => void;
  burstPortal: React.ReactNode | null;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}

export function useFollow({
  targetType,
  targetId,
  initialState,
  onFollowersCountChange,
  onMyFollowingCountChange,
  disabled = false,
}: UseFollowOptions): UseFollowReturn {
  const [burstId, setBurstId] = useState<string | null>(null);
  const [prevFollowing, setPrevFollowing] = useState(initialState.isFollowing);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { value: followState, state, toggle } = useOptimisticToggle<FollowState>({
    key: `follow:${targetType}:${targetId}`,
    initialValue: initialState,
    getNextValue: (current) => ({
      isFollowing: !current.isFollowing,
      followerCount: Math.max(0, current.followerCount + (current.isFollowing ? -1 : 1)),
    }),
    onToggle: async (next) => {
      const path = targetType === "user"
        ? `/api/v1/users/${encodeURIComponent(targetId)}/follow`
        : `/api/v1/users/pages/${encodeURIComponent(targetId)}/follow`;
      await apiFetch(path, { method: next.isFollowing ? "POST" : "DELETE" });
    },
    onError: (error) => {
      console.error("Follow error:", error);
    },
    onSuccess: (serverValue) => {
      const wasFollowing = prevFollowing;
      const nowFollowing = serverValue.isFollowing;
      if (wasFollowing !== nowFollowing) {
        const delta = nowFollowing ? 1 : -1;
        onFollowersCountChange?.(delta);
        onMyFollowingCountChange?.(delta);
      }
      setPrevFollowing(nowFollowing);
    },
    equals: (a, b) => a.isFollowing === b.isFollowing && a.followerCount === b.followerCount,
  });

  const { isFollowing, followerCount } = followState;

  const handleClick = useCallback(() => {
    if (disabled) return;
    if (!prevFollowing && !isFollowing) {
      if (areEffectsEnabled() && canFire(`follow:${targetType}:${targetId}`)) {
        const id = acquire(`follow:${targetType}:${targetId}`);
        if (id) {
          setBurstId(id);
        }
      }
    }
    toggle();
  }, [disabled, prevFollowing, isFollowing, targetType, targetId, toggle]);

  const originalToggle = useRef(toggle);
  originalToggle.current = toggle;

  const wrappedToggle = useCallback(() => {
    handleClick();
  }, [handleClick]);

  const burstPortal = burstId && buttonRef.current ? createPortal(
    React.createElement(FollowBurst, { burstId, buttonRef }),
    document.body
  ) : null;

  return {
    isFollowing,
    followerCount,
    state,
    toggle: wrappedToggle,
    burstPortal,
    buttonRef,
  };
}