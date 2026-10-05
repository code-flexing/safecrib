"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { Icon } from "@/components/ui/Icon";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { apiFetch, cachedApiFetch, resolveMediaUrl, unwrapData } from "@/lib/api";

type UserResult = {
  id: string;
  displayName?: string | null;
  profilePicture?: string | null;
  isVerified?: boolean;
  role: string;
  school?: string | null;
  followerCount: number;
  isFollowing: boolean;
};
type PageResult = {
  id: string;
  ownerId: string;
  displayName: string;
  profilePicture?: string | null;
  isVerified?: boolean;
  providerType?: string | null;
  followerCount: number;
  isFollowing: boolean;
};
type DiscoveryResult = { users: UserResult[]; pages: PageResult[] };
type HomeResult = { id: string; title?: string; campus?: string; address?: string; price?: number; photos?: { url?: string }[]; recommendationScore?: number };
type ResultType = "Posts" | "People" | "Pages" | "Homes" | "Profiles" | "Trending";
const resultTypes: ResultType[] = ["Posts", "People", "Pages", "Homes", "Profiles", "Trending"];

function DiscoveryAvatar({ reference, seed, label }: { reference?: string | null; seed: string; label: string }) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [resolving, setResolving] = useState(Boolean(reference));

  useEffect(() => {
    setImageUrl(null);
    setResolving(Boolean(reference));
    if (!reference) return;
    let active = true;
    void resolveMediaUrl(reference).then((url) => {
      if (!active) return;
      setImageUrl(url);
      setResolving(false);
    });
    return () => { active = false; };
  }, [reference]);

  if (resolving) {
    return <div className="h-12 w-12 shrink-0 animate-pulse rounded-full bg-black/10" role="status" aria-label={`Loading ${label} profile picture`} />;
  }

  return <div className="shrink-0"><ProfileAvatar src={imageUrl} seed={seed} alt={`${label} profile`} size="medium" className="h-12 w-12" /></div>;
}

function SearchResultsSkeleton() {
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading search results">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl border border-black/10 bg-white p-4 animate-pulse">
          <div className="h-12 w-12 shrink-0 rounded-full bg-black/10" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-black/10" />
            <div className="h-2.5 w-1/2 rounded bg-black/[0.07]" />
          </div>
          <div className="h-8 w-16 rounded-full bg-black/[0.07]" />
        </div>
      ))}
    </div>
  );
}

