"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  adminFetch,
  ApiError,
  resolveAdminMediaUrl,
  unwrapData,
} from "@/lib/api";

type ListingStatus = "SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED" | string;
type ListingPhoto = {
  id?: string;
  mediaId?: string | null;
  url?: string;
};
type HomeListing = {
  id: string;
  title: string;
  description: string | null;
  price: number;
  discountAmount: number | null;
  lat: number;
  lng: number;
  campus: string | null;
  address: string | null;
  locationReference: string | null;
  status: ListingStatus;
  ownerId: string;
  photos: ListingPhoto[];
  video: { mediaId: string; durationSec: number | null } | null;
  createdAt: string;
  updatedAt: string;
};
type ReviewAction = "APPROVED" | "REJECTED";
type MediaPreview = { url: string | null; error: string | null };

export default function AdminHomeReviewPage() {
  const { id: encodedId } = useParams<{ id: string }>();
  const id = decodeURIComponent(encodedId);
  const router = useRouter();
  const [home, setHome] = useState<HomeListing | null>(null);
  const [photoPreviews, setPhotoPreviews] = useState<MediaPreview[]>([]);
  const [videoPreview, setVideoPreview] = useState<MediaPreview | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [confirmAction, setConfirmAction] = useState<ReviewAction | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const detail = unwrapData<HomeListing>(
        await adminFetch<unknown>(`/api/v1/listings/admin/${encodeURIComponent(id)}`),
      );
      setHome(detail);
      const [photos, video] = await Promise.all([
        Promise.all(
          (detail.photos ?? []).map((photo) =>
            resolveAdminMediaUrl(photo.mediaId || photo.url),
          ),
        ),
        detail.video
          ? resolveAdminMediaUrl(detail.video.mediaId)
          : Promise.resolve(null),
      ]);
      setPhotoPreviews(photos);
      setVideoPreview(video);
    } catch (loadError) {
      if (
        loadError instanceof ApiError &&
        (loadError.status === 401 || loadError.status === 403)
      ) {
        router.replace(
          `/admin/login?reason=${loadError.status === 403 ? "denied" : "session-expired"}`,
        );
        return;
      }
      setError(
        loadError instanceof ApiError && loadError.status === 404
          ? "This home no longer exists. Return to the queue and refresh it."
          : "We could not load this home for review.",
      );
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (status: ReviewAction) => {
    const trimmedReason = reason.trim();
    if (status === "REJECTED" && !trimmedReason) {
      setError("A rejection reason is required.");
      setConfirmAction(null);
      return;
    }
    if (trimmedReason.length > 2000) {
      setError("The review reason must be 2,000 characters or fewer.");
      return;
    }
    setAction(status);
    setError("");
    try {
      const response = unwrapData<HomeListing>(
        await adminFetch<unknown>(
          `/api/v1/listings/${encodeURIComponent(id)}/${status === "APPROVED" ? "verify" : "reject"}`,
          {
            method: "PATCH",
            body: JSON.stringify(
              status === "REJECTED" ? { notes: trimmedReason } : {},
            ),
          },
        ),
      );
      setHome(response);
      setConfirmAction(null);
      setError("");
    } catch (reviewError) {
      if (
        reviewError instanceof ApiError &&
        (reviewError.status === 401 || reviewError.status === 403)
      ) {
        router.replace(
          `/admin/login?reason=${reviewError.status === 403 ? "denied" : "session-expired"}`,
        );
        return;
      }
      setError(
        reviewError instanceof ApiError
          ? reviewError.message
          : "We could not update this home review.",
      );
    } finally {
      setAction(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-black/55">Loading home...</p>;
  }
  if (!home) {
    return (
      <div>
        <Link href="/admin" className="text-sm font-medium text-safecrib-green hover:underline">
          Back to queue
        </Link>
        <p className="mt-6 text-sm text-red-600" role="alert">
          {error || "Home unavailable."}
        </p>
      </div>
    );
  }

  const pending = ["SUBMITTED", "UNDER_REVIEW"].includes(home.status);

  return (
    <>
      <div>
        <Link href="/admin" className="text-sm font-medium text-safecrib-green hover:underline">
          Back to queue
        </Link>
        <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">
              Home submission
            </p>
            <h1 className="mt-2 text-3xl font-medium">{home.title}</h1>
            <p className="mt-2 text-sm text-black/55">
              {home.status} · Submitted {new Date(home.createdAt).toLocaleString()}
            </p>
          </div>
          {pending && (
            <div className="flex gap-3">
              <button
                type="button"
                disabled={action !== null}
                onClick={() => setConfirmAction("APPROVED")}
                className="rounded-[4px] bg-safecrib-green px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                Approve home
              </button>
              <button
                type="button"
                disabled={action !== null}
                onClick={() => {
                  if (!reason.trim()) {
                    setError("A rejection reason is required.");
                    return;
                  }
                  setConfirmAction("REJECTED");
                }}
                className="rounded-[4px] border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-40"
              >
                Reject home
              </button>
            </div>
          )}
        </div>
        {error && (
          <p className="mt-6 rounded-[4px] border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
        {!pending && (
          <p className="mt-6 rounded-[4px] border border-black/10 bg-white p-4 text-sm text-black/65">
            This home has already been reviewed and is {home.status.toLowerCase()}.
          </p>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-6">
            <section className="rounded-[8px] border border-black/10 bg-white p-6">
              <h2 className="text-lg font-medium">Home details</h2>
              <dl className="mt-5 divide-y divide-black/10">
                {[
                  ["Price", `₦${home.price.toLocaleString()}`],
                  ["Discount", home.discountAmount ? `₦${home.discountAmount.toLocaleString()}` : "None"],
                  ["Address", home.address || "Not provided"],
                  ["Campus", home.campus || "Not provided"],
                  ["Google Maps reference", home.locationReference || "Not provided"],
                  ["Description", home.description || "Not provided"],
                  ["Submitted by account", home.ownerId],
                ].map(([label, value]) => (
                  <div key={label} className="grid gap-1 py-4 sm:grid-cols-[180px_1fr]">
                    <dt className="text-sm font-medium text-black/55">{label}</dt>
                    <dd className="break-words text-sm">{value}</dd>
                  </div>
                ))}
              </dl>
              {pending && (
                <label className="mt-6 block text-sm font-medium">
                  Rejection reason
                  <textarea
                    maxLength={2000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Required when rejecting"
                    rows={4}
                    className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none"
                  />
                  <span className="mt-1 block text-xs font-normal text-black/45">
                    {reason.length}/2000
                  </span>
                </label>
              )}
            </section>
            <section className="rounded-[8px] border border-black/10 bg-white p-6">
              <h2 className="text-lg font-medium">Home media</h2>
              {photoPreviews.length === 0 && !videoPreview ? (
                <p className="mt-4 text-sm text-black/55">No media attached.</p>
              ) : (
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  {photoPreviews.map((photo, index) => (
                    <div key={home.photos[index]?.id ?? index} className="overflow-hidden rounded-[4px] border border-black/10">
                      {photo.url ? (
                        <Image
                          src={photo.url}
                          alt={`Home photo ${index + 1}`}
                          width={960}
                          height={640}
                          unoptimized
                          className="aspect-[3/2] w-full object-cover"
                        />
                      ) : (
                        <p className="p-4 text-sm text-amber-900">{photo.error || "Photo could not be loaded."}</p>
                      )}
                    </div>
                  ))}
                  {videoPreview && (
                    <div className="sm:col-span-2">
                      {videoPreview.url ? (
                        <video src={videoPreview.url} controls className="max-h-[480px] w-full rounded-[4px] bg-black" />
                      ) : (
                        <p className="text-sm text-amber-900">{videoPreview.error || "Video could not be loaded."}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
          <aside className="h-fit rounded-[8px] border border-black/10 bg-white p-5">
            <h2 className="font-medium">Location</h2>
            <p className="mt-3 text-sm text-black/65">
              {home.address || home.locationReference || "No address or map reference provided."}
            </p>
            {home.lat !== undefined && home.lng !== undefined && (
              <a
                href={`https://www.google.com/maps?q=${encodeURIComponent(`${home.lat},${home.lng}`)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-block text-sm font-medium text-safecrib-green underline"
              >
                Open coordinates in Maps
              </a>
            )}
          </aside>
        </div>
      </div>

      <Modal
        open={confirmAction !== null}
        onClose={() => action === null && setConfirmAction(null)}
        titleId="confirm-home-review-title"
      >
        <div className="p-6">
          <h2 id="confirm-home-review-title" className="text-xl font-medium">
            {confirmAction === "REJECTED" ? "Reject this home?" : "Approve this home?"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-black/65">
            {confirmAction === "REJECTED"
              ? "The provider will be notified and can update the home using the reason below."
              : "This will make the home visible to students in the marketplace."}
          </p>
          {confirmAction === "REJECTED" && (
            <p className="mt-4 rounded-[4px] bg-red-50 p-3 text-sm text-red-800">
              {reason.trim()}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              disabled={action !== null}
              onClick={() => setConfirmAction(null)}
              className="rounded-[4px] border border-black/15 px-4 py-2 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={action !== null}
              onClick={() => confirmAction && void decide(confirmAction)}
              className={`rounded-[4px] px-4 py-2 text-sm font-medium text-white disabled:opacity-40 ${confirmAction === "REJECTED" ? "bg-red-700" : "bg-safecrib-green"}`}
            >
              {action ? "Saving..." : `Confirm ${confirmAction === "REJECTED" ? "rejection" : "approval"}`}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
