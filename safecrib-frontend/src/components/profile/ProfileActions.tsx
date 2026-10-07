"use client";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import type { ProfileVM } from "./types";

const pill = "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors";
const filled = `${pill} bg-safecrib-green text-white hover:opacity-90`;

export function ProfileActions({
  p,
  onToggleFollow,
  followPending,
  onMessage,
  accentColor,
}: {
  p: ProfileVM;
  onToggleFollow: () => void;
  followPending?: boolean;
  onMessage?: () => void;
  accentColor?: string | null;
}) {
  const outlinedBase = `${pill} border text-safecrib-black`;
  const outlined = accentColor
    ? `${outlinedBase} border-black/15 hover:border-[${accentColor}] hover:bg-black/[0.02]`
    : `${outlinedBase} border-black/15 hover:bg-black/[0.02]`;

  if (p.isOwner) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/settings/profile" className={outlined}>
          Edit profile
        </Link>
      </div>
    );
  }

  const label = p.isFollowing ? "Following" : p.followsYou ? "Follow back" : "Follow";
  return (
    <div className="flex items-center gap-2">
      {p.isAgent && p.whatsapp && (
        <a
          className={outlined}
          href={`https://wa.me/${p.whatsapp.replace(/\D/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Icon name="message-circle" className="h-4 w-4 mr-1" />
          WhatsApp
        </a>
      )}
      {p.isAgent && p.phone && (
        <a className={outlined} href={`tel:${p.phone}`}>
          <Icon name="phone" className="h-4 w-4 mr-1" />
          Call
        </a>
      )}
      {onMessage && (
        <button
          type="button"
          onClick={onMessage}
          className={outlined}
        >
          <Icon name="message-circle" className="h-4 w-4 mr-1" />
          Message
        </button>
      )}
      <button
        onClick={onToggleFollow}
        disabled={followPending}
        aria-pressed={!!p.isFollowing}
        className={p.isFollowing ? outlined : filled}
      >
        {label}
      </button>
    </div>
  );
}