"use client";

import { useEffect, useState } from "react";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { getCachedMediaUrl, resolveMediaUrl } from "@/lib/api";

const AVATAR_TONES = [
  "bg-safecrib-green/15 text-safecrib-green",
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
];

interface CommentAvatarProps {
  user: {
    id: string;
    displayName?: string | null;
    username?: string | null;
    role?: string;
    profilePicture?: string | null;
    studentProfile?: { profilePicture?: string | null } | null;
    providerPage?: { profilePicture?: string | null } | null;
  };
  small?: boolean;
}

export function CommentAvatar({
  user,
  small = false,
}: CommentAvatarProps) {
  const [avatarSources, setAvatarSources] = useState<{ src: string | null; fallbackSrc: string | null }>({ src: null, fallbackSrc: null });
  const [resolving, setResolving] = useState(true);
  const letter = (user.displayName ?? user.username ?? "?").trim().slice(0, 1).toUpperCase() || "?";

  useEffect(() => {
    let active = true;
    const isProvider = ["AGENT", "LANDLORD"].includes(String(user.role ?? "").toUpperCase());
    const candidates = isProvider
      ? [user.providerPage?.profilePicture, user.profilePicture, user.studentProfile?.profilePicture]
      : [user.profilePicture, user.studentProfile?.profilePicture, user.providerPage?.profilePicture];
    const resolveCandidate = async (reference?: string | null): Promise<string | null> => {
      const value = reference?.trim();
      if (!value) return null;
      if (/^(https?:|data:|blob:)/i.test(value) || (value.startsWith("/") && !value.startsWith("/api/"))) return value;
      return getCachedMediaUrl(value) ?? await resolveMediaUrl(value);
    };

    setResolving(true);
    void (async () => {
      const resolved: string[] = [];
      for (const candidate of candidates) {
        if (!candidate || resolved.includes(candidate)) continue;
        const url = await resolveCandidate(candidate).catch(() => null);
        if (url && !resolved.includes(url)) resolved.push(url);
        if (resolved.length === 2) break;
      }
      if (active) {
        setAvatarSources({ src: resolved[0] ?? null, fallbackSrc: resolved[1] ?? null });
        setResolving(false);
      }
    })();

    return () => { active = false; };
  }, [user.id, user.role, user.profilePicture, user.studentProfile?.profilePicture, user.providerPage?.profilePicture]);

  // Deterministic tone for the initials fallback so it stays stable per user.
  let hash = 0;
  for (let index = 0; index < user.id.length; index += 1) {
    hash = (hash * 31 + user.id.charCodeAt(index)) >>> 0;
  }
  const tone = AVATAR_TONES[hash % AVATAR_TONES.length];

  const sizeClass = small ? "h-8 w-8" : "h-10 w-10";
  const initialClass = small ? "text-xs" : "text-sm";

  const fallback = (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${sizeClass} ${initialClass} ${tone}`}
    >
      {letter}
    </span>
  );

  return (
    <span className="relative inline-flex" aria-hidden={!avatarSources.src && !avatarSources.fallbackSrc && !resolving}>
      {avatarSources.src || avatarSources.fallbackSrc || resolving ? <ProfileAvatar
        src={avatarSources.src}
        fallbackSrc={avatarSources.fallbackSrc}
        alt={`${user.displayName ?? user.username ?? "Member"} profile`}
        size={small ? "small" : "medium"}
        loading={resolving}
        className={`rounded-full ring-2 ring-white dark:ring-slate-900 ${sizeClass}`}
      /> : fallback}
    </span>
  );
}