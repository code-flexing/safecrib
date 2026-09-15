"use client";

/**
 * Hero — The product thesis stated plainly + a real, functional search bar.
 * A visitor should be able to start searching before finishing reading the headline.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchIcon } from "lucide-react";

export function Hero() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [moveIn, setMoveIn] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (moveIn) params.set("availableFrom", moveIn);
    router.push(`/listings?${params.toString()}`);
  };

  return (
    <section className="section-pad border-b border-[#E5E5E5]">
      <div className="content-max">
        <div className="max-w-2xl">
          {/* Eyebrow — factual, not marketing */}
          <p className="text-muted text-sm font-body mb-6 tracking-wide">
            Student housing, verified before it goes live
          </p>

          {/* Headline */}
          <h1 className="font-display text-display-2xl text-ink mb-6 text-balance">
            Find a room you can
            <br className="hidden md:block" />
            actually trust.
          </h1>

          <p className="text-muted text-lg mb-10 max-w-lg leading-relaxed font-body">
            Every listing on SafeCrib is manually reviewed before students can
            see it. No double-booked rooms, no scam deposits, no surprises.
          </p>

          {/* Functional search bar */}
          <form
            onSubmit={handleSearch}
            className="flex flex-col sm:flex-row gap-0 border border-[#0A0A0A] max-w-xl"
            role="search"
            aria-label="Search listings"
          >
            <div className="flex-1 flex items-center gap-3 px-4 py-3 border-b sm:border-b-0 sm:border-r border-[#0A0A0A]">
              <SearchIcon size={16} className="text-muted shrink-0" aria-hidden />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="City or campus…"
                className="w-full text-sm text-ink placeholder-muted bg-transparent outline-none font-body"
                aria-label="City or campus"
              />
            </div>
            <div className="flex items-center px-4 py-3 border-b sm:border-b-0 sm:border-r border-[#0A0A0A]">
              <input
                type="date"
                value={moveIn}
                onChange={(e) => setMoveIn(e.target.value)}
                className="text-sm text-ink bg-transparent outline-none font-body cursor-pointer"
                aria-label="Move-in date"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            <button
              type="submit"
              className="btn-primary px-6 py-3 text-sm font-medium"
              aria-label="Search listings"
            >
              Search
            </button>
          </form>

          <p className="mt-4 text-xs text-muted font-body">
            Protected deposits · Verified agents · No double-bookings
          </p>
        </div>
      </div>
    </section>
  );
}
