"use client";

import { Skeleton } from "@/components/ui/Skeleton";

export function ListingPostSkeleton() {
  return (
    <article className="overflow-hidden rounded-[16px] border border-black/10 bg-white shadow-[0_4px_24px_rgba(11,12,14,0.04)]" aria-hidden="true">
      {/* Header skeleton */}
      <div className="px-4 pt-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-16 w-16 shrink-0 rounded-full" animate />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-3/12" animate />
            <Skeleton className="h-4 w-4/12" animate />
            <Skeleton className="h-3 w-6/12" animate />
          </div>
          <Skeleton className="h-10 w-10 shrink-0 rounded-full" animate />
        </div>
      </div>

      {/* Body skeleton */}
      <div className="px-4 pb-3 space-y-3">
        <Skeleton className="h-7 w-5/12" animate />
        <Skeleton className="h-4 w-8/12" animate />
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-24" animate />
          <Skeleton className="h-6 w-16 rounded-full border" animate />
          <Skeleton className="h-6 w-16 rounded-full border" animate />
          <Skeleton className="h-6 w-20 rounded-full border" animate />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" animate />
          <Skeleton className="h-4 w-9/12" animate />
          <Skeleton className="h-4 w-7/12" animate />
        </div>
      </div>

      {/* Media skeleton */}
      <div className="px-4 pb-4">
        <Skeleton className="aspect-[4/3] w-full rounded-xl" animate />
      </div>

      {/* Actions skeleton */}
      <div className="px-4 pb-4 border-t border-black/10">
        <div className="flex items-center gap-4 mb-3">
          <Skeleton className="h-5 w-20 flex items-center gap-1 rounded-full" animate />
          <Skeleton className="h-5 w-24 flex items-center gap-1 rounded-full" animate />
          <Skeleton className="h-5 w-20 flex items-center gap-1 rounded-full" animate />
          <Skeleton className="h-5 w-16 flex items-center gap-1 rounded-full" animate />
          <div className="flex-1" />
          <Skeleton className="h-8 w-20 rounded-full" animate />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-28 rounded-full border" animate />
          <Skeleton className="h-10 w-28 rounded-full" animate />
          <Skeleton className="h-10 w-32 rounded-full" animate />
        </div>
      </div>
    </article>
  );
}