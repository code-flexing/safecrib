"use client";

/**
 * ListingForm — shared form for creating and editing listings.
 *
 * Handles:
 *   - All text fields with inline validation
 *   - Photo upload with pHash duplicate warning (from backend response)
 *   - Photo preview gallery
 *
 * The pHash duplicate warning surfaces the backend's fraud detection directly
 * in the agent's own upload flow — they see it before publish, not after.
 */

import { useState, useRef, type FormEvent } from "react";
import Image from "next/image";
import { UploadCloudIcon, AlertTriangleIcon, XIcon, ImageIcon } from "lucide-react";
import { listingsApi, type Listing } from "@/lib/api/listings";
import { DuplicateWarningBanner } from "@/components/listing/DuplicateWarningBanner";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ListingFormValues {
  title:         string;
  description:   string;
  price:         string; // kept as string for controlled input, coerced on submit
  address:       string;
  lat:           string;
  lng:           string;
  availableFrom: string;
}

interface ListingFormProps {
  /** Initial values — used when editing an existing listing */
  initial?: Partial<ListingFormValues>;
  /** If editing, the listing's existing photos */
  existingPhotos?: Listing["photos"];
  /** If editing, the listing ID (used for photo upload endpoint) */
  listingId?: string;
  /** Called with validated values on submit */
  onSubmit: (values: ListingFormValues) => Promise<void>;
  /** Label shown on the submit button */
  submitLabel?: string;
  isSubmitting?: boolean;
  submitError?: string | null;
}

// ── Component ──────────────────────────────────────────────────────────────

