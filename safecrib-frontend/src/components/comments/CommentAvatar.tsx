"use client";

import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { UserVerificationBadge } from "./UserVerificationBadge";

const AVATAR_TONES = [
  "bg-safecrib-green/15 text-safecrib-green",
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-800",
  "bg-rose-100 text-rose-800",
  "bg-violet-100 text-violet-800",
];

function resolveProfilePicture(user: {
  profilePicture?: string | null;
  studentProfile?: { profilePicture?: string | null } | null;
  providerPage?: { profilePicture?: string | null } | null;
}): string | null {
  return (
    user.profilePicture ??
    user.studentProfile?.profilePicture ??
    user.providerPage?.profilePicture ??
    null
  );
}

interface CommentAvatarProps {
  user: {
    id: string;
    displayName?: string | null;
    username?: string | null;
    profilePicture?: string | null;
    studentProfile?: { profilePicture?: string | null } | null;
    providerPage?: { profilePicture?: string | null } | null;
  };
  small?: boolean;
  showVerification?: boolean;
}

export function CommentAvatar({
  user,
  small = false,
  showVerification = false,
}: CommentAvatarProps) {
  const profilePicture = resolveProfilePicture(user);
  const letter = (user.displayName ?? user.username ?? "?").trim().slice(0, 1).toUpperCase() || "?";

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

  if (!profilePicture) {
    return (
      <span className="flex items-center gap-1.5">
        {fallback}
        {showVerification && <UserVerificationBadge userId={user.id} />}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <span className="relative inline-flex">
        <ProfileAvatar
          src={profilePicture}
          alt={`${user.displayName ?? user.username ?? "Member"} profile`}
          size={small ? "small" : "medium"}
          className={`rounded-full ring-2 ring-white dark:ring-slate-900 ${sizeClass}`}
        />
      </span>
      {showVerification && <UserVerificationBadge userId={user.id} />}
    </span>
  );
}