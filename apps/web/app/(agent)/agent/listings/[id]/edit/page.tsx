"use client";

/**
 * /agent/listings/[id]/edit — Edit an existing listing.
 *
 * Loads the listing, pre-fills the form, sends a PATCH on submit.
 * Photo upload is available immediately since the listingId already exists.
 */

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftIcon, Trash2Icon } from "lucide-react";
import { listingsApi } from "@/lib/api/listings";
import { ListingForm, type ListingFormValues } from "@/components/forms/ListingForm";
import { useState } from "react";

export default function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id }      = use(params);
  const router      = useRouter();
  const queryClient = useQueryClient();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: listing, isLoading, isError } = useQuery({
    queryKey: ["listing", id],
    queryFn:  () => listingsApi.getById(id).then((r) => r.data),
    staleTime: 60_000,
  });

  const updateMutation = useMutation({
    mutationFn: (values: ListingFormValues) =>
      listingsApi.update(id, {
        title:         values.title,
        description:   values.description,
        price:         Number(values.price),
        address:       values.address,
        availableFrom: values.availableFrom,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listing", id] });
      queryClient.invalidateQueries({ queryKey: ["myListings"] });
      router.push("/agent/dashboard");
    },
    onError: (err: Error) => {
      setError(err.message ?? "Failed to update listing.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => listingsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["myListings"] });
      router.push("/agent/dashboard");
    },
    onError: (err: Error) => {
      setError(err.message ?? "Failed to delete listing.");
    },
  });

  if (isLoading) {
    return (
      <div className="px-6 py-8 space-y-4 max-w-xl">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-10 w-64" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !listing) {
    return (
      <div className="px-6 py-8">
        <div className="banner-error mb-4">Listing not found or you don&apos;t have access to edit it.</div>
        <Link href="/agent/dashboard" className="btn-secondary text-sm">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="px-6 py-8">
      <Link
        href="/agent/dashboard"
        className="inline-flex items-center gap-2 text-sm text-muted hover:text-ink transition-colors mb-8 font-body"
      >
        <ArrowLeftIcon size={14} aria-hidden />
        Dashboard
      </Link>

      <div className="flex items-start justify-between gap-6 mb-8">
        <h1 className="font-display text-display-md text-ink">Edit listing</h1>

        {/* Delete — destructive, requires confirmation */}
        {!deleteConfirm ? (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="btn-ghost text-sm text-muted flex items-center gap-1.5 shrink-0"
          >
            <Trash2Icon size={14} aria-hidden />
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-sm text-muted font-body">Sure?</span>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="btn-primary text-sm px-4 py-1.5"
            >
              {deleteMutation.isPending ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              onClick={() => setDeleteConfirm(false)}
              className="btn-ghost text-sm px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {error && <div className="banner-error mb-6">{error}</div>}

      <ListingForm
        initial={{
          title:         listing.title,
          description:   listing.description,
          price:         String(listing.price),
          address:       listing.address,
          lat:           String(listing.lat),
          lng:           String(listing.lng),
          availableFrom: listing.availableFrom.split("T")[0],
        }}
        existingPhotos={listing.photos}
        listingId={listing.id}
        onSubmit={async (values) => {
          setError(null);
          await updateMutation.mutateAsync(values);
        }}
        submitLabel="Save changes"
        isSubmitting={updateMutation.isPending}
        submitError={null}
      />
    </div>
  );
}
