"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type MouseEvent, type ReactNode } from "react";
import { SafeCribLogo } from "@/components/branding/SafeCribLogo";
import { InstallButton } from "@/components/pwa/InstallButton";
import { apiFetch, getCurrentUser } from "@/lib/api";
import { ListingPost } from "@/components/listings/ListingPost";
import { ListingPostSkeleton } from "@/components/listings/ListingPostSkeleton";
import { fetchPublicListings } from "@/lib/api";
import { EmptyListingsIllustration } from "@/components/branding/EmptyListingsIllustration";

type PublicListing = {
  id: string;
  title?: string;
  description?: string | null;
  price?: number;
  discountAmount?: number | null;
  campus?: string | null;
  address?: string | null;
  photos?: Array<{ id: string; mediaId?: string | null; url: string }>;
  video?: { mediaId: string; durationSec?: number | null } | null;
  likeCount?: number;
  likedByCurrentUser?: boolean;
  commentCount?: number;
  shareCount?: number;
  viewCount?: number;
  _count?: { comments?: number; shares?: number; views?: number };
  ownerId?: string;
  ownerDisplayName?: string;
  ownerHandle?: string;
  ownerAvatarMediaId?: string;
  ownerAvatarUrl?: string;
  ownerIsVerified?: boolean;
  ownerVerificationBadge?: "green" | "blue" | "gold";
  ownerAgencyName?: string;
  ownerPhone?: string;
  ownerWhatsApp?: string;
  owner?: {
    id: string;
    displayName?: string;
    username?: string;
    profilePicture?: string;
    phone?: string;
    whatsApp?: string;
    verification?: { stage?: string; badgeColor?: "green" | "blue" | "gold" } | null;
    providerPage?: { displayName?: string } | null;
  };
  createdAt?: string | Date;
};

type Audience = "student" | "provider";

const HOME_LISTINGS_CACHE_KEY = "safecrib_home_listings_v1";

function isPublicListing(value: unknown): value is PublicListing {
  return typeof value === "object" && value !== null &&
    typeof (value as { id?: unknown }).id === "string";
}

function readCachedListings(): PublicListing[] | null {
  try {
    const raw = window.localStorage.getItem(HOME_LISTINGS_CACHE_KEY);
    if (!raw) return null;
    const cached = JSON.parse(raw) as { version?: number; listings?: unknown };
    if (cached.version !== 1 || !Array.isArray(cached.listings)) return null;
    return cached.listings.filter(isPublicListing);
  } catch {
    return null;
  }
}

function writeCachedListings(listings: PublicListing[]) {
  try {
    window.localStorage.setItem(HOME_LISTINGS_CACHE_KEY, JSON.stringify({
      version: 1,
      listings: listings.map((listing) => ({ ...listing, likedByCurrentUser: false })),
    }));
  } catch {
    // Storage can be unavailable or full; the live feed still works without it.
  }
}

function getListingsFromResponse(data: unknown): PublicListing[] {
  if (Array.isArray(data)) return data.filter(isPublicListing);
  if (typeof data !== "object" || data === null) return [];
  const response = data as { data?: unknown; listings?: unknown };
  const items = Array.isArray(response.data) ? response.data : response.listings;
  return Array.isArray(items) ? items.filter(isPublicListing) : [];
}

function RouteLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (isPending) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    startTransition(() => router.push(href));
  };

  return (
    <Link href={href} onClick={handleClick} aria-busy={isPending} aria-disabled={isPending} className={`${className} ${isPending ? "pointer-events-none opacity-70" : ""}`}>
      {isPending && <span aria-hidden="true" className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      <span>{children}</span>
    </Link>
  );
}

