"use client";

/**
 * /agent/listings/new — Create a new listing.
 *
 * Two-step flow:
 *   1. Fill in listing details → POST /listings → get a listingId back
 *   2. Upload photos (uses the listingId, triggers pHash check)
 *
 * The form component handles both steps seamlessly: after creation it
 * re-renders in "edit" mode with the new listingId available for photo upload.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { listingsApi, type Listing } from "@/lib/api/listings";
import { ListingForm, type ListingFormValues } from "@/components/forms/ListingForm";

export default function NewListingPage() {
  const router       = useRouter();
  const queryClient  = useQueryClient();
  const [created, setCreated] = useState<Listing | null>(null);
  const [error, setError]     = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (values: ListingFormValues) =>
      listingsApi.create({
        title:         values.title,
        description:   values.description,
        price:         Number(values.price),
        address:       values.address,
        lat:           Number(values.lat),
        lng:           Number(values.lng),
        availableFrom: values.availableFrom,
      }).then((r) => r.data),

    onSuccess: (listing) => {
      queryClient.invalidateQueries({ queryKey: ["myListings"] });
      setCreated(listing);
      setError(null);
    },

    onError: (err: Error) => {
      setError(err.message ?? "Failed to create listing. Please try again.");
    },
  });

  return (
    <div className="px-6 py-8">
      <Link
        href="/agent/dashboard"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink transition-colors mb-8 font-body"
      >
        <ArrowLeftIcon size={14} aria-hidden />
        Dashboard
      </Link>

      <h1 className="font-display text-display-md text-ink mb-8">
        {created ? "Add photos" : "New listing"}
      </h1>

      {created ? (
        /* ── Step 2: listing created, now add photos ─────────── */
        <div>
          <div className="banner-success mb-6">
            <p className="font-medium">Listing created.</p>
            <p className="text-sm mt-0.5">
              Add photos below — each one is scanned for duplicates automatically.
              You can also add them later from the{" "}
              <Link href="/agent/dashboard" className="underline">dashboard</Link>.
            </p>
          </div>

          <ListingForm
            initial={{
              title:         created.title,
              description:   created.description,
              price:         String(created.price),
              address:       created.address,
              availableFrom: created.availableFrom,
            }}
            existingPhotos={created.photos}
            listingId={created.id}
            onSubmit={async () => {
              router.push("/agent/dashboard");
            }}
            submitLabel="Done — go to dashboard"
            isSubmitting={false}
          />
        </div>
      ) : (
        /* ── Step 1: fill in listing details ─────────────────── */
        <ListingForm
          onSubmit={async (values) => {
            await createMutation.mutateAsync(values);
          }}
          submitLabel="Create listing"
          isSubmitting={createMutation.isPending}
          submitError={error}
        />
      )}
    </div>
  );
}
