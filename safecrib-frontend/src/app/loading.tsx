import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <main className="min-h-screen bg-white text-safecrib-black" role="status" aria-live="polite" aria-label="Loading SafeCrib">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9" rounded="full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="hidden items-center gap-2 md:flex">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-11" rounded="md" />
            ))}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-[1.35fr_0.65fr]">
          <div className="space-y-4 rounded-2xl border border-black/5 bg-white p-4 shadow-[0_10px_30px_rgba(11,12,14,0.03)]">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-12 w-full" />
            <div className="grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-28 w-full" rounded="lg" />
              ))}
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-black/5 bg-white p-4 shadow-[0_10px_30px_rgba(11,12,14,0.03)]">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </section>
      </div>
    </main>
  );
}
