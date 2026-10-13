"use client";

import { useEffect, useState } from "react";
import { useFollow } from "@/hooks/useFollow";
import { apiFetch, unwrapData } from "@/lib/api";

interface ProviderFollowButtonProps {
  ownerId: string;
  initialFollowed: boolean;
  onFollowChange?: (isFollowing: boolean) => void;
  className?: string;
}

export function ProviderFollowButton({
  ownerId,
  initialFollowed,
  onFollowChange,
  className = "",
}: ProviderFollowButtonProps) {
  const [providerPageId, setProviderPageId] = useState<string | null>(null);
  const [loadingPageId, setLoadingPageId] = useState(false);

  // Call hook unconditionally - it will handle disabled state internally
  const follow = useFollow({
    targetType: "page",
    targetId: providerPageId ?? "",
    initialState: { isFollowing: initialFollowed, followerCount: 0 },
    onFollowersCountChange: () => onFollowChange?.(!initialFollowed),
    disabled: !providerPageId || loadingPageId,
  });

  useEffect(() => {
    let active = true;
    setLoadingPageId(true);
    void apiFetch<unknown>(`/api/v1/users/${encodeURIComponent(ownerId)}/public-profile`)
      .then((response) => unwrapData<{ providerPageId?: string } | null>(response))
      .then((publicProfile) => {
        if (active && publicProfile?.providerPageId) {
          setProviderPageId(publicProfile.providerPageId);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingPageId(false);
      });
    return () => { active = false; };
  }, [ownerId]);

  if (!providerPageId || loadingPageId) {
    return (
      <button
        type="button"
        disabled
        className={`shrink-0 rounded-full border border-white/25 px-2 py-1 text-[10px] font-semibold text-white/90 disabled:opacity-60 ${className}`}
      >
        ...
      </button>
    );
  }

  return (
    <>
      <button
        ref={follow.buttonRef}
        type="button"
        onClick={follow.toggle}
        disabled={follow.state === "pending"}
        aria-label={follow.isFollowing ? "Unfollow provider" : "Follow provider"}
        aria-pressed={follow.isFollowing}
        className={`shrink-0 rounded-full border border-white/25 px-2 py-1 text-[10px] font-semibold text-white/90 transition hover:bg-white/15 hover:text-white disabled:cursor-wait disabled:opacity-60 ${className}`}
      >
        {follow.isFollowing ? "Following" : "Follow"}
      </button>
      {follow.burstPortal}
    </>
  );
}