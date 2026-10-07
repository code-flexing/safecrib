import Link from "next/link";
import { formatCompact } from "./format";
import type { ProfileVM } from "./types";

type Item = { key: string; label: string; value?: number; href?: string };

export function ProfileStats({ p }: { p: ProfileVM }) {
  const items: Item[] = [
    { key: "posts", label: p.isAgent ? "Listings" : "Posts", value: p.stats.posts },
    { key: "views", label: "Views", value: p.stats.views },
    { key: "following", label: "Following", value: p.stats.following, href: `/profile/${p.username}/following` },
    { key: "followers", label: "Followers", value: p.stats.followers, href: `/profile/${p.username}/followers` },
  ].filter((i) => typeof i.value === "number");

  return (
    <div className="mt-4 flex justify-between px-4">
      {items.map((i) => {
        const body = (
          <div className="text-center">
            <div className="text-sm font-bold text-safecrib-black">{formatCompact(i.value!)}</div>
            <div className="text-[11px] text-black/45">{i.label}</div>
          </div>
        );
        return i.href ? <Link key={i.key} href={i.href}>{body}</Link> : <div key={i.key}>{body}</div>;
      })}
    </div>
  );
}