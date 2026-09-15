"use client";

/**
 * /student/report — Fraud report submission form.
 *
 * Accepts optional targetListingId / targetUserId from query params so it
 * can be linked to directly from listing or agent pages.
 */

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { FlagIcon } from "lucide-react";
import { fraudApi, type FraudReportType } from "@/lib/api/fraud";

const REPORT_TYPES: Array<{ value: FraudReportType; label: string; description: string }> = [
  { value: "FAKE_LISTING",      label: "Fake listing",       description: "The listing doesn't exist or the property is misrepresented." },
  { value: "DOUBLE_BOOKING",    label: "Double-booking",     description: "The same room was offered to multiple people." },
  { value: "SCAM_PAYMENT",      label: "Payment scam",       description: "Requested payment outside the platform or suspicious payment method." },
  { value: "MISREPRESENTATION", label: "Misrepresentation",  description: "Photos, location, or details don't match reality." },
  { value: "OTHER",             label: "Other",              description: "Something else that doesn't fit the above categories." },
];

export default function FraudReportPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const prefillListingId = searchParams.get("targetListingId") ?? "";
  const prefillUserId    = searchParams.get("targetUserId")    ?? "";

  const [type,            setType]           = useState<FraudReportType | "">("");
  const [description,     setDescription]    = useState("");
  const [targetListingId, setTargetListingId] = useState(prefillListingId);
  const [targetUserId,    setTargetUserId]    = useState(prefillUserId);
  const [fieldErrors,     setFieldErrors]     = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: () =>
      fraudApi.submit({
        type: type as FraudReportType,
        description,
        targetListingId: targetListingId || undefined,
        targetUserId:    targetUserId    || undefined,
      }),
    onSuccess: () => {
      router.push("/student/dashboard?reported=1");
    },
  });

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!type) errors.type = "Please select a report type.";
    if (!description.trim() || description.trim().length < 20)
      errors.description = "Please provide at least 20 characters of detail.";
    if (!targetListingId && !targetUserId)
      errors.target = "Please enter at least a listing ID or user ID for the report.";
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  return (
    <div className="px-6 py-8 max-w-xl">
      <div className="flex items-center gap-3 mb-8">
        <FlagIcon size={20} className="text-muted" aria-hidden />
        <h1 className="font-display text-display-md text-ink">Report an issue</h1>
      </div>

      <p className="text-sm text-muted font-body mb-8 leading-relaxed">
        Use this form to report a suspicious listing, a scam attempt, or fraudulent
        behaviour by an agent or landlord. Every report is reviewed by our team —
        provide as much detail as possible.
      </p>

      {mutation.isError && (
        <div className="banner-error mb-6">
          {(mutation.error as Error)?.message ?? "Failed to submit report. Please try again."}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!validate()) return;
          mutation.mutate();
        }}
        noValidate
        className="space-y-6"
      >
        {/* Report type */}
        <div>
          <label className="label">What are you reporting?</label>
          {fieldErrors.type && <p className="field-error mb-2">{fieldErrors.type}</p>}
          <div className="space-y-2">
            {REPORT_TYPES.map((rt) => (
              <label
                key={rt.value}
                className={`flex items-start gap-3 p-3 border cursor-pointer transition-colors ${
                  type === rt.value
                    ? "border-ink bg-[#F8F8F8]"
                    : "border-[#E5E5E5] hover:border-[#D4D4D4]"
                }`}
              >
                <input
                  type="radio"
                  name="report-type"
                  value={rt.value}
                  checked={type === rt.value}
                  onChange={() => {
                    setType(rt.value);
                    setFieldErrors((e) => ({ ...e, type: "" }));
                  }}
                  className="mt-0.5 shrink-0"
                />
                <div>
                  <p className="text-sm font-medium text-ink">{rt.label}</p>
                  <p className="text-xs text-muted font-body mt-0.5">{rt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Target IDs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="target-listing-id">Listing ID (if applicable)</label>
            <input
              id="target-listing-id"
              type="text"
              className="input"
              placeholder="e.g. abc123"
              value={targetListingId}
              onChange={(e) => {
                setTargetListingId(e.target.value);
                setFieldErrors((err) => ({ ...err, target: "" }));
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor="target-user-id">Agent/user ID (if applicable)</label>
            <input
              id="target-user-id"
              type="text"
              className="input"
              placeholder="e.g. xyz789"
              value={targetUserId}
              onChange={(e) => {
                setTargetUserId(e.target.value);
                setFieldErrors((err) => ({ ...err, target: "" }));
              }}
            />
          </div>
          {fieldErrors.target && (
            <p className="field-error sm:col-span-2">{fieldErrors.target}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="label" htmlFor="report-description">
            Description
          </label>
          <textarea
            id="report-description"
            className="input resize-none h-36 text-sm"
            placeholder="Describe what happened in detail. Include dates, amounts, and any communication you received."
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setFieldErrors((err) => ({ ...err, description: "" }));
            }}
          />
          {fieldErrors.description ? (
            <p className="field-error mt-1">{fieldErrors.description}</p>
          ) : (
            <p className="text-xs text-muted mt-1 font-body">
              {description.trim().length}/20 characters minimum
            </p>
          )}
        </div>

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? "Submitting…" : "Submit report"}
        </button>
      </form>
    </div>
  );
}
