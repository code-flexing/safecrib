"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { Button } from "@/components/ui/Button";
import { apiFetch, ApiError, cancelPendingUpload, clearClientCache, completeMediaUpload, getPendingUploads, normalizeAccountStatus, normalizePageStatus, resolveMediaUrl, unwrapData, uploadSignedMedia, type AccountStatus, type CloudinaryCompletionPayload, type PageStatus, type PendingUpload } from "@/lib/api";
import { readDraft, removeDraft, writeDraft } from "@/lib/drafts";

type PayoutAccountForm = { provider: string; accountName: string; accountNumber: string };
type FormState = {
  displayName: string;
  description: string;
  phone: string;
  proofOfLicense: string;
  profilePicture: string;
  providerType: "AGENT" | "LANDLORD";
  businessName: string;
  businessAddress: string;
  additionalContactNumbers: string;
  linkedin: string;
  website: string;
  provider: string;
  accountName: string;
  accountNumber: string;
};
type ProviderPage = Partial<FormState> & {
  id?: string;
  status?: string;
  verificationNotes?: string;
  rejectionReason?: string;
  reason?: string;
  socialLinks?: Record<string, string>;
  additionalContactNumbers?: string[];
  payoutAccounts?: { provider?: string; accountName?: string; accountNumber?: string } | { provider?: string; accountName?: string; accountNumber?: string }[];
} | null;
type User = { id?: string; email?: string; role?: string; displayName?: unknown };
type MediaProcessing = { license: boolean; picture: boolean };
type ProviderMediaKind = "license" | "picture";
type SavedCompletion = { mediaId: string; payload: CloudinaryCompletionPayload; expectedPublicId?: string; expectedResourceType?: string };
type ProviderDraft = { form: FormState; step: number; additionalPayoutAccounts?: PayoutAccountForm[]; profilePicturePreview?: string; mediaCompletion?: Partial<Record<ProviderMediaKind, SavedCompletion>> };
const emptyPayoutAccount: PayoutAccountForm = { provider: "", accountName: "", accountNumber: "" };

const emptyForm: FormState = {
  displayName: "", description: "", phone: "", proofOfLicense: "", profilePicture: "", providerType: "AGENT",
  businessName: "", businessAddress: "", additionalContactNumbers: "", linkedin: "", website: "",
  provider: "", accountName: "", accountNumber: "",
};

function providerDraftKey(user: User) {
  return `safecrib:draft:provider-page:v1:${user.id ?? user.email ?? "current"}`;
}

function pageToForm(page: ProviderPage): FormState {
  if (!page) return emptyForm;
  const payout = Array.isArray(page.payoutAccounts) ? page.payoutAccounts[0] : page.payoutAccounts;
  return {
    ...emptyForm,
    ...page,
    providerType: page.providerType === "LANDLORD" ? "LANDLORD" : "AGENT",
    provider: payout?.provider ?? "",
    accountName: payout?.accountName ?? "",
    accountNumber: payout?.accountNumber ?? "",
    linkedin: page.socialLinks?.linkedin ?? "",
    website: page.socialLinks?.website ?? "",
    additionalContactNumbers: page.additionalContactNumbers?.join(", ") ?? "",
  };
}

function pageToPayoutAccounts(page: ProviderPage): PayoutAccountForm[] {
  if (!page?.payoutAccounts) return [];
  const payouts = Array.isArray(page.payoutAccounts) ? page.payoutAccounts : [page.payoutAccounts];
  return payouts.slice(1).map((payout) => ({
    provider: payout.provider ?? "",
    accountName: payout.accountName ?? "",
    accountNumber: payout.accountNumber ?? "",
  }));
}

