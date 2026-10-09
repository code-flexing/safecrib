"use client";

import { UserVerificationBadge } from "./UserVerificationBadge";

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
  };
  small?: boolean;
  showVerification?: boolean;
}

export function CommentAvatar({
  user,
  small = false,
  showVerification = false,
}: CommentAvatarProps) {
  let hash = 0;
  for (let index = 0; index < user.id.length; index += 1) {
    hash = (hash * 31 + user.id.charCodeAt(index)) >>> 0;
  }
  const letter = (user.displayName ?? user.username ?? "?").trim().slice(0, 1).toUpperCase() || "?";

  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`flex shrink-0 items-center justify-center rounded-full font-semibold ${
          small ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm"
        } ${AVATAR_TONES[hash % AVATAR_TONES.length]}`}
      >
        {letter}
      </span>
      {showVerification && <UserVerificationBadge userId={user.id} />}
    </span>
  );
}