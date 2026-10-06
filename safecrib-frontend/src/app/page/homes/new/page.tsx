"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { ListingMediaImage, ListingMediaVideo } from "@/components/listings/ListingMediaPreview";
import { Button } from "@/components/ui/Button";
import { apiFetch, ApiError, clearClientCache, clearSession, normalizePageStatus, unwrapData, uploadListingMedia, waitForMediaReady, type PageStatus } from "@/lib/api";
import { readDraft, removeDraft, writeDraft } from "@/lib/drafts";

type ListingStatus = "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "VERIFIED" | "REJECTED" | "FLAGGED" | string;
type Photo = string | { id?: string; url?: string; mediaId?: string };
type Listing = { id: string; title?: string; description?: string; price?: number; discountAmount?: number; discountedPrice?: number; lat?: number; lng?: number; campus?: string; address?: string; locationReference?: string; photos?: Photo[]; video?: { mediaId?: string; durationSec?: number } | null; status?: ListingStatus };
type User = { id?: string; email?: string; role?: string; displayName?: unknown };
type ListingForm = { title: string; description: string; price: string; discountAmount: string; campus: string; address: string; locationReference: string; lat: string; lng: string };
type ListingDraft = { form: ListingForm; step: number; listingId: string };
type MediaProgress = { kind: "photo" | "video"; stage: "uploading" | "processing" | "attaching" | "complete"; percent: number; failed?: boolean };

const emptyForm: ListingForm = { title: "", description: "", price: "", discountAmount: "", campus: "", address: "", locationReference: "", lat: "", lng: "" };
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

function listingDraftKey(user: User) {
  return `safecrib:draft:provider-listing:v1:${user.id ?? user.email ?? "current"}`;
}

