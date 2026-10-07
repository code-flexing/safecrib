"use client";
import { Skeleton } from "@/components/ui/Skeleton";

export function ProfileSkeleton() {
  return (
    <main className="mx-auto w-full max-w-[680px] bg-background text-foreground">
      {/* Cover */}
      <Skeleton className="h-36 w-full sm:h-48" animate />

      {/* Avatar overlap */}
      <div className="-mt-12 flex items-end justify-between px-4 sm:-mt-14">
        <Skeleton className="h-24 w-24 rounded-full" animate />
        <div className="pb-1 flex gap-2">
          <Skeleton className="h-10 w-28 rounded-full" animate />
          <Skeleton className="h-10 w-24 rounded-full" animate />
        </div>
      </div>

      {/* Identity */}
      <div className="px-4 pt-2 space-y-3">
        <Skeleton className="h-7 w-1/3" animate />
        <Skeleton className="h-4 w-1/4" animate />
        <Skeleton className="h-4 w-2/5" animate />
        <Skeleton className="h-5 w-1/3 rounded-full" animate />
        <Skeleton className="h-4 w-full" animate />
        <Skeleton className="h-4 w-3/4" animate />
      </div>

      {/* Stats */}
      <div className="mt-4 flex justify-between px-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="text-center">
            <Skeleton className="mx-auto h-5 w-1/2 rounded" animate />
            <Skeleton className="mt-1 h-3 w-full rounded" animate />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto px-4 pb-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-10 w-24 shrink-0 rounded-full" animate />
        ))}
      </div>

      {/* Feed skeletons */}
      <div className="divide-y divide-border border-t border-border">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="p-4">
            <Skeleton className="h-10 w-1/4 rounded" animate />
            <Skeleton className="mt-3 h-6 w-1/2 rounded" animate />
            <Skeleton className="mt-2 h-4 w-3/4 rounded" animate />
            <Skeleton className="mt-4 h-44 w-full rounded" animate />
            <Skeleton className="mt-3 h-10 w-full rounded" animate />
          </div>
        ))}
      </div>
    </main>
  );
}