"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

interface ListingGalleryProps {
  photos: Array<{ id: string; url: string }>;
  title: string;
}

export function ListingGallery({ photos, title }: ListingGalleryProps) {
  const [current, setCurrent] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="aspect-[16/9] bg-[#F0F0F0] flex items-center justify-center">
        <p className="text-xs text-muted font-body">No photos available</p>
      </div>
    );
  }

  const prev = () => setCurrent((i) => (i - 1 + photos.length) % photos.length);
  const next = () => setCurrent((i) => (i + 1) % photos.length);

  return (
    <div className="relative" role="region" aria-label="Listing photos">
      {/* Main image */}
      <div className="relative aspect-[16/9] overflow-hidden bg-[#F0F0F0]">
        <Image
          src={photos[current].url}
          alt={`${title} — photo ${current + 1} of ${photos.length}`}
          fill
          sizes="(max-width: 768px) 100vw, 80vw"
          className="object-cover"
          priority={current === 0}
          loading={current === 0 ? "eager" : "lazy"}
        />
      </div>

      {/* Prev / Next — only if more than one photo */}
      {photos.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-paper border border-[#E5E5E5] hover:bg-[#F5F5F5] transition-colors"
            aria-label="Previous photo"
          >
            <ChevronLeftIcon size={16} aria-hidden />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-paper border border-[#E5E5E5] hover:bg-[#F5F5F5] transition-colors"
            aria-label="Next photo"
          >
            <ChevronRightIcon size={16} aria-hidden />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5" aria-hidden>
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrent(i)}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  i === current ? "bg-ink" : "bg-[rgba(10,10,10,0.3)]"
                }`}
                aria-label={`Go to photo ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}

      {/* Counter */}
      <span className="absolute top-3 right-3 bg-paper text-xs text-muted px-2 py-1 font-body">
        {current + 1} / {photos.length}
      </span>
    </div>
  );
}