export default function ConnectPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<DiscoveryResult>({ users: [], pages: [] });
  const [homes, setHomes] = useState<HomeResult[]>([]);
  const [resultType, setResultType] = useState<ResultType>("People");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!query.trim()) {
      setResult({ users: [], pages: [] });
      setLoading(false);
      setError("");
      return () => { active = false; };
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      void cachedApiFetch<unknown>(`/api/v1/users/discover?q=${encodeURIComponent(query.trim())}`)
        .then((response) => {
          if (active) {
            setResult(unwrapData<DiscoveryResult>(response));
            setError("");
          }
        })
        .catch((loadError: unknown) => {
          if (active) setError(loadError instanceof Error ? loadError.message : "We could not find campus mates right now.");
        })
        .finally(() => { if (active) setLoading(false); });
    }, 220);
    return () => { active = false; window.clearTimeout(timer); };
  }, [query]);

  useEffect(() => {
    if (!query.trim() || resultType !== "Homes") return;
    let active = true;
    void cachedApiFetch<unknown>("/api/v1/listings")
      .then((response) => {
        if (active) setHomes(unwrapData<HomeResult[]>(response));
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "We could not find homes right now.");
      });
    return () => { active = false; };
  }, [query, resultType]);

  const toggleFollow = async (kind: "user" | "page", id: string, following: boolean) => {
    const key = `${kind}:${id}`;
    setPending(key);
    const updateFollow = (isFollowing: boolean) => setResult((current) => ({
      users: current.users.map((person) => kind === "user" && person.id === id
        ? { ...person, isFollowing, followerCount: Math.max(0, person.followerCount + (isFollowing === following ? 0 : isFollowing ? 1 : -1)) }
        : person),
      pages: current.pages.map((page) => kind === "page" && page.id === id
        ? { ...page, isFollowing, followerCount: Math.max(0, page.followerCount + (isFollowing === following ? 0 : isFollowing ? 1 : -1)) }
        : page),
    }));
    updateFollow(!following);
    try {
      const path = kind === "user"
        ? `/api/v1/users/${encodeURIComponent(id)}/follow`
        : `/api/v1/users/pages/${encodeURIComponent(id)}/follow`;
      await apiFetch(path, { method: following ? "DELETE" : "POST" });
    } catch (followError) {
      updateFollow(following);
      setError(followError instanceof Error ? followError.message : "We could not update that follow.");
    } finally {
      setPending(null);
    }
  };

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingHomes = homes.filter((home) => `${home.title ?? ""} ${home.campus ?? ""} ${home.address ?? ""}`.toLocaleLowerCase().includes(normalizedQuery));
  const people = resultType === "Trending"
    ? [...result.users].sort((a, b) => b.followerCount - a.followerCount)
    : result.users;
  const pages = resultType === "Trending"
    ? [...result.pages].sort((a, b) => b.followerCount - a.followerCount)
    : result.pages;

  return <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
    <DashboardNav onCreatePage={() => router.push("/page/new")} pageStatus="none" />
    <section className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <Link href="/dashboard" aria-label="Back to dashboard" title="Back to dashboard" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-black/10 text-black/65 transition-colors hover:bg-black/[0.03] hover:text-safecrib-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safecrib-green">
        <Icon name="back" />
      </Link>
      <header className="mt-5">
        <label htmlFor="community-search" className="relative block w-full">
          <span className="sr-only">Search users and pages</span>
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-black/40" />
          <input id="community-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search campus mates, pages, and homes" className="w-full rounded-full border border-black/15 bg-white py-3.5 pl-11 pr-4 text-sm text-safecrib-black focus:border-safecrib-green focus:outline-none" />
        </label>
      </header>
      {error && <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
      {query.trim() && loading && <SearchResultsSkeleton />}
      {query.trim() && !loading && <>
      <nav aria-label="Search result types" className="mt-6 flex gap-2 overflow-x-auto border-b border-black/10 pb-3">
        {resultTypes.map((type) => <button key={type} type="button" aria-pressed={resultType === type} onClick={() => setResultType(type)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${resultType === type ? "bg-safecrib-green text-white" : "border border-black/10 bg-white text-black/65 hover:border-safecrib-green/40 hover:text-safecrib-green"}`}>{type}</button>)}
      </nav>
      {resultType === "Posts" && <p className="mt-6 text-sm text-black/55">Posts are not available yet.</p>}
      {(resultType === "People" || resultType === "Profiles" || resultType === "Trending") && <div className="mt-6 grid gap-8 lg:grid-cols-2 lg:items-start">
      <section aria-labelledby="campus-people-title">
        <div className="flex items-end justify-between gap-3 border-b border-black/10 pb-3">
          <h2 id="campus-people-title" className="text-xl font-semibold text-safecrib-black">{resultType === "Trending" ? "Trending people" : resultType}</h2>
          <span className="text-xs text-black/45">{people.length} found</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {people.map((person) => <article key={person.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-black/10 bg-white p-3.5 transition-colors hover:border-safecrib-green/25 sm:p-4">
            <Link href={`/profile/${encodeURIComponent(person.id)}`} aria-label={`Open ${person.displayName || "SafeCrib member"}'s profile`} className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safecrib-green">
              <DiscoveryAvatar reference={person.profilePicture} seed={person.id} label={person.displayName || "SafeCrib member"} />
            </Link>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <Link href={`/profile/${encodeURIComponent(person.id)}`} className="truncate font-semibold text-safecrib-black hover:text-safecrib-green">{person.displayName || "SafeCrib member"}</Link>
                {person.isVerified && <VerificationBadge verified compact iconOnly />}
              </div>
              <p className="mt-1 truncate text-xs text-black/50">{person.school || person.role.replaceAll("_", " ").toLowerCase()}</p>
              <p className="mt-1 text-xs text-black/45">{person.followerCount} followers</p>
            </div>
            <button type="button" aria-pressed={person.isFollowing} onClick={() => void toggleFollow("user", person.id, person.isFollowing)} disabled={pending === `user:${person.id}`} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${person.isFollowing ? "border border-black/15 text-black/65" : "bg-safecrib-green text-white"} disabled:opacity-50`}>{person.isFollowing ? "Following" : "Follow"}</button>
          </article>)}
          {people.length === 0 && <p className="text-sm text-black/50">No matching verified users.</p>}
        </div>
      </section>
      {resultType === "Trending" && <section aria-labelledby="trending-pages-title">
        <div className="flex items-end justify-between gap-3 border-b border-black/10 pb-3">
          <h2 id="trending-pages-title" className="text-xl font-semibold text-safecrib-black">Trending pages</h2>
          <span className="text-xs text-black/45">{pages.length} found</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {pages.map((page) => <article key={page.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-black/10 bg-white p-3.5 sm:p-4">
            <Link href={`/profile/${encodeURIComponent(page.ownerId)}`} aria-label={`Open ${page.displayName}'s profile`} className="rounded-full"><DiscoveryAvatar reference={page.profilePicture} seed={page.ownerId} label={page.displayName} /></Link>
            <div className="min-w-0 flex-1"><Link href={`/profile/${encodeURIComponent(page.ownerId)}`} className="truncate font-semibold text-safecrib-black hover:text-safecrib-green">{page.displayName}</Link><p className="mt-1 text-xs text-black/45">{page.followerCount} followers</p></div>
            <button type="button" aria-pressed={page.isFollowing} onClick={() => void toggleFollow("page", page.id, page.isFollowing)} disabled={pending === `page:${page.id}`} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${page.isFollowing ? "border border-black/15 text-black/65" : "bg-safecrib-green text-white"} disabled:opacity-50`}>{page.isFollowing ? "Following" : "Follow"}</button>
          </article>)}
          {pages.length === 0 && <p className="text-sm text-black/50">No matching pages.</p>}
        </div>
      </section>}
      </div>
      }
      {resultType === "Pages" && <section className="mt-6" aria-label="Pages">
        <div className="grid gap-3 sm:grid-cols-2">{pages.map((page) => <article key={page.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-black/10 bg-white p-4">
          <Link href={`/profile/${encodeURIComponent(page.ownerId)}`} aria-label={`Open ${page.displayName}'s profile`}><DiscoveryAvatar reference={page.profilePicture} seed={page.ownerId} label={page.displayName} /></Link>
          <div className="min-w-0 flex-1"><Link href={`/profile/${encodeURIComponent(page.ownerId)}`} className="truncate font-semibold text-safecrib-black hover:text-safecrib-green">{page.displayName}</Link><p className="mt-1 text-xs text-black/45">{page.providerType?.replaceAll("_", " ").toLowerCase() || "provider"} · {page.followerCount} followers</p></div>
          <button type="button" aria-pressed={page.isFollowing} onClick={() => void toggleFollow("page", page.id, page.isFollowing)} disabled={pending === `page:${page.id}`} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${page.isFollowing ? "border border-black/15 text-black/65" : "bg-safecrib-green text-white"} disabled:opacity-50`}>{page.isFollowing ? "Following" : "Follow"}</button>
        </article>)}</div>
        {pages.length === 0 && <p className="text-sm text-black/50">No matching pages.</p>}
      </section>}
      {resultType === "Homes" && <section className="mt-6" aria-label="Homes">
        <div className="grid gap-3 sm:grid-cols-2">{matchingHomes.map((home) => <Link key={home.id} href={`/dashboard/listings/${encodeURIComponent(home.id)}`} className="rounded-xl border border-black/10 bg-white p-4 transition-colors hover:border-safecrib-green/30">
          <h2 className="font-semibold text-safecrib-black">{home.title || "Student home"}</h2><p className="mt-1 text-sm text-black/55">{[home.campus, home.address].filter(Boolean).join(" · ") || "Campus listing"}</p>{typeof home.price === "number" && <p className="mt-3 text-sm font-semibold text-safecrib-green">₦{home.price.toLocaleString()}</p>}
        </Link>)}</div>
        {matchingHomes.length === 0 && <p className="text-sm text-black/50">No matching homes.</p>}
      </section>}
      </>}
    </section>
  </main>;
}