export default function NewProviderPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [additionalPayoutAccounts, setAdditionalPayoutAccounts] = useState<PayoutAccountForm[]>([]);
  const [step, setStep] = useState(1);
  const [status, setStatus] = useState("NONE");
  const [pageStatus, setPageStatus] = useState<PageStatus>("none");
  const [studentStatus, setStudentStatus] = useState<AccountStatus>("not_submitted");
  const [rejectionNotes, setRejectionNotes] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [restored, setRestored] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checkingMedia, setCheckingMedia] = useState(false);
  const [uploading, setUploading] = useState<"license" | "picture" | null>(null);
  const [mediaProcessing, setMediaProcessing] = useState<MediaProcessing>({ license: false, picture: false });
  const [mediaCompletion, setMediaCompletion] = useState<Partial<Record<ProviderMediaKind, SavedCompletion>>>({});
  const [existingUploads, setExistingUploads] = useState<PendingUpload[]>([]);
  const [profilePicturePreview, setProfilePicturePreview] = useState("");
  const [confirmProviderConversion, setConfirmProviderConversion] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const licenseFileInput = useRef<HTMLInputElement>(null);
  const pictureFileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!localStorage.getItem("safecrib_access_token")) { router.replace("/login"); return; }
    void Promise.all([
      apiFetch<unknown>("/api/v1/auth/me", { method: "POST" }).then((response) => unwrapData<User>(response)),
      apiFetch<unknown>("/api/v1/provider-pages/me").then((response) => unwrapData<ProviderPage>(response)).catch((loadError: unknown) => {
        if (loadError instanceof ApiError && loadError.status === 404) return null;
        throw loadError;
      }),
      getPendingUploads().catch(() => []),
    ]).then(async ([user, providerPage, pendingUploads]) => {
      setUser(user);
      const role = String(user.role ?? "").toUpperCase();
      if (role === "STUDENT") {
        const profileStatus = await apiFetch<unknown>("/api/v1/student-profiles/status").then(unwrapData<unknown>);
        const accountStatus = normalizeAccountStatus(profileStatus);
        setStudentStatus(accountStatus);
        if (accountStatus === "pending") { router.replace("/page"); return; }
        if (accountStatus === "approved") { router.replace("/dashboard"); return; }
      }
      const rawStatus = String(providerPage?.status ?? "NONE").toUpperCase();
      setStatus(rawStatus);
      setPageStatus(normalizePageStatus(rawStatus));
      setRejectionNotes(providerPage?.verificationNotes ?? providerPage?.rejectionReason ?? providerPage?.reason ?? "");
      if (["SUBMITTED", "UNDER_REVIEW", "VERIFIED"].includes(rawStatus)) { router.replace("/page"); return; }
      const key = providerDraftKey(user);
      setDraftKey(key);
      const draft = readDraft<ProviderDraft>(key);
      setProfilePicturePreview(draft?.profilePicturePreview?.startsWith("https://") ? draft.profilePicturePreview : "");
      setMediaCompletion(draft?.mediaCompletion ?? {});
      const restoredForm = { ...pageToForm(providerPage), ...(draft?.form ?? {}) };
      const matchingUploads = pendingUploads.filter((upload) => ["AVATAR", "PROOF_OF_LICENSE"].includes(String(upload.purpose ?? "").toUpperCase()));
      const newestReadyUpload = (purpose: string) => matchingUploads
        .filter((upload) => String(upload.purpose ?? "").toUpperCase() === purpose && String(upload.status ?? "").toUpperCase() === "READY")
        .sort((first, second) => (second.createdAt ?? "").localeCompare(first.createdAt ?? ""))[0];
      const readyLicense = newestReadyUpload("PROOF_OF_LICENSE");
      const readyPicture = newestReadyUpload("AVATAR");
      const resolvedForm = {
        ...restoredForm,
        proofOfLicense: restoredForm.proofOfLicense || readyLicense?.id || "",
        profilePicture: restoredForm.profilePicture || readyPicture?.id || "",
      };
      const restoredPayoutAccounts = draft?.additionalPayoutAccounts ?? pageToPayoutAccounts(providerPage);
      const restoredStep = draft?.step ?? 1;
      setForm(resolvedForm);
      setAdditionalPayoutAccounts(restoredPayoutAccounts);
      if (resolvedForm.proofOfLicense !== restoredForm.proofOfLicense || resolvedForm.profilePicture !== restoredForm.profilePicture) {
        writeDraft<ProviderDraft>(key, { form: resolvedForm, step: restoredStep, additionalPayoutAccounts: restoredPayoutAccounts, profilePicturePreview: draft?.profilePicturePreview, mediaCompletion: draft?.mediaCompletion });
      }
      const readyMediaIds = [resolvedForm.proofOfLicense, resolvedForm.profilePicture];
      const availableUploads = matchingUploads.filter((upload) => !readyMediaIds.includes(upload.id));
      setExistingUploads(availableUploads);
      const pendingStatus = (id: string) => {
        const media = pendingUploads.find((upload) => upload.id === id);
        return Boolean(id && media && String(media.status ?? "").toUpperCase() !== "READY");
      };
      setMediaProcessing({
        license: pendingStatus(resolvedForm.proofOfLicense),
        picture: pendingStatus(resolvedForm.profilePicture),
      });
      setStep(restoredStep);
      setRestored(Boolean(draft && !providerPage));
    }).catch((loadError: unknown) => {
      if (loadError instanceof ApiError && loadError.status === 401) router.replace("/login?reason=session-expired");
      else setError(loadError instanceof Error ? loadError.message : "We could not load provider setup.");
    });
  }, [router]);

  useEffect(() => {
    if (!draftKey) return;
    const timeout = window.setTimeout(() => writeDraft<ProviderDraft>(draftKey, { form, step, additionalPayoutAccounts, profilePicturePreview: profilePicturePreview.startsWith("https://") ? profilePicturePreview : undefined, mediaCompletion }), 400);
    return () => window.clearTimeout(timeout);
  }, [additionalPayoutAccounts, draftKey, form, mediaCompletion, profilePicturePreview, step]);

  useEffect(() => {
    if (!form.profilePicture) {
      setProfilePicturePreview("");
      return;
    }
    let active = true;
    void resolveMediaUrl(form.profilePicture).then((url) => {
      if (active && url) setProfilePicturePreview(url);
    });
    return () => { active = false; };
  }, [form.profilePicture, mediaProcessing.picture]);

  useEffect(() => {
    if (!profilePicturePreview.startsWith("blob:")) return;
    const previewUrl = profilePicturePreview;
    return () => URL.revokeObjectURL(previewUrl);
  }, [profilePicturePreview]);

  const update = (field: keyof FormState, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const updateAdditionalPayout = (index: number, field: keyof PayoutAccountForm, value: string) => setAdditionalPayoutAccounts((current) => current.map((account, accountIndex) => accountIndex === index ? { ...account, [field]: value } : account));
  const goToWorkspace = () => router.push("/page");

  const selectExistingUpload = async (upload: PendingUpload) => {
    const isPicture = String(upload.purpose ?? "").toUpperCase() === "AVATAR";
    const field = isPicture ? "profilePicture" : "proofOfLicense";
    const processingField = isPicture ? "picture" : "license";
    const existingId = form[field];
    if (existingId && existingId !== upload.id) {
      if (!window.confirm("An upload is already attached to this draft. Replace it with the existing upload you selected?")) return;
      try {
        const pending = await getPendingUploads().catch(() => []);
        const previous = pending.find((item) => item.id === existingId);
        if (previous && String(previous.status ?? "").toUpperCase() !== "READY") await cancelPendingUpload(existingId);
      } catch (cancelError) {
        setError(cancelError instanceof Error ? cancelError.message : "We could not replace the existing upload.");
        return;
      }
    }
    const nextForm = { ...form, [field]: upload.id };
    const nextCompletion = { ...mediaCompletion };
    delete nextCompletion[processingField];
    setForm(nextForm);
    setMediaCompletion(nextCompletion);
    setMediaProcessing((current) => ({ ...current, [processingField]: String(upload.status ?? "").toUpperCase() !== "READY" }));
    if (isPicture) setProfilePicturePreview("");
    setExistingUploads((current) => current.filter((item) => item.id !== upload.id));
    if (draftKey) writeDraft<ProviderDraft>(draftKey, { form: nextForm, step, additionalPayoutAccounts, profilePicturePreview: isPicture ? undefined : profilePicturePreview, mediaCompletion: nextCompletion });
    setError("");
    setNotice(String(upload.status ?? "").toUpperCase() === "READY" ? "Existing upload added to your draft." : "Existing upload saved to your draft. You do not need to upload it again.");
  };

  const discardExistingUpload = async (upload: PendingUpload) => {
    try {
      await cancelPendingUpload(upload.id);
      setExistingUploads((current) => current.filter((item) => item.id !== upload.id));
      setError("");
      setNotice("");
    } catch (discardError) {
      setError(discardError instanceof Error ? discardError.message : "We could not cancel that pending upload.");
    }
  };

  const checkMediaStatus = async () => {
    setCheckingMedia(true);
    setError("");
    try {
      let completionFailure = "";
      const retryCompletion = async (kind: ProviderMediaKind, mediaId: string) => {
        const saved = mediaCompletion[kind];
        if (!saved || saved.mediaId !== mediaId) return false;
        const publicIdMatches = !saved.expectedPublicId || saved.expectedPublicId === saved.payload.public_id;
        const resourceTypeMatches = !saved.expectedResourceType || saved.expectedResourceType === saved.payload.resource_type.toLowerCase();
        const comparison = `Client comparison: public_id ${publicIdMatches ? "matches" : "differs"}, resource_type ${resourceTypeMatches ? "matches" : "differs"}.`;
        if (!publicIdMatches || !resourceTypeMatches) {
          completionFailure = `The Cloudinary result differs from the signed upload. ${comparison}`;
          return false;
        }
        try {
          await completeMediaUpload(mediaId, saved.payload);
          return true;
        } catch (completionError) {
          const reason = completionError instanceof Error ? completionError.message : "SafeCrib rejected the media completion request.";
          completionFailure = `${reason} ${comparison}`;
          return false;
        }
      };
      const [licenseCompleted, pictureCompleted] = await Promise.all([
        retryCompletion("license", form.proofOfLicense),
        retryCompletion("picture", form.profilePicture),
      ]);
      const pending = await getPendingUploads();
      const isReady = async (mediaId: string, completionSucceeded: boolean) => {
        if (!mediaId) return false;
        if (completionSucceeded) return true;
        const item = pending.find((upload) => upload.id === mediaId);
        if (item) return String(item.status ?? "").toUpperCase() === "READY";
        const access = unwrapData<unknown>(await apiFetch<unknown>(`/api/v1/media/${encodeURIComponent(mediaId)}/access`).catch(() => null));
        return typeof access === "string" || (typeof access === "object" && access !== null && ["url", "accessUrl", "deliveryUrl"].some((key) => typeof (access as Record<string, unknown>)[key] === "string"));
      };
      const [licenseReady, pictureReady] = await Promise.all([isReady(form.proofOfLicense, licenseCompleted), isReady(form.profilePicture, pictureCompleted)]);
      const nextProcessing = { license: Boolean(form.proofOfLicense) && !licenseReady, picture: Boolean(form.profilePicture) && !pictureReady };
      setMediaProcessing(nextProcessing);
      const nextCompletion = { ...mediaCompletion };
      if (licenseReady) delete nextCompletion.license;
      if (pictureReady) delete nextCompletion.picture;
      setMediaCompletion(nextCompletion);
      setNotice(nextProcessing.license || nextProcessing.picture
        ? "Your upload succeeded and is saved. SafeCrib could not confirm it yet; you do not need to upload it again."
        : "Your license proof and profile picture are ready.");
      if (completionFailure) setError(`Cloudinary accepted the upload, but SafeCrib rejected its completion: ${completionFailure}`);
      return !nextProcessing.license && !nextProcessing.picture;
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "We could not check upload status. Your saved uploads are unchanged.");
      return false;
    } finally {
      setCheckingMedia(false);
    }
  };

  const upload = async (file: File, kind: "license" | "picture") => {
    const field = kind === "license" ? "proofOfLicense" : "profilePicture";
    const purpose = kind === "license" ? "PROOF_OF_LICENSE" : "AVATAR";
    const existingId = form[field];
    if (existingId) {
      const confirmed = window.confirm("An upload is already saved in this draft. Replace it? A pending upload will be canceled first.");
      if (!confirmed) return;
      try {
        const pending = await getPendingUploads().catch(() => []);
        const previous = pending.find((item) => item.id === existingId);
        if (previous && String(previous.status ?? "").toUpperCase() !== "READY") {
          await cancelPendingUpload(existingId);
          const clearedForm = { ...form, [field]: "" };
          const nextCompletion = { ...mediaCompletion };
          delete nextCompletion[kind];
          setForm(clearedForm);
          setMediaCompletion(nextCompletion);
          if (kind === "picture") setProfilePicturePreview("");
          setMediaProcessing((current) => ({ ...current, [kind]: false }));
          if (draftKey) writeDraft<ProviderDraft>(draftKey, { form: clearedForm, step, additionalPayoutAccounts, profilePicturePreview: kind === "picture" ? undefined : profilePicturePreview, mediaCompletion: nextCompletion });
        }
      } catch (cancelError) {
        setError(cancelError instanceof Error ? cancelError.message : "We could not replace the existing upload.");
        return;
      }
    }
    setUploading(kind);
    setError("");
    setNotice("");
    try {
      const uploaded = await uploadSignedMedia(file, purpose);
      const nextForm = { ...form, [field]: uploaded.mediaId };
      const isProcessing = uploaded.status !== "READY";
      const nextMediaProcessing = { ...mediaProcessing, [kind]: isProcessing };
      const nextCompletion = { ...mediaCompletion };
      if (uploaded.completionPayload) nextCompletion[kind] = {
        mediaId: uploaded.mediaId,
        payload: uploaded.completionPayload,
        expectedPublicId: uploaded.expectedPublicId,
        expectedResourceType: uploaded.expectedResourceType,
      };
      else delete nextCompletion[kind];
      setForm(nextForm);
      setMediaProcessing(nextMediaProcessing);
      setMediaCompletion(nextCompletion);
      setExistingUploads((current) => current.filter((item) => item.id !== uploaded.mediaId));
      if (kind === "picture") setProfilePicturePreview(uploaded.previewUrl ?? URL.createObjectURL(file));
      setNotice(isProcessing
        ? `${kind === "picture" ? "Profile picture" : "License document"} uploaded successfully and saved. SafeCrib could not confirm it yet; you do not need to upload it again.`
        : `${kind === "picture" ? "Profile picture" : "License document"} uploaded successfully and saved to your draft.`);
      if (uploaded.completionError) setError(`Cloudinary accepted the upload, but SafeCrib could not confirm it: ${uploaded.completionError}`);
      if (draftKey) writeDraft<ProviderDraft>(draftKey, { form: nextForm, step, additionalPayoutAccounts, profilePicturePreview: kind === "picture" ? uploaded.previewUrl : profilePicturePreview, mediaCompletion: nextCompletion });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : `We could not upload the ${kind === "license" ? "license document" : "profile picture"}.`);
    } finally {
      setUploading(null);
    }
  };

  const validateStep = (target: number) => {
    if (target === 1 && form.displayName.trim().length < 3) return "Page display name must be at least 3 characters.";
    if (target === 2 && (!form.proofOfLicense || !form.profilePicture)) return "Upload both your license proof and a profile picture before continuing.";
    if (target === 3) {
      const accounts = [{ provider: form.provider, accountName: form.accountName, accountNumber: form.accountNumber }, ...additionalPayoutAccounts];
      if (accounts.length > 10) return "Add no more than 10 payout accounts.";
      if (accounts.some((account) => !account.provider.trim() || !account.accountName.trim())) return "Add a provider and account name for every payout account.";
      if (accounts.some((account) => !/^\d{8,20}$/.test(account.accountNumber.trim()))) return "Every payout account number must contain 8 to 20 digits.";
    }
    return "";
  };

  const next = () => {
    setError("");
    setStep((current) => Math.min(current + 1, 3));
  };

  const submit = async (confirmedConversion = false) => {
    if (studentStatus === "pending") {
      router.replace("/page");
      return;
    }
    const invalidStep = [1, 2, 3].find((target) => validateStep(target));
    if (invalidStep) {
      setError(validateStep(invalidStep));
      setStep(invalidStep);
      return;
    }
    if (["SUBMITTED", "UNDER_REVIEW", "VERIFIED"].includes(status)) { setError("This provider Page has already been submitted or approved. Refresh its status before continuing."); return; }
    if (mediaProcessing.license || mediaProcessing.picture) {
      const mediaReady = await checkMediaStatus();
      if (!mediaReady) {
        setNotice("Your uploads succeeded and are saved, but SafeCrib has not confirmed them ready yet. Stay on this step and check status again; do not upload them again.");
        return;
      }
    }
    if (String(user?.role ?? "").toUpperCase() === "STUDENT" && !confirmedConversion) {
      setConfirmProviderConversion(true);
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        displayName: form.displayName.trim(), description: form.description.trim(), phone: form.phone.trim(),
        proofOfLicense: form.proofOfLicense, profilePicture: form.profilePicture, providerType: form.providerType,
        businessName: form.businessName.trim(), businessAddress: form.businessAddress.trim(),
        additionalContactNumbers: form.additionalContactNumbers.split(",").map((number) => number.trim()).filter(Boolean),
        socialLinks: { linkedin: form.linkedin.trim(), website: form.website.trim() },
        payoutAccounts: [{ provider: form.provider.trim(), accountName: form.accountName.trim(), accountNumber: form.accountNumber.trim() }, ...additionalPayoutAccounts.map((account) => ({
          provider: account.provider.trim(), accountName: account.accountName.trim(), accountNumber: account.accountNumber.trim(),
        }))],
        ...(confirmedConversion ? { switchAccountToProvider: true } : {}),
      };
      if (status === "NONE") {
        const created = unwrapData<ProviderPage>(await apiFetch<unknown>("/api/v1/provider-pages", { method: "POST", body: JSON.stringify(payload) }));
        const nextStatus = String(created?.status ?? "DRAFT").toUpperCase();
        setStatus(nextStatus);
        setPageStatus(normalizePageStatus(nextStatus));
      } else {
        const updated = unwrapData<ProviderPage>(await apiFetch<unknown>("/api/v1/provider-pages/me", { method: "PATCH", body: JSON.stringify(payload) }));
        const nextStatus = String(updated?.status ?? "DRAFT").toUpperCase();
        setStatus(nextStatus);
        setPageStatus(normalizePageStatus(nextStatus));
      }
      await apiFetch("/api/v1/provider-pages/me/submit", { method: "POST" });
      clearClientCache("/api/v1/provider-pages/me");
      if (draftKey) removeDraft(draftKey);
      router.replace("/page");
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.status === 409) setError("Your Page status changed while you were editing. Reload the provider workspace to see the latest state.");
      else if (submitError instanceof ApiError && submitError.status === 403) setError("Your account or provider Page is not eligible for this action. Refresh your status or contact support.");
      else setError(submitError instanceof Error ? submitError.message : "We could not submit your provider Page. Your draft is still saved.");
    } finally { setSaving(false); }
  };

  const discardDraft = () => {
    if (draftKey) removeDraft(draftKey);
    setForm(pageToForm(null));
    setAdditionalPayoutAccounts([]);
    setMediaCompletion({});
    setProfilePicturePreview("");
    setMediaProcessing({ license: false, picture: false });
    setStep(1);
    setRestored(false);
    setError("");
    setNotice("");
  };

  const input = (field: keyof FormState, label: string, required = false, type = "text", maxLength?: number) => <label className="block text-sm font-medium text-safecrib-black">{label}{required ? " *" : ""}<input required={required} type={type} maxLength={maxLength} value={form[field]} onChange={(event) => update(field, event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" /></label>;

  return <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
    <DashboardNav onCreatePage={goToWorkspace} pageStatus={pageStatus} />
    <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
      <Link href="/page" className="text-sm font-medium text-safecrib-green hover:underline">Back to provider workspace</Link>
      <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-safecrib-green">Provider verification</p>
      <h1 className="mt-2 text-3xl font-medium text-safecrib-black">{status === "REJECTED" ? "Update your provider Page" : "Set up your provider Page"}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-black/60">Your Page verifies you as an agent or landlord. Home creation unlocks only after the review team approves it.</p>
      {status === "REJECTED" && <div className="mt-5 border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700"><p>Your Page was not approved. Update the information and submit it again.</p>{rejectionNotes && <p className="mt-2">Review note: {rejectionNotes}</p>}</div>}
      {restored && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-safecrib-green/20 bg-[#EAF7F1] px-4 py-3 text-sm text-safecrib-green"><span>Draft restored. Your progress is saved on this device.</span><button type="button" onClick={discardDraft} className="font-medium underline">Discard draft</button></div>}
      {error && <p className="mt-5 border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700" role="alert">{error}</p>}
      {notice && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border border-safecrib-green/20 bg-[#EAF7F1] p-4 text-sm leading-6 text-safecrib-green" role="status" aria-live="polite"><p>{notice}</p>{(mediaProcessing.license || mediaProcessing.picture) && <Button type="button" variant="secondary" loading={checkingMedia} disabled={checkingMedia} onClick={() => void checkMediaStatus()}>Check status</Button>}</div>}
      {step === 2 && existingUploads.length > 0 && <div className="mt-5 grid gap-3 border border-safecrib-green/20 bg-[#EAF7F1] p-4 text-sm text-safecrib-green" role="status">
        <div><p className="font-medium">Existing uploads found</p><p className="mt-1 leading-6">Reuse an existing upload instead of creating another and using more of your upload allowance.</p></div>
        {existingUploads.map((upload) => {
          const isPicture = String(upload.purpose ?? "").toUpperCase() === "AVATAR";
          const uploadStatus = String(upload.status ?? "PENDING").toUpperCase();
          return <div key={upload.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-safecrib-green/15 pt-3">
            <span>{isPicture ? "Profile picture" : "License proof"} · {uploadStatus} · {upload.id.slice(0, 8)}</span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => selectExistingUpload(upload)}>Use existing upload</Button>
              {uploadStatus !== "READY" && <Button type="button" variant="secondary" onClick={() => void discardExistingUpload(upload)}>Cancel pending upload</Button>}
            </div>
          </div>;
        })}
      </div>}
      <form onSubmit={(event) => event.preventDefault()} noValidate className="mt-8 border border-black/10 bg-white p-5 sm:p-7">
        <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-safecrib-green">Step {step} of 3</p><span className="text-xs text-black/45">{Math.round((step / 3) * 100)}%</span></div>
        <div className="mt-3 h-2 overflow-hidden bg-black/5"><div className="h-full bg-safecrib-green transition-[width] duration-300" style={{ width: `${(step / 3) * 100}%` }} /></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-black/45"><span className={step === 1 ? "font-semibold text-safecrib-green" : ""}>Profile</span><span className={step === 2 ? "font-semibold text-safecrib-green" : ""}>Verification</span><span className={step === 3 ? "font-semibold text-safecrib-green" : ""}>Payout and review</span></div>

        {step === 1 && <div className="mt-7 grid gap-5"><div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Provider type<select value={form.providerType} onChange={(event) => update("providerType", event.target.value as FormState["providerType"])} className="mt-2 w-full border border-black/15 bg-white px-4 py-3 font-normal"><option value="AGENT">Agent</option><option value="LANDLORD">Landlord</option></select></label>{input("displayName", "Page display name", true, "text", 120)}</div><div className="grid gap-5 sm:grid-cols-2">{input("businessName", "Business name")}{input("businessAddress", "Business address")}</div>{input("phone", "Phone number", false, "tel", 30)}{input("additionalContactNumbers", "Additional phone numbers (comma separated)")}<label className="block text-sm font-medium">Description<textarea maxLength={2000} rows={4} value={form.description} onChange={(event) => update("description", event.target.value)} className="mt-2 w-full resize-y border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" placeholder="Tell students about your accommodation service" /><span className="mt-1 block text-right text-xs font-normal text-black/45">{form.description.length}/2,000</span></label></div>}

        {step === 2 && <div className="mt-7 grid gap-5">
          <div><h2 className="text-lg font-medium">Verification documents</h2><p className="mt-2 text-sm leading-6 text-black/55">Upload a license or business proof and a profile image. Sensitive proof documents are uploaded through the media service.</p></div>
          <label className={`flex min-h-40 flex-col items-center justify-center border border-dashed border-black/20 p-5 text-center ${form.proofOfLicense ? "cursor-not-allowed bg-black/[0.02]" : "cursor-pointer hover:border-safecrib-green"} ${uploading ? "pointer-events-none opacity-60" : ""}`}>
            <span className="text-2xl text-safecrib-green">↑</span>
            <span className="mt-2 text-sm font-medium">{uploading === "license" ? "Uploading license proof..." : form.proofOfLicense ? "License proof uploaded successfully" : "Upload license proof *"}</span>
            <span className="mt-1 text-xs text-black/50">PDF, JPEG, PNG, or WebP</span>
            <input ref={licenseFileInput} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={Boolean(uploading) || Boolean(form.proofOfLicense && mediaProcessing.license)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file, "license"); }} className="sr-only" />
          </label>
          {form.proofOfLicense && <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-safecrib-green"><span>{mediaProcessing.license ? "License upload successful and saved to your draft." : "License document is ready to submit."}</span>{!mediaProcessing.license && <Button type="button" variant="secondary" onClick={() => licenseFileInput.current?.click()}>Replace license proof</Button>}</div>}

          <div className="grid gap-4 border border-black/10 p-4 sm:grid-cols-[6rem_1fr] sm:items-center">
            <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border border-black/10 bg-[#F4F7F6]">
              {profilePicturePreview
                ? <Image src={profilePicturePreview} alt="Uploaded profile picture preview" width={96} height={96} unoptimized className="h-24 w-24 object-cover" />
                : <span className="px-2 text-center text-xs text-black/45">The saved image preview is not available yet.</span>}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{uploading === "picture" ? "Uploading profile picture..." : form.profilePicture ? "Profile picture uploaded successfully" : "Upload profile picture *"}</p>
                <p className="mt-1 text-xs text-black/50">JPEG, PNG, WebP, or GIF</p>
                {form.profilePicture && <p className="mt-2 text-xs text-safecrib-green">{mediaProcessing.picture ? "Profile picture uploaded successfully and saved to your draft." : "Profile image is ready to submit."}</p>}
              </div>
              {!form.profilePicture && <Button type="button" variant="secondary" disabled={Boolean(uploading)} onClick={() => pictureFileInput.current?.click()}>Choose profile picture</Button>}
              {form.profilePicture && !mediaProcessing.picture && <Button type="button" variant="secondary" disabled={Boolean(uploading)} onClick={() => pictureFileInput.current?.click()}>Replace profile picture</Button>}
            </div>
            <input ref={pictureFileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={Boolean(uploading) || Boolean(form.profilePicture && mediaProcessing.picture)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file, "picture"); }} className="sr-only" />
          </div>
        </div>}

        {step === 3 && <div className="mt-7 grid gap-5">
          <section aria-labelledby="payout-accounts-heading" className="grid gap-5">
            <div><h2 id="payout-accounts-heading" className="text-lg font-medium">Payout accounts</h2><p className="mt-2 text-sm leading-6 text-black/55">Add 1 to 10 payout destinations. Account numbers are kept as text so leading zeroes are preserved.</p></div>
            <div className="grid gap-5 sm:grid-cols-2">{input("provider", "Bank or payment provider", true)}{input("accountName", "Account name", true)}</div>
            {input("accountNumber", "Account number", true, "text", 20)}
            {additionalPayoutAccounts.map((account, index) => <fieldset key={index} className="grid gap-4 border border-black/10 p-4">
              <legend className="px-1 text-sm font-medium">Payout account {index + 2}</legend>
              <div className="flex justify-end"><button type="button" onClick={() => setAdditionalPayoutAccounts((current) => current.filter((_, accountIndex) => accountIndex !== index))} className="text-sm font-medium text-red-700 hover:underline">Remove</button></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium">Bank or payment provider *<input required maxLength={120} value={account.provider} onChange={(event) => updateAdditionalPayout(index, "provider", event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" /></label>
                <label className="block text-sm font-medium">Account name *<input required maxLength={120} value={account.accountName} onChange={(event) => updateAdditionalPayout(index, "accountName", event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" /></label>
              </div>
              <label className="block text-sm font-medium">Account number *<input required type="text" inputMode="numeric" maxLength={20} value={account.accountNumber} onChange={(event) => updateAdditionalPayout(index, "accountNumber", event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" /></label>
            </fieldset>)}
            {additionalPayoutAccounts.length < 9 && <Button type="button" variant="secondary" onClick={() => setAdditionalPayoutAccounts((current) => [...current, { ...emptyPayoutAccount }])}>Add payout account</Button>}
          </section>
          <div className="grid gap-5 sm:grid-cols-2">{input("linkedin", "LinkedIn link")}{input("website", "Website link")}</div>
          <div className="border-t border-black/10 pt-5"><h2 className="text-base font-medium">Ready to submit</h2><p className="mt-2 text-sm leading-6 text-black/55">Submitting sends your Page to admin review. You cannot edit it while it is pending. If rejected, you can update and resubmit.</p><dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><dt className="text-black/50">Page name</dt><dd>{form.displayName || "Not set"}</dd><dt className="text-black/50">Provider type</dt><dd>{form.providerType}</dd><dt className="text-black/50">Payout accounts</dt><dd>{additionalPayoutAccounts.length + 1}</dd><dt className="text-black/50">License proof</dt><dd>{form.proofOfLicense ? mediaProcessing.license ? "Uploaded; awaiting confirmation" : "Ready" : "Missing"}</dd><dt className="text-black/50">Profile image</dt><dd>{form.profilePicture ? mediaProcessing.picture ? "Uploaded; awaiting confirmation" : "Ready" : "Missing"}</dd></dl></div>
        </div>}

        <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-black/10 pt-5"><div>{step > 1 && <Button type="button" variant="secondary" onClick={() => { setError(""); setStep((current) => current - 1); }}>Back</Button>}</div>{step < 3 ? <Button type="button" disabled={Boolean(uploading)} onClick={next}>Next</Button> : <Button type="button" loading={saving} disabled={Boolean(uploading)} onClick={() => void submit()}>{status === "REJECTED" ? "Update and submit for review" : "Submit Page for review"}</Button>}</div>
        <p className="mt-4 text-xs leading-5 text-black/45">Your details stay in this form while you move between sections. The Page is created and sent for review only when you choose the final submit action. Selecting a document starts its upload.</p>
      </form>
    </section>
    {confirmProviderConversion && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="provider-conversion-title" className="w-full max-w-lg border border-black/10 bg-white p-6 shadow-xl sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-safecrib-green">Account mode change</p>
        <h2 id="provider-conversion-title" className="mt-2 text-xl font-medium text-safecrib-black">Confirm provider verification</h2>
        <p className="mt-3 text-sm leading-6 text-black/65">Your student profile ({studentStatus.replaceAll("_", " ")}) will be retained, but student-only actions will be unavailable if your {form.providerType.toLowerCase()} Page is approved. Your active account mode changes only after provider review approval.</p>
        <p className="mt-3 text-sm leading-6 text-black/65">SafeCrib will record your consent with this Page submission. A pending or rejected Page does not grant provider permissions.</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-black/10 pt-5">
          <Button type="button" variant="secondary" onClick={() => setConfirmProviderConversion(false)}>Cancel</Button>
          <Button type="button" loading={saving} onClick={() => { setConfirmProviderConversion(false); void submit(true); }}>Confirm and submit</Button>
        </div>
      </section>
    </div>}
  </main>;
}