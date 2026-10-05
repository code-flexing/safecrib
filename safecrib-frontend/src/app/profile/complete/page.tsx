"use client";

import { FormEvent, useEffect, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { BackHomeLink } from "@/components/ui/BackHomeLink";
import { Button } from "@/components/ui/Button";
import { ReviewPendingState } from "@/components/verification/ReviewPendingState";
import {
  readDraft,
  removeDraft,
  writeDraft,
} from "@/lib/drafts";
import {
  ApiError,
  apiFetch,
  cachedApiFetch,
  cancelPendingUpload,
  clearClientCache,
  clearPendingUploads,
  getPendingUpload,
  getPendingUploads,
  getCurrentUser,
  isUnauthorizedError,
  normalizeAccountStatus,
  normalizePageStatus,
  primeCurrentUserCache,
  unwrapData,
  uploadDocument,
  type AccountStatus,
  type PageStatus,
  type PendingUpload,
} from "@/lib/api";

type StudentProfile = {
  displayName?: string;
  shortBio?: string;
  longBio?: string | null;
  schoolOfStudy?: string;
  courseOfStudy?: string;
  level?: string;
  profilePicture?: string;
  proofOfStudentship?: string;
  dateOfBirth?: string;
  gender?: string;
  phoneNumber?: string;
  emergencyContact?: string;
  socialLinks?: Record<string, string>;
  status?: string;
  rejectionReason?: string;
  reason?: string;
};

type User = {
  id?: string;
  email?: string;
  displayName?: string;
  studentProfileStatus?: unknown;
  role?: string;
};

type FormState = Omit<
  StudentProfile,
  "status" | "rejectionReason" | "reason" | "socialLinks"
> & {
  linkedin: string;
  website: string;
};

type ProfileDraft = {
  form: FormState;
  step: number;
};

type UploadAccordionProps = {
  title: string;
  description: string;
  accept: string;
  format: string;
  value?: string;
  uploading: boolean;
  required?: boolean;
  onUpload: (file: File) => void;
};

function UploadAccordion({
  title,
  description,
  accept,
  format,
  value,
  uploading,
  required = false,
  onUpload,
}: UploadAccordionProps) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files[0];

    if (file) {
      onUpload(file);
    }
  };

  return (
    <details className="group min-w-0 rounded-[10px] border border-black/10 bg-[#FAFBF9] p-3 sm:p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-safecrib-black [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm ${
              value
                ? "bg-[#EAF7F1] text-safecrib-green"
                : "bg-black/[0.05] text-black/55"
            }`}
          >
            {value ? "✓" : "↑"}
          </span>

          <span className="min-w-0">
            <span className="block break-words text-sm font-medium">
              {title}
              {required ? " *" : ""}
            </span>

            <span className="mt-1 block text-xs font-normal leading-5 text-black/55">
              {value ? "Uploaded and ready" : description}
            </span>
          </span>
        </span>

        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-black/10 text-lg text-black/50 transition-transform group-open:rotate-45"
          aria-hidden="true"
        >
          +
        </span>
      </summary>

      <div className="pt-4">
        <label
          className={`flex cursor-pointer flex-col items-center justify-center rounded-[8px] border border-dashed px-5 py-7 text-center transition-colors ${
            dragging
              ? "border-safecrib-green bg-[#EAF7F1]"
              : "border-black/20 bg-white hover:border-safecrib-green hover:bg-[#F3FAF6]"
          } ${uploading ? "pointer-events-none opacity-60" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#EAF7F1] text-xl text-safecrib-green">
            ↑
          </span>

          <span className="mt-3 max-w-full break-words text-sm font-medium text-safecrib-black">
            {uploading
              ? "Uploading..."
              : value
                ? "Choose a different file"
                : "Drop your file here or browse"}
          </span>

          <span className="mt-1 max-w-full break-words text-xs leading-5 text-black/50">
            {format}
          </span>

          <input
            required={required && !value}
            type="file"
            accept={accept}
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                onUpload(file);
              }
            }}
            className="sr-only"
          />
        </label>

        {value && (
          <p className="mt-3 flex items-center gap-2 text-xs font-medium text-safecrib-green">
            <span aria-hidden="true">✓</span>
            File uploaded successfully
          </p>
        )}
      </div>
    </details>
  );
}

