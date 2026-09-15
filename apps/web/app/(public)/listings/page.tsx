"use client";

/**
 * /listings — Public search results page.
 *
 * URL-driven search state: all filters live in the query string so results
 * are shareable and the browser back button works correctly.
 *
 * Filter controls: text search, price range, available-from date.
 * Results rendered as a 3-column responsive grid of ListingCards.
 * Empty state and error state are explicit, not silent.
 */

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { SearchIcon, SlidersHorizontalIcon, XIcon } from "lucide-react";
import { listingsApi, type ListingSearchParams } from "@/lib/api/listings";
import { ListingCard, ListingCardSkeleton } from "@/components/listing/ListingCard";

// ── Filter state helpers ───────────────────────────────────────────────────

function paramsToFilters(sp: URLSearchParams): ListingSearchParams {
  return {
    search:       sp.get("search")        ?? undefined,
    minPrice:     sp.get("minPrice")  ? Number(sp.get("minPrice"))  : undefined,
    maxPrice:     sp.get("maxPrice")  ? Number(sp.get("maxPrice"))  : undefined,
    availableFrom: sp.get("availableFrom") ?? undefined,
    page:          sp.get("page")     ? Number(sp.get("page"))     : 1,
    pageSize:      20,
  };
}

function filtersToParams(f: ListingSearchParams): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.search)        sp.set("search",       f.search);
  if (f.minPrice)      sp.set("minPrice",      String(f.minPrice));
  if (f.maxPrice)      sp.set("maxPrice",      String(f.maxPrice));
  if (f.availableFrom) sp.set("availableFrom", f.availableFrom);
  if (f.page && f.page > 1) sp.set("page", String(f.page));
  return sp;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ListingsSearchPage() {
  return (
    <Suspense fallback={
      <div className="content-max py-10">
        <div className="skeleton h-8 w-48 mb-8" />
        <div className="skeleton h-12 w-full mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {Array.from({ length: 9 }).map((_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      </div>
    }>
      <ListingsSearchContent />
    </Suspense>
  );
}

