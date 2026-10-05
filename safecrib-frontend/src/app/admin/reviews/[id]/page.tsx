"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  adminFetch,
  ApiError,
  resolveAdminMediaUrl,
  unwrapData,
} from "@/lib/api";
import { Modal } from "@/components/ui/Modal";

type EntityType = "student_profile" | "provider_page";
type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
type ReviewSubmission = {
  id: string;
  email: string;
  status: ReviewStatus;
  entityType: EntityType;
  submittedData: Record<string, unknown>;
  rejectionReason: string | null;
  submittedAt: string;
  createdAt: string;
  reviewer?: unknown;
  reviewedAt?: string;
};
type OpenMedia = {
  key: string;
  url: string;
  label: string;
  isImage: boolean;
};

const labels: Record<string, string> = {
  displayName: "Display name",
  providerType: "Provider type",
  schoolOfStudy: "School of study",
  courseOfStudy: "Course of study",
  level: "Level",
  dateOfBirth: "Date of birth",
  gender: "Gender",
  phoneNumber: "Phone number",
  emergencyContact: "Emergency contact",
  socialLinks: "Social links",
  description: "Business details",
  phone: "Contact number",
  payoutAccounts: "Payout accounts",
  businessName: "Business name",
  businessAddress: "Business address",
  businessRegNumber: "Business registration number",
  additionalContactNumbers: "Additional contacts",
  fraudFlags: "Fraud flags",
};
const mediaFields = new Set([
  "profilePicture",
  "coverPhoto",
  "proofOfStudentship",
  "proofOfLicense",
]);

function mediaReference(value: unknown) {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  return ["url", "accessUrl", "deliveryUrl", "id", "mediaId"]
    .map((key) => record[key])
    .find((candidate): candidate is string => typeof candidate === "string" && Boolean(candidate));
}

function hasMediaReference(value: unknown) {
  return Boolean(mediaReference(value));
}