function CampusIllustration() {
  return (
    <svg viewBox="0 0 760 570" role="img" aria-labelledby="campus-title campus-description" className="landing-campus-art h-auto w-full">
      <title id="campus-title">A lively SafeCrib campus</title>
      <desc id="campus-description">Illustration of a campus library, lecture hall, student lodge, shuttle stop, walking paths, trees, and students.</desc>
      <defs>
        <pattern id="campus-window-grid" width="30" height="34" patternUnits="userSpaceOnUse">
          <rect x="5" y="5" width="15" height="18" rx="2" fill="#B9D9CB" />
        </pattern>
      </defs>
      <path d="M46 471c56-54 118-76 191-70 76 6 110 56 194 43 72-11 121-65 223-49 27 4 47 12 64 21v118H46z" fill="#E2EEE7" />
      <path d="M88 476c83-53 136-44 201-26 69 19 116 15 176-17 66-35 135-33 227 5" fill="none" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
      <path d="M88 476c83-53 136-44 201-26 69 19 116 15 176-17 66-35 135-33 227 5" fill="none" stroke="#BDD8CA" strokeWidth="2" strokeDasharray="4 10" strokeLinecap="round" className="campus-route" />

      <g aria-hidden="true" className="campus-scene">
        <rect x="69" y="268" width="173" height="142" rx="5" fill="#D7E8DF" />
        <path d="M58 271 155 214l99 57z" fill="#0C7355" />
        <path d="M76 270h159v14H76z" fill="#135C48" />
        <rect x="88" y="292" width="137" height="103" fill="#F8FBF8" />
        <rect x="95" y="299" width="123" height="74" fill="url(#campus-window-grid)" />
        <path d="M80 396h150M95 383h123" stroke="#A9C8B8" strokeWidth="5" />
        <path d="M143 379h24v31h-24z" fill="#B7D5C5" />
        <text x="155" y="256" textAnchor="middle" fill="#fff" fontSize="11" fontWeight="700" letterSpacing="2">LIBRARY</text>

        <rect x="309" y="189" width="187" height="184" rx="5" fill="#F8FBF8" stroke="#D6E5DD" strokeWidth="3" />
        <path d="M291 196 402 131l112 65z" fill="#B8D9CA" />
        <path d="M303 194h197v13H303z" fill="#0C7355" />
        <rect x="327" y="220" width="151" height="93" fill="url(#campus-window-grid)" />
        <path d="M327 325h151" stroke="#A9C8B8" strokeWidth="5" />
        <rect x="381" y="313" width="39" height="60" fill="#D7E8DF" />
        <path d="M388 373v-42h25v42" fill="#0C7355" />
        <text x="402" y="183" textAnchor="middle" fill="#0C7355" fontSize="10" fontWeight="700" letterSpacing="1.8">LECTURE HALL</text>

        <rect x="542" y="254" width="153" height="139" rx="5" fill="#E5EFE9" />
        <path d="M532 258h173v13H532z" fill="#D09A59" />
        <path d="M555 279h127v92H555z" fill="url(#campus-window-grid)" />
        <rect x="591" y="342" width="53" height="51" fill="#B8D9CA" />
        <path d="M607 393v-42h22v42" fill="#0C7355" />
        <text x="618" y="247" textAnchor="middle" fill="#0C7355" fontSize="10" fontWeight="700" letterSpacing="1.5">STUDENT LODGE</text>

        <path d="M512 404h113v8H512z" fill="#0C7355" />
        <path d="M525 412v33m85-33v33" stroke="#557C6A" strokeWidth="5" />
        <path d="M521 378h94l-11 27h-72z" fill="#D09A59" />
        <path d="M536 388h64" stroke="#fff" strokeWidth="3" />
        <text x="568" y="401" textAnchor="middle" fill="#fff" fontSize="8" fontWeight="700" letterSpacing="1">SHUTTLE</text>

        <g fill="#487A60">
          <circle cx="275" cy="353" r="23" /><circle cx="273" cy="329" r="16" fill="#6E9A78" />
          <circle cx="513" cy="295" r="25" /><circle cx="510" cy="270" r="17" fill="#6E9A78" />
          <circle cx="713" cy="345" r="24" /><circle cx="709" cy="319" r="17" fill="#6E9A78" />
          <circle cx="47" cy="360" r="21" /><circle cx="45" cy="338" r="15" fill="#6E9A78" />
        </g>
        <g stroke="#806548" strokeWidth="6" strokeLinecap="round">
          <path d="M275 354v40M513 296v39M713 346v43M47 361v37" />
        </g>

        <g transform="translate(255 428)">
          <circle cx="12" cy="4" r="7" fill="#B86F4B" /><path d="M5 13h14l8 26H0z" fill="#D09A59" /><path d="m5 37-4 20m16-20 8 19" stroke="#253A31" strokeWidth="5" strokeLinecap="round" />
          <path d="m5 19-10 13m24-12 10 8" stroke="#B86F4B" strokeWidth="4" strokeLinecap="round" />
        </g>
        <g transform="translate(462 421)">
          <circle cx="12" cy="4" r="7" fill="#704B3A" /><path d="M5 13h14l8 26H0z" fill="#0C7355" /><path d="m5 37-4 20m16-20 8 19" stroke="#253A31" strokeWidth="5" strokeLinecap="round" />
          <path d="m5 19-10 13m24-12 10 8" stroke="#704B3A" strokeWidth="4" strokeLinecap="round" />
        </g>
        <g transform="translate(660 429)">
          <circle cx="12" cy="4" r="7" fill="#D09A59" /><path d="M5 13h14l8 26H0z" fill="#B86F4B" /><path d="m5 37-4 20m16-20 8 19" stroke="#253A31" strokeWidth="5" strokeLinecap="round" />
        </g>
      </g>

      <g transform="translate(84 458)" aria-hidden="true" className="campus-shuttle">
        <rect x="0" y="0" width="93" height="40" rx="12" fill="#0C7355" />
        <rect x="13" y="8" width="49" height="15" rx="3" fill="#CDE5D9" />
        <rect x="68" y="11" width="16" height="12" rx="2" fill="#CDE5D9" />
        <circle cx="21" cy="41" r="7" fill="#263B32" /><circle cx="70" cy="41" r="7" fill="#263B32" />
        <path d="M10 29h73" stroke="#A9D8C3" strokeWidth="3" />
      </g>


    </svg>
  );
}