function statusName(status?: string) {
  return (status || "DRAFT").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function NewHomePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [pageStatus, setPageStatus] = useState<PageStatus>("none");
  const [listing, setListing] = useState<Listing | null>(null);
  const [form, setForm] = useState<ListingForm>(emptyForm);
  const [step, setStep] = useState(1);
  const [draftKey, setDraftKey] = useState("");
  const [restored, setRestored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"photo" | "video" | null>(null);
  const [mediaProgress, setMediaProgress] = useState<MediaProgress | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("safecrib_access_token")) {
      router.replace("/login");
      return;
    }
    const searchParams = new URLSearchParams(window.location.search);
    const listingId = searchParams.get("id");
    const freshStart = searchParams.get("new") === "1";
    void Promise.all([
      apiFetch<unknown>("/api/v1/users/me").then((response) => unwrapData<User>(response)),
      apiFetch<unknown>("/api/v1/provider-pages/me").then((response) => unwrapData<{ status?: string } | null>(response)),
      listingId ? apiFetch<unknown>(`/api/v1/listings/${encodeURIComponent(listingId)}`).then((response) => unwrapData<Listing>(response)) : Promise.resolve(null),
    ]).then(([currentUser, providerPage, existingListing]) => {
      setUser(currentUser);
      setPageStatus(normalizePageStatus(providerPage?.status));
      if (providerPage?.status?.toUpperCase() !== "VERIFIED") {
        router.replace("/page");
        return;
      }
      const key = listingDraftKey(currentUser);
      const savedDraft = freshStart ? null : readDraft<ListingDraft>(key);
      if (existingListing && !["DRAFT", "REJECTED"].includes(String(existingListing.status ?? "").toUpperCase())) {
        setListing(existingListing);
        setForm({ ...emptyForm, ...Object.fromEntries(Object.entries(existingListing).map(([key, value]) => [key, value == null ? "" : String(value)])) } as ListingForm);
        setStep(4);
        return;
      }
      setDraftKey(key);
      const draft = existingListing
        ? savedDraft?.listingId === existingListing.id ? savedDraft : null
        : savedDraft?.listingId ? null : savedDraft;
      const source = existingListing ?? null;
      setListing(source);
      const initialForm = source ? {
        title: source.title ?? "", description: source.description ?? "", price: source.price == null ? "" : String(source.price),
        discountAmount: source.discountAmount == null ? "" : String(source.discountAmount), campus: source.campus ?? "", address: source.address ?? "",
        locationReference: source.locationReference ?? "", lat: source.lat == null ? "" : String(source.lat), lng: source.lng == null ? "" : String(source.lng),
      } : draft?.form ?? emptyForm;
      setForm({ ...initialForm, ...(draft?.form ?? {}) });
      setStep(draft?.step ?? 1);
      setRestored(Boolean(draft && !existingListing));
    }).catch((loadError: unknown) => {
      if (loadError instanceof ApiError && loadError.status === 401) {
        clearSession();
        router.replace("/login?reason=session-expired");
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "We could not load the home form.");
    });
  }, [router]);

  useEffect(() => {
    if (!draftKey || !user) return;
    const timeout = window.setTimeout(() => writeDraft<ListingDraft>(draftKey, { form, step, listingId: listing?.id ?? "" }), 400);
    return () => window.clearTimeout(timeout);
  }, [draftKey, form, listing?.id, step, user]);

  const update = (field: keyof ListingForm, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const providerHome = () => router.push("/page");
  const isEditable = !listing || ["DRAFT", "REJECTED"].includes(String(listing.status ?? "").toUpperCase());

  const saveListing = async () => {
    const title = form.title.trim();
    const price = Number(form.price);
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    if (title.length < 3) throw new Error("Home title must be at least 3 characters.");
    if (!Number.isInteger(price) || price <= 0) throw new Error("Enter a positive whole-number price in the configured currency unit.");
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Add valid latitude and longitude coordinates.");
    const discountAmount = form.discountAmount.trim() ? Number(form.discountAmount) : undefined;
    if (discountAmount !== undefined && (!Number.isInteger(discountAmount) || discountAmount < 0 || discountAmount > price)) throw new Error("Discount must be a whole number between zero and the base price.");
    const payload = {
      title, description: form.description.trim(), price, ...(discountAmount === undefined ? {} : { discountAmount }),
      lat, lng, campus: form.campus.trim(), address: form.address.trim(), locationReference: form.locationReference.trim(),
    };
    const response = listing
      ? await apiFetch<unknown>(`/api/v1/listings/${encodeURIComponent(listing.id)}`, { method: "PATCH", body: JSON.stringify(payload) })
      : await apiFetch<unknown>("/api/v1/listings", { method: "POST", body: JSON.stringify(payload) });
    const saved = unwrapData<Listing>(response);
    if (!saved?.id && !listing?.id) throw new Error("The listing was saved without a listing ID. Refresh your homes and try again.");
    const result = { ...listing, ...saved, id: saved?.id ?? listing?.id } as Listing;
    setListing(result);
    return result;
  };

  const next = async () => {
    setError("");
    if (step === 1) {
      if (form.title.trim().length < 3 || form.title.trim().length > 200) { setError("Home title must be between 3 and 200 characters."); return; }
      if (!Number.isInteger(Number(form.price)) || Number(form.price) <= 0) { setError("Enter a positive whole-number price."); return; }
      if (form.description.length > 2000) { setError("Description must be 2,000 characters or fewer."); return; }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!form.address.trim() && !form.locationReference.trim()) { setError("Add a street address or a Google Maps link, Place ID, or Plus Code."); return; }
      setSaving(true);
      try { await saveListing(); setStep(3); }
      catch (saveError) { setError(saveError instanceof Error ? saveError.message : "We could not save this home."); }
      finally { setSaving(false); }
    }
  };

  const locate = () => {
    setError("");
    if (!navigator.geolocation) { setError("Location sharing is not available in this browser."); return; }
    navigator.geolocation.getCurrentPosition((position) => {
      update("lat", String(position.coords.latitude));
      update("lng", String(position.coords.longitude));
      setNotice("Device coordinates added. Confirm the address or Maps reference before saving.");
    }, () => setError("We could not get your location. Enter coordinates manually or try again."), { enableHighAccuracy: true, timeout: 12000 });
  };

  const refreshListing = async () => {
    if (!listing?.id) return;
    const response = await apiFetch<unknown>(`/api/v1/listings/${encodeURIComponent(listing.id)}`);
    setListing(unwrapData<Listing>(response));
  };

  const addMedia = async (file: File, kind: "photo" | "video"): Promise<boolean> => {
    if (!listing?.id) { setError("Save the home details before uploading media."); return false; }
    const photoCount = listing.photos?.length ?? 0;
    if (kind === "photo") {
      if (!(new Set(["image/jpeg", "image/png", "image/webp"])).has(file.type)) { setError("Choose a JPEG, PNG, or WebP image."); return false; }
      if (file.size > MAX_PHOTO_BYTES) { setError("Photos must be 15 MB or smaller."); return false; }
      if (photoCount >= MAX_PHOTOS) { setError("A home can have up to five photos."); return false; }
    } else {
      if (!(new Set(["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"])).has(file.type)) { setError("Choose an MP4, MOV, AVI, or WebM video."); return false; }
      if (file.size > MAX_VIDEO_BYTES) { setError("Videos must be 100 MB or smaller."); return false; }
      if (listing.video?.mediaId) { setError("This home already has a video. Remove it before adding another."); return false; }
    }
    setUploading(kind);
    setMediaProgress({ kind, stage: "uploading", percent: 0 });
    setError("");
    setNotice("Uploading file. It will be attached only after media processing completes.");
    try {
      const uploaded = await uploadListingMedia(
        file,
        kind === "photo" ? "LISTING_PHOTO" : "LISTING_VIDEO",
        listing.id,
        (percent) => setMediaProgress({ kind, stage: "uploading", percent }),
      );
      setMediaProgress({ kind, stage: "processing", percent: 100 });
      if (uploaded.status !== "READY") {
        await waitForMediaReady(uploaded.mediaId, {
          ...(kind === "photo" && uploaded.completionPayload ? { completionPayload: uploaded.completionPayload } : {}),
          webhookOnly: kind === "video",
        });
      }
      setMediaProgress({ kind, stage: "attaching", percent: 100 });
      await apiFetch(`/api/v1/listings/${encodeURIComponent(listing.id)}/${kind === "photo" ? "photos/media" : "video"}`, { method: "POST", body: JSON.stringify({ mediaId: uploaded.mediaId }) });
      await refreshListing();
      setMediaProgress({ kind, stage: "complete", percent: 100 });
      setNotice(kind === "photo" ? "Photo uploaded and attached." : "Video uploaded and attached.");
      return true;
    } catch (uploadError) {
      if (uploadError instanceof ApiError && uploadError.status === 409) {
        await refreshListing().catch(() => undefined);
        setError("The listing media changed or reached its limit. We refreshed the attached media; check it before trying again.");
      } else setError(uploadError instanceof Error ? uploadError.message : "We could not upload this file. Your listing draft is preserved.");
      setMediaProgress((current) => current ? { ...current, failed: true } : current);
      setNotice("");
      return false;
    } finally { setUploading(null); }
  };

  const removePhoto = async (photo: Photo) => {
    const photoId = typeof photo === "string" ? photo : photo.id ?? photo.mediaId;
    if (!listing?.id || !photoId) return;
    setSaving(true);
    try { await apiFetch(`/api/v1/listings/${encodeURIComponent(listing.id)}/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" }); await refreshListing(); }
    catch { setError("We could not remove this photo. Refresh the listing and try again."); }
    finally { setSaving(false); }
  };

  const removeVideo = async () => {
    if (!listing?.id) return;
    setSaving(true);
    try { await apiFetch(`/api/v1/listings/${encodeURIComponent(listing.id)}/video`, { method: "DELETE" }); await refreshListing(); }
    catch { setError("We could not remove this video. Refresh the listing and try again."); }
    finally { setSaving(false); }
  };

  const submitForReview = async (event: FormEvent) => {
    event.preventDefault();
    if (!listing?.id) { setError("Save this home before submitting it."); return; }
    if (!form.address.trim() && !form.locationReference.trim()) { setError("Add a street address or Maps reference before submission."); setStep(2); return; }
    if (!(listing.photos?.length || listing.video?.mediaId)) { setError("Attach at least one photo or one video before submission."); setStep(3); return; }
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/v1/listings/${encodeURIComponent(listing.id)}/submit`, { method: "POST" });
      const refreshed = await apiFetch<unknown>(`/api/v1/listings/${encodeURIComponent(listing.id)}`).then((response) => unwrapData<Listing>(response)).catch(() => null);
      if (refreshed) setListing(refreshed);
      else setListing((current) => current ? { ...current, status: "SUBMITTED" } : current);
      if (draftKey) removeDraft(draftKey);
      clearClientCache("/api/v1/listings/my");
      setReviewing(false);
      setStep(4);
      setNotice("Home submitted. Its status will remain pending until the review API reports a decision.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We could not submit this home. Refresh its status and try again.");
    } finally { setSaving(false); }
  };

  const status = String(listing?.status ?? "DRAFT").toUpperCase();
  const pendingReview = ["SUBMITTED", "UNDER_REVIEW"].includes(status);
  const mapUrl = form.lat && form.lng ? `https://www.google.com/maps?q=${encodeURIComponent(`${form.lat},${form.lng}`)}&output=embed` : "";
  return <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
    <DashboardNav onCreatePage={providerHome} pageStatus={pageStatus} />
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
      <Link href="/page" className="text-sm font-medium text-safecrib-green hover:underline">Back to provider workspace</Link>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-safecrib-green">Home listing</p><h1 className="mt-2 text-3xl font-medium text-safecrib-black">{pendingReview ? "Home under review" : listing?.status === "VERIFIED" ? "Verified home" : listing?.id ? "Update your home" : "Create a home"}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-black/60">Save the home first, attach media, then review everything before sending it to SafeCrib.</p></div>{listing && <span className="border border-black/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-black/55">{statusName(listing.status)}</span>}</div>

      {restored && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-safecrib-green/20 bg-[#EAF7F1] px-4 py-3 text-sm text-safecrib-green"><span>Draft restored. Your progress is saved on this device.</span><button type="button" onClick={() => { if (draftKey) removeDraft(draftKey); setForm(emptyForm); setListing(null); setStep(1); setRestored(false); }} className="font-medium underline">Discard draft</button></div>}
      {error && <p className="mt-5 border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700" role="alert">{error}</p>}
      {notice && <p className="mt-5 border border-safecrib-green/20 bg-[#EAF7F1] p-4 text-sm leading-6 text-safecrib-green" role="status">{notice}</p>}
      {mediaProgress && <section className="mt-5 border border-black/10 bg-white p-5 shadow-[0_12px_32px_rgba(11,12,14,0.05)]" aria-label={`${mediaProgress.kind === "video" ? "Video" : "Photo"} upload progress`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-safecrib-green">{mediaProgress.kind === "video" ? "Video upload" : "Photo upload"}</p><h2 className="mt-1 text-lg font-medium text-safecrib-black">{mediaProgress.failed ? "Upload needs attention" : mediaProgress.stage === "complete" ? "Upload complete" : mediaProgress.stage === "uploading" ? "Sending your file" : mediaProgress.stage === "processing" ? "Processing your media" : "Attaching to your home"}</h2></div>
          <span className={`text-sm font-semibold ${mediaProgress.failed ? "text-red-700" : "text-safecrib-green"}`}>{mediaProgress.failed ? "Paused" : mediaProgress.stage === "uploading" ? `${mediaProgress.percent}%` : mediaProgress.stage === "complete" ? "Done" : "In progress"}</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden bg-black/5" role="progressbar" aria-label={mediaProgress.stage === "uploading" ? "File transfer progress" : "Media processing progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={mediaProgress.stage === "uploading" ? mediaProgress.percent : undefined}>
          <div className={`h-full bg-safecrib-green transition-[width] duration-300 ${mediaProgress.stage === "processing" && !mediaProgress.failed ? "w-full animate-pulse opacity-60" : ""}`} style={mediaProgress.stage === "processing" && !mediaProgress.failed ? undefined : { width: `${mediaProgress.stage === "uploading" ? mediaProgress.percent : 100}%` }} />
        </div>
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {([
            ["uploading", "Upload file", "Transfer to secure storage"],
            ["processing", "Process media", mediaProgress.kind === "video" ? "Cloudinary prepares the video" : "Verify the uploaded photo"],
            ["attaching", "Attach to home", "Add it to your listing"],
          ] as const).map(([stage, title, description], index) => {
            const currentIndex = mediaProgress.stage === "complete" ? 3 : ["uploading", "processing", "attaching"].indexOf(mediaProgress.stage);
            const complete = currentIndex > index;
            const active = currentIndex === index;
            return <li key={stage} className={`flex gap-3 text-sm ${active ? "text-safecrib-green" : complete ? "text-black/65" : "text-black/40"}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${complete ? "border-safecrib-green bg-safecrib-green text-white" : active ? "border-safecrib-green" : "border-black/20"}`} aria-hidden="true">{complete ? "✓" : index + 1}</span>
              <span><span className="block font-medium">{title}</span><span className="mt-0.5 block text-xs leading-5 text-black/50">{description}</span></span>
            </li>;
          })}
        </ol>
        <p className="mt-4 text-xs leading-5 text-black/50" role="status">
          {mediaProgress.failed
            ? "Your home draft is preserved. Check the message above before retrying."
            : mediaProgress.stage === "uploading"
              ? `File transfer ${mediaProgress.percent}% complete. Keep this page open until the upload finishes.`
              : mediaProgress.stage === "processing"
                ? mediaProgress.kind === "video" ? "The file is uploaded. Cloudinary is processing it; larger videos can take a few minutes." : "The file is uploaded. SafeCrib is verifying it."
                : mediaProgress.stage === "attaching"
                  ? "Media is ready. Saving it to your home listing."
                  : "Your media is attached to this home."}
        </p>
      </section>}

      {pendingReview ? <div className="mt-7 border border-black/10 bg-white p-6"><p className="text-sm font-medium">Status: {statusName(listing?.status)}</p><p className="mt-2 text-sm leading-6 text-black/60">This home is awaiting review. Editing and resubmission are disabled until the API reports a new status.</p><Link href="/page" className="mt-5 inline-block text-sm font-medium text-safecrib-green hover:underline">Return to homes</Link></div> : !isEditable ? <div className="mt-7 border border-black/10 bg-white p-6"><p className="text-sm font-medium">This home is {statusName(listing?.status).toLowerCase()}.</p><p className="mt-2 text-sm leading-6 text-black/60">The current service does not define an edit transition for this status.</p><Link href="/page" className="mt-5 inline-block text-sm font-medium text-safecrib-green hover:underline">Return to homes</Link></div> : <>
        {!reviewing && <div className="mt-8"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-safecrib-green">Step {step} of 3</p><span className="text-xs text-black/45">{Math.round((step / 3) * 100)}%</span></div><div className="mt-3 h-2 overflow-hidden bg-black/5"><div className="h-full bg-safecrib-green transition-[width] duration-300" style={{ width: `${(step / 3) * 100}%` }} /></div><div className="mt-4 grid grid-cols-3 gap-2 text-xs text-black/45"><span className={step === 1 ? "font-semibold text-safecrib-green" : ""}>Details</span><span className={step === 2 ? "font-semibold text-safecrib-green" : ""}>Location</span><span className={step === 3 ? "font-semibold text-safecrib-green" : ""}>Media and review</span></div></div>}

        {reviewing ? <div className="mt-7 border border-black/10 bg-white p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.15em] text-safecrib-green">Final review</p><h2 className="mt-2 text-xl font-medium">{form.title}</h2></div><button type="button" onClick={() => setReviewing(false)} aria-label="Close review" className="border border-black/15 px-3 py-2 text-sm">Close</button></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-black/65">{form.description || "No description provided."}</p><p className="mt-4 font-medium">Base price ₦{Number(form.price || 0).toLocaleString()}{Number(form.discountAmount) > 0 ? ` · discounted ₦${(Number(form.price) - Number(form.discountAmount)).toLocaleString()}` : ""}</p><p className="mt-2 text-sm text-black/55">{form.address || form.locationReference}</p>{mapUrl && <iframe title="Home map preview" src={mapUrl} loading="lazy" className="mt-5 h-56 w-full border-0" referrerPolicy="no-referrer-when-downgrade" />}<div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{(listing?.photos ?? []).map((photo, index) => { const reference = typeof photo === "string" ? { url: photo } : photo; return <ListingMediaImage key={reference.id ?? reference.mediaId ?? reference.url ?? index} mediaId={reference.mediaId} url={reference.url} alt={`Home photo ${index + 1}`} className="aspect-[4/3] w-full object-cover" />; })}</div>{listing?.video?.mediaId && <ListingMediaVideo mediaId={listing.video.mediaId} className="mt-5 max-h-96 w-full bg-black" />}<p className="mt-4 text-sm text-black/60">{listing?.photos?.length ?? 0} attached photos{listing?.video ? " · 1 attached video" : " · no video attached"}</p><form onSubmit={submitForReview} className="mt-6 flex flex-wrap gap-3 border-t border-black/10 pt-5"><Button type="submit" loading={saving}>Submit home for review</Button><Button type="button" variant="secondary" onClick={() => setReviewing(false)}>Keep editing</Button></form><p className="mt-3 text-xs leading-5 text-black/45">Submission requires an address or Maps reference and at least one attached photo or video.</p></div> : <div className="mt-6 border border-black/10 bg-white p-5 sm:p-6">
          {step === 1 && <div className="grid gap-5"><label className="block text-sm font-medium">Home title *<input value={form.title} maxLength={200} onChange={(event) => update("title", event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" placeholder="Cozy room near campus" /></label><label className="block text-sm font-medium">Description<textarea value={form.description} maxLength={2000} rows={5} onChange={(event) => update("description", event.target.value)} className="mt-2 w-full resize-y border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" placeholder="Describe the home, amenities, and nearby places" /><span className="mt-1 block text-right text-xs font-normal text-black/45">{form.description.length}/2,000</span></label><div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Base price *<input type="number" min="1" step="1" inputMode="numeric" value={form.price} onChange={(event) => update("price", event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" placeholder="50000" /><span className="mt-1 block text-xs font-normal text-black/45">Amount in the configured currency unit.</span></label><label className="block text-sm font-medium">Discount amount<input type="number" min="0" step="1" inputMode="numeric" value={form.discountAmount} onChange={(event) => update("discountAmount", event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" placeholder="Optional" /></label></div><label className="block text-sm font-medium">Campus<input maxLength={200} value={form.campus} onChange={(event) => update("campus", event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" placeholder="University or nearby campus" /></label></div>}

          {step === 2 && <div className="grid gap-5"><div><h2 className="text-lg font-medium">Set the home location</h2><p className="mt-2 text-sm leading-6 text-black/55">Coordinates are required. Add a street address or Maps reference so students can identify the location.</p></div><label className="block text-sm font-medium">Street address<input maxLength={500} value={form.address} onChange={(event) => update("address", event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" placeholder="123 Campus Road, Abuja" /></label><label className="block text-sm font-medium">Google Maps URL, Place ID, or Plus Code<input maxLength={500} value={form.locationReference} onChange={(event) => update("locationReference", event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" placeholder="Paste a Maps link, Place ID, or Plus Code" /></label><Button type="button" variant="secondary" onClick={locate}>Share accommodation location</Button><div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Latitude *<input inputMode="decimal" type="number" step="any" value={form.lat} onChange={(event) => update("lat", event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" placeholder="9.0765" /></label><label className="block text-sm font-medium">Longitude *<input inputMode="decimal" type="number" step="any" value={form.lng} onChange={(event) => update("lng", event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" placeholder="7.3986" /></label></div>{mapUrl && <iframe title="Location preview" src={mapUrl} loading="lazy" className="h-56 w-full border-0" referrerPolicy="no-referrer-when-downgrade" />}</div>}

          {step === 3 && <div><div><h2 className="text-lg font-medium">Home photos and video</h2><p className="mt-2 text-sm leading-6 text-black/55">Attach up to five photos and one optional video. Uploaded files are not counted until the listing confirms attachment.</p></div><div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-black/10 py-4"><p className="text-sm text-black/60">{listing?.photos?.length ?? 0}/{MAX_PHOTOS} photos · {listing?.video ? "1 video attached" : "No video attached"}</p><button type="button" onClick={() => void refreshListing().catch(() => setError("We could not refresh attached media."))} className="text-sm font-medium text-safecrib-green hover:underline">Refresh media</button></div><div className="mt-5 grid gap-5 sm:grid-cols-2"><label className={`flex min-h-36 cursor-pointer flex-col justify-center border border-dashed border-black/20 p-5 text-center hover:border-safecrib-green ${(uploading || (listing?.photos?.length ?? 0) >= MAX_PHOTOS) ? "pointer-events-none opacity-50" : ""}`}><span className="text-2xl text-safecrib-green">↑</span><span className="mt-2 text-sm font-medium">{uploading === "photo" ? "Uploading photo..." : "Add photos"}</span><span className="mt-1 text-xs text-black/50">JPEG, PNG, WebP · up to 15 MB each</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={Boolean(uploading) || (listing?.photos?.length ?? 0) >= MAX_PHOTOS} onChange={(event) => { const files = Array.from(event.target.files ?? []).slice(0, Math.max(0, MAX_PHOTOS - (listing?.photos?.length ?? 0))); event.target.value = ""; void (async () => { for (const file of files) if (!await addMedia(file, "photo")) break; })(); }} className="sr-only" /></label><label className={`flex min-h-36 cursor-pointer flex-col justify-center border border-dashed border-black/20 p-5 text-center hover:border-safecrib-green ${(uploading || Boolean(listing?.video?.mediaId)) ? "pointer-events-none opacity-50" : ""}`}><span className="text-2xl text-safecrib-green">↑</span><span className="mt-2 text-sm font-medium">{uploading === "video" ? "Uploading video..." : listing?.video ? "Video attached" : "Add one video"}</span><span className="mt-1 text-xs text-black/50">MP4, MOV, AVI, WebM · up to 100 MB</span><input type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/webm" disabled={Boolean(uploading) || Boolean(listing?.video?.mediaId)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void addMedia(file, "video"); }} className="sr-only" /></label></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{(listing?.photos ?? []).map((photo, index) => { const reference = typeof photo === "string" ? { url: photo } : photo; const id = reference.id ?? reference.mediaId; return <div key={id ?? index} className="relative"><ListingMediaImage mediaId={reference.mediaId} url={reference.url} alt={`Attached home photo ${index + 1}`} className="aspect-[4/3] w-full object-cover" />{id && <button type="button" disabled={saving || Boolean(uploading)} onClick={() => void removePhoto(photo)} className="absolute right-2 top-2 bg-white px-2 py-1 text-xs font-medium text-red-700 shadow">Remove</button>}</div>; })}</div>{listing?.video?.mediaId && <div className="mt-4 border border-black/10 p-3"><ListingMediaVideo mediaId={listing.video.mediaId} className="max-h-96 w-full bg-black" /><div className="mt-3 flex items-center justify-between text-sm"><span>Video attached</span><button type="button" disabled={saving || Boolean(uploading)} onClick={() => void removeVideo()} className="font-medium text-red-700 hover:underline">Remove video</button></div></div>}</div>}

          <div className="mt-7 flex flex-wrap justify-between gap-3 border-t border-black/10 pt-5"><div>{step > 1 && <Button type="button" variant="secondary" onClick={() => setStep((current) => current - 1)}>Back</Button>}</div>{step < 3 ? <Button type="button" loading={saving} onClick={() => void next()}>{step === 2 ? "Save and continue" : "Continue"}</Button> : <Button type="button" disabled={Boolean(uploading)} onClick={() => { setError(""); setReviewing(true); }}>Review home</Button>}</div>
          {step === 3 && <p className="mt-4 text-xs leading-5 text-black/45">You can save this draft without submitting. Home review requires a location reference and at least one attached photo or video.</p>}
        </div>}
      </>}
    </section>
  </main>;
}