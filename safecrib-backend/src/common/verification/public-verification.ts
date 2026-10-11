import type { Role } from "../roles.decorator.js";

export type VerificationKind = "student" | "agent" | "landlord" | "staff";

export interface PublicVerification {
  kind: VerificationKind | null;
}

export interface PublicVerificationInput {
  role: Role | null | undefined;
  identityVerified: boolean | null | undefined;
  studentProfileApproved: boolean | null | undefined;
  providerPageVerified: boolean | null | undefined;
  riskBlocked?: boolean | null;
}

export function getPublicVerification(input: PublicVerificationInput): PublicVerification {
  const role = input.role ?? null;
  const identityMet = input.identityVerified === true;
  const providerMet =
    (role === "AGENT" || role === "LANDLORD") && input.providerPageVerified === true;
  const studentMet = role === "STUDENT" && input.studentProfileApproved === true;

  if (role === "ADMIN") {
    return { kind: "staff" };
  }

  if (identityMet && (providerMet || studentMet)) {
    if (role === "STUDENT") return { kind: "student" };
    if (role === "AGENT") return { kind: "agent" };
    if (role === "LANDLORD") return { kind: "landlord" };
  }

  return { kind: null };
}

export function serializePublicVerification(
  input: PublicVerificationInput,
): PublicVerification {
  return getPublicVerification(input);
}