function ListingsSearchContent() {
  const router      = useRouter();
  const searchParams = useSearchParams();

  const [filters, setFilters]         = useState<ListingSearchParams>(() => paramsToFilters(searchParams));
  const [showFilters, setShowFilters] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Sync URL → local state when the URL changes (e.g. browser back)
  useEffect(() => {
    setFilters(paramsToFilters(searchParams));
  }, [searchParams]);

  // Push filter changes into the URL
  const applyFilters = useCallback(
    (next: ListingSearchParams) => {
      const sp = filtersToParams({ ...next, page: 1 });
      router.push(`/listings${sp.toString() ? `?${sp}` : ""}`);
    },
    [router],
  );

  const clearFilters = () => {
    router.push("/listings");
    if (searchRef.current) searchRef.current.value = "";
  };

  const hasActiveFilters =
    !!filters.search || !!filters.minPrice || !!filters.maxPrice || !!filters.availableFrom;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["listings", filters],
    queryFn:  () => listingsApi.search(filters).then((r) => r.data),
    staleTime: 30_000,
  });

  const listings    = data?.data ?? [];
  const total       = data?.total ?? 0;
  const currentPage = filters.page ?? 1;
  const totalPages  = data ? Math.ceil(total / (data.pageSize || 20)) : 1;

  return (
    <div className="content-max py-10">
      {/* ── Page header ──────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="font-display text-display-md text-ink mb-1">Verified listings</h1>
        {!isLoading && data && (
          <p className="text-sm text-muted font-body">
            {total.toLocaleString()} {total === 1 ? "listing" : "listings"} found
          </p>
        )}
      </div>

      {/* ── Search bar + filter toggle ────────────────────────────── */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <SearchIcon
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
            aria-hidden
          />
          <input
            ref={searchRef}
            type="search"
            className="input pl-9"
            placeholder="Search by location, title, or address…"
            defaultValue={filters.search ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                applyFilters({ ...filters, search: e.currentTarget.value || undefined });
              }
            }}
            onBlur={(e) => {
              const val = e.currentTarget.value || undefined;
              if (val !== filters.search) {
                applyFilters({ ...filters, search: val });
              }
            }}
            aria-label="Search listings"
          />
        </div>

        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`btn-secondary flex items-center gap-2 px-4 ${showFilters ? "bg-ink text-paper" : ""}`}
          aria-expanded={showFilters}
          aria-controls="filter-panel"
        >
          <SlidersHorizontalIcon size={15} aria-hidden />
          <span className="hidden sm:inline">Filters</span>
          {hasActiveFilters && (
            <span className="w-1.5 h-1.5 rounded-full bg-ink ml-0.5" aria-hidden />
          )}
        </button>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="btn-ghost flex items-center gap-1.5 px-3 text-muted"
            aria-label="Clear all filters"
          >
            <XIcon size={14} aria-hidden />
            <span className="text-sm hidden sm:inline">Clear</span>
          </button>
        )}
      </div>

      {/* ── Filter panel ─────────────────────────────────────────── */}
      {showFilters && (
        <FilterPanel
          id="filter-panel"
          filters={filters}
          onApply={(next) => {
            applyFilters(next);
            setShowFilters(false);
          }}
        />
      )}

      {/* ── Results ──────────────────────────────────────────────── */}
      {isError && (
        <div className="banner-error mb-6">
          Failed to load listings. Please try again.
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {Array.from({ length: 9 }).map((_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <EmptyState hasFilters={hasActiveFilters} onClear={clearFilters} />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPage={(p) => applyFilters({ ...filters, page: p })}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Filter panel ───────────────────────────────────────────────────────────

function FilterPanel({
  id,
  filters,
  onApply,
}: {
  id: string;
  filters: ListingSearchParams;
  onApply: (f: ListingSearchParams) => void;
}) {
  const [local, setLocal] = useState<ListingSearchParams>(filters);

  return (
    <div
      id={id}
      className="card p-5 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-5"
    >
      {/* Min price */}
      <div>
        <label className="label" htmlFor="filter-min-price">Min price (£/mo)</label>
        <input
          id="filter-min-price"
          type="number"
          min={0}
          className="input"
          placeholder="No minimum"
          value={local.minPrice ?? ""}
          onChange={(e) =>
            setLocal((f) => ({
              ...f,
              minPrice: e.target.value ? Number(e.target.value) : undefined,
            }))
          }
        />
      </div>

      {/* Max price */}
      <div>
        <label className="label" htmlFor="filter-max-price">Max price (£/mo)</label>
        <input
          id="filter-max-price"
          type="number"
          min={0}
          className="input"
          placeholder="No maximum"
          value={local.maxPrice ?? ""}
          onChange={(e) =>
            setLocal((f) => ({
              ...f,
              maxPrice: e.target.value ? Number(e.target.value) : undefined,
            }))
          }
        />
      </div>

      {/* Available from */}
      <div>
        <label className="label" htmlFor="filter-available-from">Available from</label>
        <input
          id="filter-available-from"
          type="date"
          className="input"
          value={local.availableFrom ?? ""}
          onChange={(e) =>
            setLocal((f) => ({ ...f, availableFrom: e.target.value || undefined }))
          }
        />
      </div>

      {/* Apply */}
      <div className="sm:col-span-3 flex justify-end gap-3">
        <button
          type="button"
          onClick={() => onApply({})}
          className="btn-ghost text-sm"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => onApply(local)}
          className="btn-primary text-sm"
        >
          Apply filters
        </button>
      </div>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="py-20 text-center">
      <p className="font-display text-display-md text-ink mb-3">No listings found</p>
      {hasFilters ? (
        <>
          <p className="text-sm text-muted font-body mb-6">
            No listings match your current filters. Try widening your search.
          </p>
          <button onClick={onClear} className="btn-secondary text-sm">
            Clear filters
          </button>
        </>
      ) : (
        <p className="text-sm text-muted font-body">
          No listings are available right now. Check back soon.
        </p>
      )}
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────

function Pagination({
  currentPage,
  totalPages,
  onPage,
}: {
  currentPage: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <nav
      className="flex items-center justify-center gap-2 mt-12 pt-8 border-t border-[#E5E5E5]"
      aria-label="Pagination"
    >
      <button
        onClick={() => onPage(currentPage - 1)}
        disabled={currentPage === 1}
        className="btn-secondary text-sm px-4 py-2 disabled:opacity-40"
        aria-label="Previous page"
      >
        Previous
      </button>

      <span className="text-sm text-muted font-body px-4">
        Page {currentPage} of {totalPages}
      </span>

      <button
        onClick={() => onPage(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className="btn-secondary text-sm px-4 py-2 disabled:opacity-40"
        aria-label="Next page"
      >
        Next
      </button>
    </nav>
  );
}