const emptyForm: FormState = {
  displayName: "",
  shortBio: "",
  longBio: "",
  schoolOfStudy: "",
  courseOfStudy: "",
  level: "",
  profilePicture: "",
  proofOfStudentship: "",
  dateOfBirth: "",
  gender: "",
  phoneNumber: "",
  emergencyContact: "",
  linkedin: "",
  website: "",
};

function hasRequiredStudentDetails(form: FormState) {
  const displayName = String(form.displayName ?? "").trim();
  const schoolOfStudy = String(form.schoolOfStudy ?? "").trim();
  const courseOfStudy = String(form.courseOfStudy ?? "").trim();
  const level = String(form.level ?? "").trim();
  const shortBio = String(form.shortBio ?? "").trim();

  return Boolean(
    displayName &&
      schoolOfStudy &&
      courseOfStudy &&
      level &&
      shortBio.length > 0 &&
      shortBio.length <= 160 &&
      String(form.longBio ?? "").length <= 2000
  );
}

function hasRequiredUploads(form: FormState) {
  const proofOfStudentship =
    form.proofOfStudentship ||
    getPendingUpload("PROOF_OF_STUDENTSHIP") ||
    "";

  const profilePicture =
    form.profilePicture ||
    getPendingUpload("AVATAR") ||
    "";

  return Boolean(
    proofOfStudentship &&
      profilePicture
  );
}

function validateStep(
  stepNumber: number,
  formState: FormState
) {
  if (stepNumber === 1 && !String(formState.shortBio ?? "").trim()) {
    return "Add a short bio so other people can learn about you.";
  }

  if (stepNumber === 1 && String(formState.shortBio ?? "").trim().length > 160) {
    return "Your short bio must be 160 characters or fewer.";
  }

  if (stepNumber === 1 && String(formState.longBio ?? "").length > 2000) {
    return "Your long bio must be 2,000 characters or fewer.";
  }

  if (
    stepNumber === 1 &&
    !hasRequiredStudentDetails(formState)
  ) {
    return "Complete the required student details before continuing.";
  }

  if (
    stepNumber === 2 &&
    !hasRequiredUploads(formState)
  ) {
    return "Upload your proof of studentship and profile image before continuing.";
  }

  const phoneNumber = String(
    formState.phoneNumber ?? ""
  ).trim();

  const emergencyContact = String(
    formState.emergencyContact ?? ""
  ).trim();

  if (
    stepNumber === 3 &&
    (!phoneNumber || !emergencyContact)
  ) {
    return "Add a phone number and emergency contact before continuing.";
  }

  return "";
}

function profileDraftKey(user: User) {
  const owner =
    user.id ??
    user.email ??
    "current";

  return `safecrib:draft:student-profile:v1:${owner}`;
}