export function ListingForm({
  initial = {},
  existingPhotos = [],
  listingId,
  onSubmit,
  submitLabel = "Save listing",
  isSubmitting = false,
  submitError = null,
}: ListingFormProps) {
  const [values, setValues] = useState<ListingFormValues>({
    title:         initial.title         ?? "",
    description:   initial.description   ?? "",
    price:         initial.price         ?? "",
    address:       initial.address       ?? "",
    lat:           initial.lat           ?? "",
    lng:           initial.lng           ?? "",
    availableFrom: initial.availableFrom ?? "",
  });

  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ListingFormValues, string>>>({});

  // Photo upload state
  const [photos, setPhotos]           = useState<Listing["photos"]>(existingPhotos);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError]   = useState<string | null>(null);
  const [dupWarning, setDupWarning]   = useState<{
    matchedListingId: string;
    similarity: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof ListingFormValues) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      setFieldErrors((e2) => ({ ...e2, [key]: undefined }));
    };

  const validate = (): boolean => {
    const errors: Partial<Record<keyof ListingFormValues, string>> = {};
    if (!values.title.trim())       errors.title         = "Title is required.";
    if (!values.description.trim()) errors.description   = "Description is required.";
    if (!values.price || isNaN(Number(values.price)) || Number(values.price) <= 0)
                                    errors.price         = "Enter a valid monthly price.";
    if (!values.address.trim())     errors.address       = "Address is required.";
    if (!values.lat || isNaN(Number(values.lat)))
                                    errors.lat           = "Enter a valid latitude.";
    if (!values.lng || isNaN(Number(values.lng)))
                                    errors.lng           = "Enter a valid longitude.";
    if (!values.availableFrom)      errors.availableFrom = "Available-from date is required.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(values);
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files?.length || !listingId) return;
    const file = files[0];
    setPhotoError(null);
    setDupWarning(null);
    setUploadingPhoto(true);

    try {
      const res = await listingsApi.uploadPhoto(listingId, file);
      const photoData = res.data;
      setPhotos((prev) => [
        ...prev,
        { id: photoData.id, url: photoData.url, phash: photoData.phash },
      ]);
      if (photoData.duplicateWarning) {
        setDupWarning(photoData.duplicateWarning);
      }
    } catch (err) {
      setPhotoError(
        (err as Error)?.message ?? "Photo upload failed. Please try again.",
      );
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6 max-w-xl">
      {submitError && <div className="banner-error">{submitError}</div>}

      {/* ── Title ──────────────────────────────────────────── */}
      <div>
        <label className="label" htmlFor="listing-title">Title</label>
        <input
          id="listing-title"
          type="text"
          className="input"
          placeholder="e.g. Double room in shared house, 5 min from campus"
          value={values.title}
          onChange={set("title")}
          maxLength={200}
        />
        {fieldErrors.title && <p className="field-error">{fieldErrors.title}</p>}
      </div>

      {/* ── Description ────────────────────────────────────── */}
      <div>
        <label className="label" htmlFor="listing-description">Description</label>
        <textarea
          id="listing-description"
          className="input resize-none h-32 text-sm"
          placeholder="Describe the room, house rules, what's included in the price…"
          value={values.description}
          onChange={set("description")}
          maxLength={2000}
        />
        {fieldErrors.description && <p className="field-error">{fieldErrors.description}</p>}
      </div>

      {/* ── Price ──────────────────────────────────────────── */}
      <div>
        <label className="label" htmlFor="listing-price">Monthly price (£)</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">£</span>
          <input
            id="listing-price"
            type="number"
            min={1}
            step={1}
            className="input pl-7"
            placeholder="650"
            value={values.price}
            onChange={set("price")}
          />
        </div>
        {fieldErrors.price && <p className="field-error">{fieldErrors.price}</p>}
      </div>

      {/* ── Address ────────────────────────────────────────── */}
      <div>
        <label className="label" htmlFor="listing-address">Address</label>
        <input
          id="listing-address"
          type="text"
          className="input"
          placeholder="Full street address"
          value={values.address}
          onChange={set("address")}
        />
        {fieldErrors.address && <p className="field-error">{fieldErrors.address}</p>}
        <p className="text-xs text-muted mt-1 font-body">
          Shown publicly — use the street address, not your flat number if you prefer.
        </p>
      </div>

      {/* ── Coordinates ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="listing-lat">Latitude</label>
          <input
            id="listing-lat"
            type="number"
            step="any"
            className="input"
            placeholder="51.5074"
            value={values.lat}
            onChange={set("lat")}
          />
          {fieldErrors.lat && <p className="field-error">{fieldErrors.lat}</p>}
        </div>
        <div>
          <label className="label" htmlFor="listing-lng">Longitude</label>
          <input
            id="listing-lng"
            type="number"
            step="any"
            className="input"
            placeholder="-0.1278"
            value={values.lng}
            onChange={set("lng")}
          />
          {fieldErrors.lng && <p className="field-error">{fieldErrors.lng}</p>}
        </div>
      </div>
      <p className="text-xs text-muted -mt-4 font-body">
        Used for proximity search. You can get coordinates from{" "}
        <a
          href="https://www.latlong.net/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-ink"
        >
          latlong.net
        </a>
        .
      </p>

      {/* ── Available from ─────────────────────────────────── */}
      <div>
        <label className="label" htmlFor="listing-available-from">Available from</label>
        <input
          id="listing-available-from"
          type="date"
          className="input"
          value={values.availableFrom}
          onChange={set("availableFrom")}
          min={new Date().toISOString().split("T")[0]}
        />
        {fieldErrors.availableFrom && <p className="field-error">{fieldErrors.availableFrom}</p>}
      </div>

      {/* ── Photos ─────────────────────────────────────────── */}
      <div>
        <p className="label">Photos</p>

        {/* Existing photo grid */}
        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-3">
            {photos.map((photo, i) => (
              <div key={photo.id} className="relative aspect-[4/3] overflow-hidden border border-[#E5E5E5]">
                <Image
                  src={photo.url}
                  alt={`Photo ${i + 1}`}
                  fill
                  sizes="150px"
                  className="object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        )}

        {/* Duplicate warning from pHash check */}
        {dupWarning && (
          <DuplicateWarningBanner
            matchedListingId={dupWarning.matchedListingId}
            similarity={dupWarning.similarity}
            className="mb-3"
          />
        )}

        {photoError && <p className="field-error mb-3">{photoError}</p>}

        {/* Upload button — only enabled after the listing is created (needs listingId) */}
        {listingId ? (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              id="photo-upload"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => handlePhotoUpload(e.target.files)}
              disabled={uploadingPhoto}
            />
            <label
              htmlFor="photo-upload"
              className={`btn-secondary cursor-pointer inline-flex items-center gap-2 text-sm ${
                uploadingPhoto ? "opacity-40 pointer-events-none" : ""
              }`}
            >
              <UploadCloudIcon size={14} aria-hidden />
              {uploadingPhoto ? "Uploading…" : "Add photo"}
            </label>
            <p className="text-xs text-muted mt-1.5 font-body">
              JPEG, PNG or WebP. Max 10 MB per photo. Photos are scanned for duplicates on upload.
            </p>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-4 border border-dashed border-[#D4D4D4] px-4 text-muted">
            <ImageIcon size={16} aria-hidden />
            <p className="text-sm font-body">
              Save the listing first, then add photos.
            </p>
          </div>
        )}
      </div>

      <hr className="hairline" />

      <button
        type="submit"
        className="btn-primary w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