function display(value: unknown, fieldKey?: string): ReactNode {
  if (value === null || value === undefined || value === "")
    return "Not provided";
  if (Array.isArray(value)) {
    if (value.length === 0) return "None provided";
    const flagged = fieldKey === "fraudFlags";
    const accounts = fieldKey === "payoutAccounts";
    return (
      <ul className={accounts ? "grid gap-3 sm:grid-cols-2" : "space-y-2"}>
        {value.map((item, index) => (
          <li
            key={index}
            className={
              accounts
                ? "border border-black/10 bg-black/[0.02] p-4"
                : flagged
                  ? "border-l-2 border-amber-500 bg-amber-50 px-3 py-2 text-amber-950"
                  : "text-black/75"
            }
          >
            {display(item, accounts ? undefined : fieldKey)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, nested]) => nested !== null && nested !== undefined && nested !== "",
    );
    if (entries.length === 0) return "None provided";
    return (
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {entries.map(([key, nested]) => (
          <div key={key} className="min-w-0">
            <dt className="text-xs font-medium text-black/45">{label(key)}</dt>
            <dd className="mt-1 break-words text-sm text-black/80">
              {display(nested, key)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  if (
    typeof value === "string" &&
    ["website", "linkedin"].includes(fieldKey ?? "")
  ) {
    const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return (
      <a href={href} target="_blank" rel="noreferrer" className="text-safecrib-green underline underline-offset-2">
        {value}
      </a>
    );
  }
  if (
    typeof value === "string" &&
    fieldKey === "accountNumber" &&
    value.length > 4
  ) {
    return (
      <details>
        <summary className="cursor-pointer text-safecrib-green">
          Show account number ending {value.slice(-4)}
        </summary>
        <p className="mt-2 font-mono text-sm">{value}</p>
      </details>
    );
  }
  if (
    typeof value === "string" &&
    ["phone", "phoneNumber", "emergencyContact", "additionalContactNumbers"].includes(fieldKey ?? "")
  ) {
    return <a href={`tel:${value.replace(/[^+\d]/g, "")}`}>{value}</a>;
  }
  return String(value);
}

function mediaUnavailable(reference: unknown, error?: string | null): ReactNode {
  const normalizedReference = mediaReference(reference);
  if (!normalizedReference) return "Not provided";
  return (
    <span className="block text-amber-900">
      {error || "The media service could not resolve this file."}
      <code className="mt-1 block break-all font-mono text-xs text-black/55">
        Reference: {normalizedReference}
      </code>
    </span>
  );
}
function label(key: string) {
  return (
    labels[key] ??
    key
      .replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)
      .replace(/^./, (letter) => letter.toUpperCase())
  );
}
function category(
  entityType: EntityType,
  submittedData: Record<string, unknown>,
) {
  if (entityType === "student_profile") return "Student account";
  return submittedData.providerType === "LANDLORD"
    ? "Landlord account"
    : "Agent account";
}

export default function AdminReviewPage() {
  const { id: encodedId } = useParams<{ id: string }>();
  const id = decodeURIComponent(encodedId);
  const router = useRouter();
  const [review, setReview] = useState<ReviewSubmission | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string | null>>({});
  const [mediaErrors, setMediaErrors] = useState<Record<string, string | null>>({});
  const [openMedia, setOpenMedia] = useState<OpenMedia | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<ReviewStatus | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    "APPROVED" | "REJECTED" | null
  >(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const detail = unwrapData<ReviewSubmission>(
        await adminFetch<unknown>(
          `/api/v1/admin/review-queue/${encodeURIComponent(id)}`,
        ),
      );
      setReview(detail);
      setReason(detail.rejectionReason ?? "");
      const references = Object.entries(detail.submittedData).filter(
        ([key, value]) => mediaFields.has(key) && hasMediaReference(value),
      );
      const resolved = await Promise.all(
        references.map(async ([key, value]) => [key, await resolveAdminMediaUrl(value)] as const),
      );
      setMediaUrls(Object.fromEntries(resolved.map(([key, result]) => [key, result.url])));
      setMediaErrors(Object.fromEntries(resolved.map(([key, result]) => [key, result.error])));
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 404) {
        setError(
          "This submission no longer exists. Return to the queue and refresh it.",
        );
      } else if (
        loadError instanceof ApiError &&
        (loadError.status === 401 || loadError.status === 403)
      )
        router.replace(
          `/admin/login?reason=${loadError.status === 403 ? "denied" : "session-expired"}`,
        );
      else setError("We could not load this submission.");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (status: "APPROVED" | "REJECTED") => {
    const trimmedReason = reason.trim();
    if (status === "REJECTED" && !trimmedReason) {
      setError("A rejection reason is required.");
      return;
    }
    if (trimmedReason.length > 2000) {
      setError("The rejection reason must be 2,000 characters or fewer.");
      return;
    }
    setAction(status);
    setError("");
    try {
      const response = unwrapData<Partial<ReviewSubmission>>(
        await adminFetch<unknown>("/api/v1/admin/review", {
          method: "POST",
          body: JSON.stringify({
            submissionId: review?.id ?? id,
            status,
            ...(status === "REJECTED" ? { reason: trimmedReason } : {}),
          }),
        }),
      );
      setReview((current) =>
        current
          ? {
              ...current,
              ...response,
              status,
              rejectionReason: status === "REJECTED" ? trimmedReason : null,
            }
          : current,
      );
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
      if (reviewError instanceof ApiError && reviewError.status === 409) {
        setError(
          "Another admin already reviewed this submission. Reloading its latest state.",
        );
        await load();
      } else if (reviewError instanceof ApiError && reviewError.status === 400)
        setError(
          reviewError.message || "Check the review details and try again.",
        );
      else
        setError(
          reviewError instanceof ApiError
            ? reviewError.message
            : "We could not update this review.",
        );
    } finally {
      setAction(null);
    }
  };

  if (loading)
    return <p className="text-sm text-black/55">Loading submission...</p>;
  if (!review)
    return (
      <div>
        <Link
          href="/admin"
          className="text-sm font-medium text-safecrib-green hover:underline"
        >
          Back to queue
        </Link>
        <p className="mt-6 text-sm text-red-600">
          {error || "Submission unavailable."}
        </p>
      </div>
    );
  const fields = Object.entries(review.submittedData).filter(
    ([key]) => !mediaFields.has(key),
  );
  const pending = review.status === "PENDING";

  return (
    <>
      <div>
        <Link
          href="/admin"
          className="text-sm font-medium text-safecrib-green hover:underline"
        >
          Back to queue
        </Link>
        <div className="mt-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">
              Submission review
            </p>
            <h1 className="mt-2 text-3xl font-medium">
              {display(review.submittedData.displayName ?? review.email)}
            </h1>
            <p className="mt-2 text-sm text-black/55">
              {category(review.entityType, review.submittedData)} ·{" "}
              {review.entityType === "provider_page" &&
              typeof review.submittedData.providerType === "string"
                ? review.submittedData.providerType
                : review.status}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={!pending || action !== null}
              onClick={() => setConfirmAction("APPROVED")}
              className="rounded-[4px] bg-safecrib-green px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {action === "APPROVED" ? "Approving..." : "Approve"}
            </button>
            <button
              type="button"
              disabled={!pending || action !== null}
              onClick={() => setConfirmAction("REJECTED")}
              className="rounded-[4px] border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-40"
            >
              {action === "REJECTED" ? "Rejecting..." : "Reject"}
            </button>
          </div>
        </div>
        {error && (
          <p
            className="mt-6 rounded-[4px] border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            role="alert"
          >
            {error}
          </p>
        )}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="rounded-[8px] border border-black/10 bg-white p-6">
            <h2 className="text-lg font-medium">
              {review.entityType === "provider_page"
                ? "Provider Page details"
                : "Student profile details"}
            </h2>
            <dl className="mt-5 divide-y divide-black/10">
              {fields.map(([key, value]) => (
                <div
                  key={key}
                  className="grid gap-1 py-4 sm:grid-cols-[180px_1fr]"
                >
                  <dt className="text-sm font-medium text-black/55">
                    {label(key)}
                  </dt>
                  <dd className="min-w-0 break-words text-sm">
                    {display(value, key)}
                  </dd>
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
            {!pending && review.rejectionReason && (
              <p className="mt-6 rounded-[4px] bg-red-50 p-4 text-sm text-red-700">
                <strong>Rejection reason:</strong> {review.rejectionReason}
              </p>
            )}
          </div>
          <aside className="space-y-5">
            <div className="rounded-[8px] border border-black/10 bg-white p-5">
              <h2 className="font-medium">Profile picture</h2>
              {mediaUrls.profilePicture ? (
                <button
                  type="button"
                  onClick={() => setOpenMedia({
                    key: "profilePicture",
                    url: mediaUrls.profilePicture ?? "",
                    label: "Applicant profile picture",
                    isImage: true,
                  })}
                  className="mt-4 block w-full cursor-zoom-in text-left"
                  aria-label="Open applicant profile picture"
                >
                  <Image
                    src={mediaUrls.profilePicture}
                    alt="Applicant profile"
                    width={280}
                    height={280}
                    unoptimized
                    className="aspect-square w-full rounded-[6px] object-cover"
                  />
                </button>
              ) : (
                <div className="mt-4 space-y-3 text-sm text-black/60">
                  <p>{mediaUnavailable(review.submittedData.profilePicture, mediaErrors.profilePicture)}</p>
                  {hasMediaReference(review.submittedData.profilePicture) && (
                      <button
                        type="button"
                        onClick={() => void load()}
                        className="font-medium text-safecrib-green underline underline-offset-2"
                      >
                        Retry media access
                      </button>
                    )}
                </div>
              )}
              <dl className="mt-4 divide-y divide-black/10">
                {(
                  ["proofOfStudentship", "proofOfLicense", "coverPhoto"] as const
                ).map((key) => (
                  <div key={key} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto]">
                    <dt className="font-medium text-black/65">{label(key)}</dt>
                    <dd className="break-all text-black/55">
                      {mediaUrls[key] ? (
                        <button
                          type="button"
                          onClick={() => setOpenMedia({
                            key,
                            url: mediaUrls[key] ?? "",
                            label: label(key),
                            isImage: key === "coverPhoto",
                          })}
                          className="font-medium text-safecrib-green hover:underline"
                        >
                          Open file
                        </button>
                      ) : (
                        <span className="flex flex-col items-start gap-2">
                          {mediaUnavailable(review.submittedData[key], mediaErrors[key])}
                          {hasMediaReference(review.submittedData[key]) && (
                            <button
                              type="button"
                              onClick={() => void load()}
                              className="font-medium text-safecrib-green underline underline-offset-2"
                            >
                              Retry
                            </button>
                          )}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </aside>
        </div>
      </div>
      <Modal
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        titleId="review-confirm-title"
      >
        <h2 id="review-confirm-title" className="text-xl font-medium">
          {confirmAction === "REJECTED"
            ? "Reject this submission?"
            : "Approve this submission?"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-black/65">
          {confirmAction === "REJECTED"
            ? "The rejection reason will be recorded and shown in the submission history."
            : "This decision will mark the submission as approved and cannot be repeated."}
        </p>
        {confirmAction === "REJECTED" && (
          <p className="mt-4 rounded-[4px] bg-black/[0.03] p-3 text-sm whitespace-pre-wrap">
            {reason.trim() || "A rejection reason is required."}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setConfirmAction(null)}
            className="rounded-[4px] border border-black/15 px-4 py-2 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={confirmAction === "REJECTED" && !reason.trim()}
            onClick={() => {
              const selected = confirmAction;
              setConfirmAction(null);
              if (selected) void decide(selected);
            }}
            className="rounded-[4px] bg-safecrib-green px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Confirm {confirmAction === "REJECTED" ? "rejection" : "approval"}
          </button>
        </div>
      </Modal>
      <Modal
        open={openMedia !== null}
        onClose={() => setOpenMedia(null)}
        titleId="media-preview-title"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="media-preview-title" className="text-xl font-medium">
            {openMedia?.label}
          </h2>
          <button
            type="button"
            onClick={() => setOpenMedia(null)}
            className="rounded-[4px] border border-black/15 px-3 py-2 text-sm font-medium"
          >
            Close
          </button>
        </div>
        {openMedia && (
          openMedia.isImage ? (
            <Image
              src={openMedia.url}
              alt={openMedia.label}
              width={1200}
              height={900}
              unoptimized
              className="mt-5 max-h-[70vh] w-full rounded-[6px] object-contain"
            />
          ) : (
            <iframe
              src={openMedia.url}
              title={openMedia.label}
              className="mt-5 h-[70vh] w-full rounded-[6px] border border-black/10"
            />
          )
        )}
      </Modal>
    </>
  );
}