export default function CompleteStudentProfilePage() {
  const router = useRouter();

  const [form, setForm] =
    useState<FormState>(emptyForm);

  const [status, setStatus] =
    useState<AccountStatus>("not_submitted");

  const [pageStatus, setPageStatus] =
    useState<PageStatus>("none");

  const [rejectionReason, setRejectionReason] =
    useState("");

  const [error, setError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [uploadingStudentship, setUploadingStudentship] =
    useState(false);

  const [uploadingAvatar, setUploadingAvatar] =
    useState(false);

  const [step, setStep] =
    useState(0);

  const [pendingUploads, setPendingUploads] =
    useState<PendingUpload[]>([]);

  const [cancellingUpload, setCancellingUpload] =
    useState<string | null>(null);

  const [draftKey, setDraftKey] =
    useState<string | null>(null);

  const [draftHydrated, setDraftHydrated] =
    useState(false);

  const [draftRestored, setDraftRestored] =
    useState(false);

  useEffect(() => {
    if (
      !localStorage.getItem(
        "safecrib_access_token"
      )
    ) {
      router.replace("/login");
      return;
    }

    void Promise.all([
      getCurrentUser<User>(),

      cachedApiFetch<StudentProfile | null>(
        "/api/v1/student-profiles/me"
      ).catch(() => null),

      apiFetch<unknown>(
        "/api/v1/student-profiles/status"
      ).then(unwrapData<unknown>).catch(() => null),

      cachedApiFetch<{ status?: string }>(
        "/api/v1/provider-pages/me"
      ).catch(() => null),
    ])
      .then(
        ([
          user,
          studentProfile,
          statusResponse,
          page,
        ]) => {
          clearClientCache("/api/v1/student-profiles/status");
          primeCurrentUserCache(user);
          const currentDraftKey =
            profileDraftKey(user);

          const draft =
            readDraft<ProfileDraft>(
              currentDraftKey
            );

          const rawStatus =
            statusResponse ?? user.studentProfileStatus;

          setStatus(
            normalizeAccountStatus(rawStatus)
          );

          setPageStatus(
            normalizePageStatus(
              page?.status
            )
          );

          setDraftKey(currentDraftKey);

          setDraftRestored(
            Boolean(draft)
          );

          setDraftHydrated(true);

          if (studentProfile) {
            setForm((current) => ({
              ...current,
              ...studentProfile,

              linkedin:
                studentProfile.socialLinks
                  ?.linkedin ?? "",

              website:
                studentProfile.socialLinks
                  ?.website ?? "",

              ...draft?.form,
            }));

            setRejectionReason(
              studentProfile.rejectionReason ??
                studentProfile.reason ??
                ""
            );
          } else if (draft) {
            setForm(draft.form);
          }

          if (draft) {
            setStep(
              Math.min(
                Math.max(draft.step, 0),
                4
              )
            );
          }
        }
      )
      .catch((loadError: unknown) => {
        if (
          isUnauthorizedError(loadError)
        ) {
          localStorage.removeItem(
            "safecrib_access_token"
          );

          localStorage.removeItem(
            "safecrib_refresh_token"
          );

          router.replace(
            "/login?reason=session-expired"
          );

          return;
        }

        setStatus("not_submitted");
        setPageStatus("none");
        setDraftHydrated(true);
      });
  }, [router]);

  useEffect(() => {
    if (draftHydrated && status === "approved") {
      router.replace("/dashboard");
    }
  }, [draftHydrated, router, status]);

  useEffect(() => {
    if (!draftHydrated || status !== "pending") return;

    let checkingStatus = false;
    const refreshStatus = async () => {
      if (checkingStatus || document.visibilityState === "hidden") return;
      checkingStatus = true;
      try {
        const response = unwrapData<unknown>(
          await apiFetch<unknown>("/api/v1/student-profiles/status"),
        );
        const latestStatus = normalizeAccountStatus(response);
        if (latestStatus !== "pending") {
          clearClientCache(
            "/api/v1/student-profiles/status",
            "/api/v1/users/me",
            "/api/v1/auth/me",
          );
          setStatus(latestStatus);
        }
      } catch {
        // Keep the pending state if a temporary status check fails.
      } finally {
        checkingStatus = false;
      }
    };

    window.addEventListener("focus", refreshStatus);
    document.addEventListener("visibilitychange", refreshStatus);
    const interval = window.setInterval(refreshStatus, 30_000);
    return () => {
      window.removeEventListener("focus", refreshStatus);
      document.removeEventListener("visibilitychange", refreshStatus);
      window.clearInterval(interval);
    };
  }, [draftHydrated, status]);

  useEffect(() => {
    if (
      !draftKey ||
      !draftHydrated
    ) {
      return;
    }

    const timeout =
      window.setTimeout(() => {
        writeDraft<ProfileDraft>(
          draftKey,
          {
            form,
            step,
          }
        );
      }, 400);

    return () =>
      window.clearTimeout(timeout);
  }, [
    draftHydrated,
    draftKey,
    form,
    step,
  ]);

  const update = (
    field: keyof FormState,
    value: string
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const uploadStudentship = async (
    file: File
  ) => {
    setUploadingStudentship(true);
    setError("");

    try {
      update(
        "proofOfStudentship",
        await uploadDocument(
          file,
          "PROOF_OF_STUDENTSHIP"
        )
      );
    } catch (uploadError) {
      if (
        uploadError instanceof ApiError &&
        uploadError.status === 429
      ) {
        setPendingUploads(
          await getPendingUploads().catch(
            () => []
          )
        );

        setStep(2);
      }

      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "We could not upload the studentship document."
      );
    } finally {
      setUploadingStudentship(false);
    }
  };

  const uploadAvatar = async (
    file: File
  ) => {
    setUploadingAvatar(true);
    setError("");

    try {
      update(
        "profilePicture",
        await uploadDocument(
          file,
          "AVATAR"
        )
      );
    } catch (uploadError) {
      if (
        uploadError instanceof ApiError &&
        uploadError.status === 429
      ) {
        setPendingUploads(
          await getPendingUploads().catch(
            () => []
          )
        );

        setStep(2);
      }

      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "We could not upload the profile image."
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const cancelUpload = async (
    id: string
  ) => {
    setCancellingUpload(id);

    try {
      await cancelPendingUpload(id);

      setPendingUploads(
        (current) =>
          current.filter(
            (upload) =>
              upload.id !== id
          )
      );

      setError(
        "Pending upload cancelled. You can upload the file again."
      );
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "We could not cancel that pending upload."
      );
    } finally {
      setCancellingUpload(null);
    }
  };

  const submit = async (
    event: FormEvent
  ) => {
    event.preventDefault();

    /*
     * Prevent submitting a profile that is
     * already under review.
     */
    if (status === "pending") {
      setError(
        "Your profile is already under review."
      );
      return;
    }

    if (step !== 4) {
      setError(
        "Complete the final step before submitting your profile for review."
      );
      return;
    }

    const validationError =
      validateStep(1, form) ||
      validateStep(2, form) ||
      validateStep(3, form);

    if (validationError) {
      setError(validationError);

      if (
        !hasRequiredStudentDetails(form)
      ) {
        setStep(1);
      } else if (
        !hasRequiredUploads(form)
      ) {
        setStep(2);
      } else {
        setStep(3);
      }

      return;
    }

    const proofOfStudentship =
      form.proofOfStudentship ||
      getPendingUpload(
        "PROOF_OF_STUDENTSHIP"
      ) ||
      "";

    const profilePicture =
      form.profilePicture ||
      getPendingUpload("AVATAR") ||
      "";

    if (
      !proofOfStudentship ||
      !profilePicture
    ) {
      setStep(2);

      setError(
        "Upload your studentship document and profile image before submitting."
      );

      return;
    }

    setSaving(true);
    setError("");

    try {
      await apiFetch(
        "/api/v1/student-profiles/complete",
        {
          method: "POST",

          body: JSON.stringify({
            displayName:
              form.displayName,

            shortBio: form.shortBio?.trim(),

            ...(form.longBio?.trim()
              ? { longBio: form.longBio.trim() }
              : {}),

            proofOfStudentship,

            schoolOfStudy:
              form.schoolOfStudy,

            courseOfStudy:
              form.courseOfStudy,

            level: form.level,

            profilePicture,

            ...(form.dateOfBirth
              ? {
                  dateOfBirth:
                    form.dateOfBirth,
                }
              : {}),

            ...(form.gender
              ? {
                  gender: form.gender,
                }
              : {}),

            ...(form.phoneNumber
              ? {
                  phoneNumber:
                    form.phoneNumber,
                }
              : {}),

            ...(form.emergencyContact
              ? {
                  emergencyContact:
                    form.emergencyContact,
                }
              : {}),

            ...(form.linkedin.trim() ||
            form.website.trim()
              ? {
                  socialLinks: {
                    linkedin:
                      form.linkedin,
                    website:
                      form.website,
                  },
                }
              : {}),
          }),
        }
      );

      clearClientCache(
        "/api/v1/auth/me",
        "/api/v1/student-profiles/me",
        "/api/v1/student-profiles/status"
      );

      clearPendingUploads();

      if (draftKey) {
        removeDraft(draftKey);
      }

      router.replace("/dashboard");
    } catch {
      setError(
        "We could not submit your profile for review. Check the required fields and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const openPage = () =>
    router.push(
      pageStatus === "none"
        ? "/page/new"
        : "/page"
    );

  const discardDraft = () => {
    if (draftKey) {
      removeDraft(draftKey);
    }

    setForm(emptyForm);
    setStep(0);
    setDraftRestored(false);
    setError("");
  };

  const input = (
    field: keyof FormState,
    label: string,
    required = false,
    type = "text"
  ) => (
    <label className="block text-sm font-medium text-safecrib-black">
      {label}
      {required ? " *" : ""}

      <input
        required={required}
        type={type}
        value={form[field] ?? ""}
        onChange={(event) =>
          update(
            field,
            event.target.value
          )
        }
        className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
      />
    </label>
  );

  const nextStep = () => {
    const validationError =
      validateStep(step, form);

    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");

    setStep((current) =>
      Math.min(current + 1, 4)
    );
  };

  const handleNextClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    nextStep();
  };

  const previousStep = () => {
    setStep((current) =>
      Math.max(current - 1, 0)
    );
  };

  const handleBackClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    previousStep();
  };

  const handleFormSubmit = async (
    event: FormEvent
  ) => {
    event.preventDefault();

    if (step !== 4) {
      setError(
        "Complete the final step before submitting your profile for review."
      );
      return;
    }

    await submit(event);
  };

  const isPending = status === "pending";
  const providerPagePending = pageStatus === "pending";

  if (isPending || providerPagePending) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
        <DashboardNav onCreatePage={openPage} pageStatus={pageStatus} />
        <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
          <BackHomeLink />
          <ReviewPendingState
            subject={providerPagePending ? "provider Page" : "student profile"}
          />
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
      <DashboardNav
        onCreatePage={openPage}
        pageStatus={pageStatus}
      />

      <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
        <BackHomeLink />

        <h1 className="mt-6 text-3xl font-medium text-safecrib-black">
          Complete your student profile
        </h1>

        <p className="mt-3 max-w-xl text-sm leading-6 text-black/60">
          Complete your student details, then
          submit them for admin review from
          the final step.
        </p>

        {draftRestored && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-safecrib-green/20 bg-[#EAF7F1] px-4 py-3 text-sm text-safecrib-green">
            <span>
              Draft restored. Your progress
              is saved on this device.
            </span>

            <Button
              type="button"
              variant="secondary"
              className="border-safecrib-green/30 px-3 py-2 text-xs text-safecrib-green"
              onClick={discardDraft}
            >
              Discard draft
            </Button>
          </div>
        )}

        {status === "rejected" && (
          <div className="mt-6 rounded-[4px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p>
              Your profile was not approved.
              Update the details below and
              resubmit.
            </p>

            {rejectionReason && (
              <p className="mt-2">
                Reason: {rejectionReason}
              </p>
            )}
          </div>
        )}

        {step === 0 ? (
          <div className="mt-8 rounded-[12px] border border-black/10 bg-white p-6 shadow-[0_18px_40px_rgba(11,12,14,0.05)]">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">
              Student profile
            </p>

            <h2 className="mt-3 text-2xl font-medium text-safecrib-black">
              Set up your profile in four
              steps
            </h2>

            <p className="mt-3 text-sm leading-6 text-black/60">
              Add your details, verification
              document, profile image, and
              contact information one step at
              a time. Nothing is submitted until
              you click the final button.
            </p>

            <Button
              type="button"
              className="mt-6"
              onClick={nextStep}
            >
              Start your profile
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleFormSubmit}
            className="mt-8 grid gap-5 rounded-[12px] border border-black/10 bg-white p-6 shadow-[0_18px_40px_rgba(11,12,14,0.05)] sm:grid-cols-2"
          >
            <div className="min-w-0 sm:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">
                  Step {step} of 4
                </p>

                <span className="shrink-0 text-xs text-black/45">
                  {Math.round(
                    (step / 4) * 100
                  )}
                  %
                </span>
              </div>

              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-black/5">
                <div
                  className="h-full rounded-full bg-safecrib-green transition-[width] duration-300"
                  style={{
                    width: `${
                      (step / 4) * 100
                    }%`,
                  }}
                />
              </div>
            </div>

            {step === 1 && (
              <>
                {input(
                  "displayName",
                  "Display name",
                  true
                )}
                <label className="block text-sm font-medium text-safecrib-black sm:col-span-2">
                  Short bio * (shown in search, max 160 characters)
                  <textarea
                    required
                    maxLength={160}
                    rows={3}
                    value={form.shortBio ?? ""}
                    onChange={(event) => update("shortBio", event.target.value)}
                    className="mt-2 w-full resize-y rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
                    placeholder="A short introduction about yourself"
                  />
                  <span className="mt-1 block text-right text-xs font-normal text-black/45">{(form.shortBio ?? "").length}/160</span>
                </label>
                <label className="block text-sm font-medium text-safecrib-black sm:col-span-2">
                  Long bio (optional, max 2,000 characters)
                  <textarea
                    maxLength={2000}
                    rows={4}
                    value={form.longBio ?? ""}
                    onChange={(event) => update("longBio", event.target.value)}
                    className="mt-2 w-full resize-y rounded-[8px] border border-black/15 px-4 py-3 font-normal text-safecrib-black focus:border-safecrib-green focus:outline-none"
                    placeholder="Share more about yourself"
                  />
                  <span className="mt-1 block text-right text-xs font-normal text-black/45">{(form.longBio ?? "").length}/2,000</span>
                </label>

                {input(
                  "schoolOfStudy",
                  "School of study",
                  true
                )}

                {input(
                  "courseOfStudy",
                  "Course of study",
                  true
                )}

                {input(
                  "level",
                  "Level",
                  true
                )}
              </>
            )}

            {step === 2 && (
              <div className="sm:col-span-2 grid min-w-0 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <p className="text-lg font-medium text-safecrib-black">
                    Upload your verification
                    files
                  </p>

                  <p className="mt-1 text-sm leading-6 text-black/60">
                    Add your verification
                    document and profile image.
                    Uploading saves them for the
                    final review step; it does not
                    submit your profile.
                  </p>
                </div>

                <UploadAccordion
                  title="Proof of studentship document"
                  description="Required for student verification"
                  accept="application/pdf,image/*"
                  format="PDF or image · max 10 MB"
                  value={
                    form.proofOfStudentship
                  }
                  uploading={
                    uploadingStudentship
                  }
                  required
                  onUpload={(file) =>
                    void uploadStudentship(
                      file
                    )
                  }
                />

                <UploadAccordion
                  title="Profile image"
                  description="Required for your student profile"
                  accept="image/*"
                  format="JPG, PNG, or WebP · max 10 MB"
                  value={
                    form.profilePicture
                  }
                  uploading={
                    uploadingAvatar
                  }
                  required
                  onUpload={(file) =>
                    void uploadAvatar(file)
                  }
                />

                {pendingUploads.length >
                  0 && (
                  <div className="sm:col-span-2 rounded-[8px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <p className="font-medium">
                      Pending uploads
                    </p>

                    <p className="mt-1">
                      Cancel an unfinished upload
                      before trying again.
                    </p>

                    <div className="mt-3 space-y-2">
                      {pendingUploads.map(
                        (upload) => (
                          <div
                            key={upload.id}
                            className="flex flex-col items-start gap-2 rounded-[6px] border border-amber-900/10 p-2 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <span className="break-all">
                              {upload.purpose ??
                                "Upload"}
                            </span>

                            <Button
                              type="button"
                              variant="secondary"
                              className="px-3 py-2 text-xs"
                              loading={
                                cancellingUpload ===
                                upload.id
                              }
                              onClick={() =>
                                void cancelUpload(
                                  upload.id
                                )
                              }
                            >
                              Cancel
                            </Button>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 3 && (
              <>
                {input(
                  "dateOfBirth",
                  "Date of birth",
                  false,
                  "date"
                )}

                {input(
                  "gender",
                  "Gender"
                )}

                {input(
                  "phoneNumber",
                  "Phone number"
                )}

                {input(
                  "emergencyContact",
                  "Emergency contact"
                )}
              </>
            )}

            {step === 4 && (
              <>
                {input(
                  "linkedin",
                  "LinkedIn link"
                )}

                {input(
                  "website",
                  "Website link"
                )}
              </>
            )}

            {error && (
              <p
                className="sm:col-span-2 text-sm text-red-600"
                role="alert"
              >
                {error}
              </p>
            )}

            <div className="sm:col-span-2 flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={handleBackClick}
              >
                Back
              </Button>

              {step < 4 ? (
                <Button
                  type="button"
                  onClick={handleNextClick}
                >
                  Next
                </Button>
              ) : (
                <Button
                  type="submit"
                  loading={saving}
                  disabled={
                    uploadingStudentship ||
                    uploadingAvatar
                  }
                >
                  {status === "rejected"
                    ? "Update and resubmit"
                    : "Submit for review"}
                </Button>
              )}
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