export default function Home() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [, setSessionChecked] = useState(false);
  const [audience, setAudience] = useState<Audience>("student");
  const accountHref = isAuthenticated ? "/dashboard" : "/signup";

  // Public listings feed state
  const [listings, setListings] = useState<PublicListing[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [listingsError, setListingsError] = useState<string | null>(null);

  useEffect(() => {
    const hasSession = Boolean(
      window.localStorage.getItem("safecrib_access_token") ||
      window.localStorage.getItem("safecrib_refresh_token"),
    );
    if (!hasSession) {
      setSessionChecked(true);
      return;
    }

    let active = true;
    void getCurrentUser<unknown>()
      .then(() => {
        if (!active) return;
        setIsAuthenticated(true);
        router.replace("/dashboard");
      })
      .catch(() => {
        if (active) setSessionChecked(true);
      });

    return () => { active = false; };
  }, [router]);

  // Fetch public listings for the feed
  useEffect(() => {
    let active = true;
    const cachedListings = readCachedListings();
    if (cachedListings !== null) {
      setListings(cachedListings);
      setListingsLoading(false);
    } else {
      setListingsLoading(true);
    }

    fetchPublicListings({ limit: 10 })
      .then((data: unknown) => {
        if (active) {
          const items = getListingsFromResponse(data);
          setListings(items);
          writeCachedListings(items);
          setListingsError(null);
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (cachedListings !== null) return;
        // 401 means the visitor is not logged in — the backend requires auth for listing search.
        // Treat it as an empty feed, not an error, so the home page doesn't look broken.
        const status = (err as { status?: number })?.status;
        if (status === 401 || status === 403) {
          setListings([]);
        } else {
          setListingsError((err as { message?: string })?.message ?? "Failed to load listings");
        }
      })
      .finally(() => {
        if (active) setListingsLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const handleOutsideClick = (event: Event) => {
      const target = event.target as Node | null;
      const mobileToggle = document.querySelector('[aria-controls="mobile-navigation"]');
      const mobileNav = document.getElementById("mobile-navigation");
      if (!target || (!mobileToggle?.contains(target) && !mobileNav?.contains(target))) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("touchstart", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("touchstart", handleOutsideClick);
    };
  }, [menuOpen]);

  useEffect(() => {
    const elements = document.querySelectorAll("[data-reveal]");
    if (!elements.length) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -30px 0px" });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  const studentMode = audience === "student";
  const handleNavigate = () => setMenuOpen(false);

  const handleLike = async (listingId: string, liked: boolean) => {
    await apiFetch(`/api/v1/listings/${encodeURIComponent(listingId)}/like`, {
      method: liked ? "POST" : "DELETE",
    });
  };

  const handleComment = (listingId: string) => {
    router.push(`/dashboard/listings/${listingId}#comments`);
  };

  const prefetchListing = (listingId: string) => {
    router.prefetch(`/dashboard/listings/${listingId}`);
  };

  const handleShare = async (listingId: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "SafeCrib Listing",
          url: `${window.location.origin}/dashboard/listings/${listingId}`,
        });
      } catch {}
    }
  };

  const handleBookmark = async (listingId: string) => {
    // TODO: Implement bookmark via API
    console.log("Bookmark:", listingId);
  };

  return (
    <main id="top" className="min-h-screen bg-white text-safecrib-black">
      <header className="sticky top-0 z-40 border-b border-white/15 bg-safecrib-green text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-7">
          <SafeCribLogo height={21} inverse />
          <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm font-medium text-white/80 md:flex">
            <a href="#campus" className="transition-colors hover:text-white">Campus life</a>
            <a href="#how" className="transition-colors hover:text-white">How it works</a>
            <a href="#providers" className="transition-colors hover:text-white">For providers</a>
          </nav>
          <div className="hidden items-center gap-4 sm:flex">
            {!isAuthenticated && <RouteLink href="/login" className="text-sm font-medium text-white/85 hover:text-white">Log in</RouteLink>}
            <RouteLink href={accountHref} className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-safecrib-green transition-colors hover:bg-white/90">
              {isAuthenticated ? "Open dashboard" : studentMode ? "Get started" : "Create provider account"}
            </RouteLink>
          </div>
          <button type="button" aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen((open) => !open)} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/35 text-white transition-colors hover:bg-white/10 sm:hidden">
            <span className="flex flex-col gap-1.5" aria-hidden="true"><span className={`h-0.5 w-4 bg-current transition-transform ${menuOpen ? "translate-y-2 rotate-45" : ""}`} /><span className={`h-0.5 w-4 bg-current transition-opacity ${menuOpen ? "opacity-0" : ""}`} /><span className={`h-0.5 w-4 bg-current transition-transform ${menuOpen ? "-translate-y-2 -rotate-45" : ""}`} /></span>
          </button>
        </div>
        {menuOpen && <nav id="mobile-navigation" aria-label="Mobile navigation" className="border-t border-white/15 px-4 py-3 text-white sm:hidden">
          <a href="#campus" onClick={handleNavigate} className="block py-3 text-sm font-medium">Campus life</a>
          <a href="#how" onClick={handleNavigate} className="block py-3 text-sm font-medium">How it works</a>
          <a href="#providers" onClick={handleNavigate} className="block py-3 text-sm font-medium">For providers</a>
          <div className="mt-2 flex gap-3 border-t border-white/15 pt-3">
            {!isAuthenticated && <RouteLink href="/login" className="flex flex-1 items-center justify-center rounded-full border border-white/35 px-3 py-2.5 text-sm font-medium text-white">Log in</RouteLink>}
            <RouteLink href={accountHref} className="flex flex-1 items-center justify-center rounded-full bg-white px-3 py-2.5 text-sm font-semibold text-safecrib-green">{isAuthenticated ? "Dashboard" : "Get started"}</RouteLink>
          </div>
        </nav>}
      </header>

      <section className="overflow-hidden bg-[#F1F7F3]">
        <div className="mx-auto grid min-h-[570px] max-w-6xl items-center gap-4 px-4 pb-7 pt-8 sm:px-7 sm:pb-10 lg:min-h-[610px] lg:grid-cols-[0.92fr_1.08fr] lg:gap-0 lg:py-8">
          <div className="landing-hero-copy relative z-10 max-w-xl py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-safecrib-green">Campus living, with more certainty</p>
            <h1 className="mt-4 max-w-[13ch] font-display text-[2.7rem] font-semibold leading-[1.04] text-safecrib-black sm:text-5xl lg:text-[3.65rem]">
              {studentMode ? "Find your place in campus life." : "Good homes deserve a trusted place to be found."}
            </h1>
            <p className="mt-5 max-w-md text-base leading-7 text-black/65">
              {studentMode
                ? "Explore student homes with clearer details, reviewed providers, and the campus essentials close by."
                : "Meet students where they search. Build a verified provider profile and publish homes with clear, useful details."}
            </p>

            <div className="mt-7 inline-flex rounded-full border border-black/10 bg-white p-1" role="group" aria-label="Choose your SafeCrib experience">
              <button type="button" aria-pressed={studentMode} onClick={() => setAudience("student")} className={`rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${studentMode ? "bg-safecrib-green text-white" : "text-black/60 hover:text-safecrib-black"}`}>I&apos;m a student</button>
              <button type="button" aria-pressed={!studentMode} onClick={() => setAudience("provider")} className={`rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${!studentMode ? "bg-safecrib-green text-white" : "text-black/60 hover:text-safecrib-black"}`}>I&apos;m a provider</button>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <RouteLink href={accountHref} className="inline-flex min-h-12 items-center justify-center rounded-full bg-safecrib-green px-5 py-3 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 hover:bg-[#095E47]">
                {isAuthenticated ? "Go to your dashboard" : studentMode ? "Find a home" : "Start a provider profile"}
              </RouteLink>
              {!studentMode && <a href="#providers" className="px-2 py-2 text-sm font-medium text-safecrib-green underline decoration-black/20 underline-offset-4">See how provider checks work</a>}
              {studentMode && <InstallButton />}
            </div>

            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 border-t border-black/10 pt-4 text-xs font-medium text-black/55">
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-safecrib-green" /> Reviewed home details</span>
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[#D09A59]" /> Campus-aware search</span>
            </div>
          </div>
          <div className="landing-campus relative -mx-2 mt-1 lg:mx-0 lg:mt-0">
            <CampusIllustration />
          
          </div>
        </div>
      </section>

      <section id="campus" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-14 sm:px-7 sm:py-16">
        <div className="grid gap-8 md:grid-cols-[0.85fr_1.15fr] md:items-end">
          <div data-reveal>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-safecrib-greenpls update profile well ">Made for campus days</p>
            <h2 className="mt-3 max-w-md font-display text-3xl font-semibold leading-tight sm:text-4xl">From first lecture to lights out.</h2>
          </div>
          <p className="max-w-xl text-base leading-7 text-black/60" data-reveal>
            Find a home that fits the way you study, move, and recharge. SafeCrib keeps home details and provider checks in view, so you can make a more informed choice.
          </p>
        </div>
        <div className="mt-9 grid border-y border-black/10 sm:grid-cols-3" data-reveal>
          <div className="flex gap-4 border-b border-black/10 py-5 sm:border-b-0 sm:border-r sm:pr-5">
            <svg aria-hidden="true" viewBox="0 0 40 40" className="h-9 w-9 shrink-0 text-safecrib-green" fill="none"><path d="M5 16 20 7l15 9v18H5zM10 17h20M13 20v9m7-9v9m7-9v9M3 34h34" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div><h3 className="font-semibold">Study close</h3><p className="mt-1 text-sm leading-6 text-black/55">Compare home details with campus life in mind.</p></div>
          </div>
          <div className="flex gap-4 border-b border-black/10 py-5 sm:border-b-0 sm:border-r sm:px-5">
            <svg aria-hidden="true" viewBox="0 0 40 40" className="h-9 w-9 shrink-0 text-safecrib-green" fill="none"><path d="M6 11h28v19H6zM10 30v4m20-4v4M11 17h18M11 22h8m-8 4h13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><circle cx="29" cy="26" r="1.5" fill="currentColor" /></svg>
            <div><h3 className="font-semibold">Move with ease</h3><p className="mt-1 text-sm leading-6 text-black/55">Keep transport and everyday routes part of the search.</p></div>
          </div>
          <div className="flex gap-4 py-5 sm:pl-5">
            <svg aria-hidden="true" viewBox="0 0 40 40" className="h-9 w-9 shrink-0 text-safecrib-green" fill="none"><path d="M20 5 32 10v9c0 8-5 13-12 16C13 32 8 27 8 19v-9z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="m14 20 4 4 8-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div><h3 className="font-semibold">Know who&apos;s hosting</h3><p className="mt-1 text-sm leading-6 text-black/55">See which providers and homes have been reviewed.</p></div>
          </div>
        </div>
      </section>

      <section id="how" className="scroll-mt-24 border-y border-black/10 bg-[#F8FAF8]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-7 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-5" data-reveal>
            <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-safecrib-green">A clear path</p><h2 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Trust, built in steps.</h2></div>
            <p className="max-w-sm text-sm leading-6 text-black/55">Reviews are part of the journey, not a promise hidden in the small print.</p>
          </div>
          <ol className="mt-8 grid gap-0 sm:grid-cols-3" data-reveal>
            {[
              { n: "01", title: "Create your account", text: "Join SafeCrib and tell us whether you are looking for a home or sharing one." },
              { n: "02", title: "Get verified", text: "Student profiles and provider Pages go through admin review before their verified status appears." },
              { n: "03", title: "Make your next move", text: "Students explore reviewed homes. Approved providers manage and submit their listings." },
            ].map((step, index) => <li key={step.n} className={`py-5 sm:py-2 ${index > 0 ? "border-t border-black/10 sm:border-l sm:border-t-0 sm:pl-6" : "sm:pr-6"} ${index === 1 ? "sm:px-6" : ""}`}>
              <span className="font-display text-3xl font-semibold text-safecrib-green">{step.n}</span><h3 className="mt-4 font-semibold">{step.title}</h3><p className="mt-2 max-w-xs text-sm leading-6 text-black/55">{step.text}</p>
            </li>)}
          </ol>
        </div>
      </section>

      <section id="providers" className="mx-auto grid max-w-6xl scroll-mt-24 gap-8 px-4 py-14 sm:px-7 sm:py-16 md:grid-cols-[1fr_auto] md:items-center" data-reveal>
        <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-safecrib-green">For agents and landlords</p><h2 className="mt-3 max-w-xl font-display text-3xl font-semibold leading-tight sm:text-4xl">Put good homes on the right path.</h2><p className="mt-3 max-w-xl text-base leading-7 text-black/60">Create a provider Page, complete review, then manage homes through a clear submission process.</p></div>
        <RouteLink href={accountHref} className="inline-flex min-h-12 items-center justify-center rounded-full border border-safecrib-green px-5 py-3 text-sm font-semibold text-safecrib-green transition-colors hover:bg-[#EAF7F1]">{isAuthenticated ? "Open dashboard" : "Start as a provider"}</RouteLink>
      </section>

      <section className="border-t border-black/10 bg-[#F1F7F3]">
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-10 sm:px-7 md:flex-row md:items-center md:justify-between" data-reveal>
          <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-safecrib-green">Your next chapter starts here</p><h2 className="mt-2 font-display text-2xl font-semibold">Find your place with SafeCrib.</h2></div>
          <div className="flex flex-wrap items-center gap-3"><InstallButton /><RouteLink href={accountHref} className="inline-flex min-h-11 items-center justify-center rounded-full bg-safecrib-green px-5 py-3 text-sm font-semibold text-white hover:bg-[#095E47]">{isAuthenticated ? "Open dashboard" : "Get started"}</RouteLink></div>
        </div>
      </section>

      {/* Public Listings Feed */}
      <section id="listings-feed" className="mx-auto max-w-6xl px-4 py-14 sm:px-7" data-reveal>
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-safecrib-green">Available homes</p>
          <h2 className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl">Browse verified homes</h2>
        </div>

        {listingsLoading ? (
          <div className="space-y-5" role="status" aria-label="Loading listings">
            {[...Array(3)].map((_, i) => (
              <ListingPostSkeleton key={i} />
            ))}
          </div>
        ) : listingsError ? (
          <div className="text-center py-12 text-black/50">
            <p>{listingsError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 text-sm font-medium text-safecrib-green hover:underline"
            >
              Try again
            </button>
          </div>
        ) : listings.length === 0 ? (
          <div className="flex min-h-64 items-center justify-center rounded-xl border border-black/10 bg-white px-5 py-8" aria-label="No listings available">
            <EmptyListingsIllustration />
          </div>
        ) : (
          <div className="space-y-5">
            {listings.map((listing: PublicListing) => (
              <ListingPost
                key={listing.id}
                listing={{
                  ...listing,
                  photos: listing.photos ?? [],
                  video: listing.video ?? null,
                  likeCount: listing.likeCount ?? 0,
                  likedByCurrentUser: listing.likedByCurrentUser ?? false,
                  ownerId: listing.ownerId ?? listing.owner?.id ?? "unknown",
                  createdAt: listing.createdAt ?? new Date().toISOString(),
                  commentCount: listing._count?.comments ?? listing.commentCount ?? 0,
                  shareCount: listing._count?.shares ?? listing.shareCount ?? 0,
                  viewCount: listing._count?.views ?? listing.viewCount ?? 0,
                  isBookmarked: false,
                  ownerDisplayName: listing.owner?.displayName ?? listing.ownerDisplayName ?? "Agent",
                  ownerHandle: listing.owner?.username ?? listing.ownerHandle,
                  ownerAvatarMediaId: listing.owner?.profilePicture ?? listing.ownerAvatarMediaId,
                  ownerAvatarUrl: listing.owner?.profilePicture ?? listing.ownerAvatarUrl,
                  ownerIsVerified: (listing.owner?.verification?.stage ?? "PROFILE_VERIFIED") !== "PROFILE_VERIFIED" ? true : (listing.ownerIsVerified ?? false),
                  ownerVerificationBadge: listing.owner?.verification?.badgeColor ?? listing.ownerVerificationBadge,
                  ownerAgencyName: listing.owner?.providerPage?.displayName ?? listing.ownerAgencyName,
                  ownerPhone: listing.owner?.phone ?? listing.ownerPhone,
                  ownerWhatsApp: listing.owner?.whatsApp ?? listing.ownerWhatsApp,
                }}
                onLike={handleLike}
                onComment={handleComment}
                onCommentPrefetch={prefetchListing}
                onShare={handleShare}
                onBookmark={handleBookmark}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-xs text-black/50 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <SafeCribLogo height={18} />
        <p>Student accommodation, with trust built into the journey.</p>
        <a href="#top" className="font-medium text-safecrib-green hover:underline">Back to top</a>
      </footer>
    </main>
  );
}
