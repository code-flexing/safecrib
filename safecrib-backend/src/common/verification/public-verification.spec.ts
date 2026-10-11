import { getPublicVerification } from "./public-verification.js";

describe("getPublicVerification", () => {
  it("returns staff kind for ADMIN role regardless of other fields", () => {
    expect(getPublicVerification({
      role: "ADMIN",
      identityVerified: false,
      studentProfileApproved: false,
      providerPageVerified: false,
    })).toEqual({ kind: "staff" });
  });

  it("returns null for unverified student", () => {
    expect(getPublicVerification({
      role: "STUDENT",
      identityVerified: false,
      studentProfileApproved: false,
      providerPageVerified: false,
    })).toEqual({ kind: null });
  });

  it("returns student kind for verified student (identity + approved profile)", () => {
    expect(getPublicVerification({
      role: "STUDENT",
      identityVerified: true,
      studentProfileApproved: true,
      providerPageVerified: false,
    })).toEqual({ kind: "student" });
  });

  it("returns agent kind for verified agent", () => {
    expect(getPublicVerification({
      role: "AGENT",
      identityVerified: true,
      studentProfileApproved: false,
      providerPageVerified: true,
    })).toEqual({ kind: "agent" });
  });

  it("returns landlord kind for verified landlord", () => {
    expect(getPublicVerification({
      role: "LANDLORD",
      identityVerified: true,
      studentProfileApproved: false,
      providerPageVerified: true,
    })).toEqual({ kind: "landlord" });
  });

  it("returns null for admin not identity verified (still staff)", () => {
    expect(getPublicVerification({
      role: "ADMIN",
      identityVerified: false,
      studentProfileApproved: false,
      providerPageVerified: false,
      riskBlocked: true,
    })).toEqual({ kind: "staff" });
  });

  it("returns null for student with identity verified but no approved profile", () => {
    expect(getPublicVerification({
      role: "STUDENT",
      identityVerified: true,
      studentProfileApproved: false,
      providerPageVerified: false,
    })).toEqual({ kind: null });
  });

  it("returns null for agent with identity verified but no verified provider page", () => {
    expect(getPublicVerification({
      role: "AGENT",
      identityVerified: true,
      studentProfileApproved: false,
      providerPageVerified: false,
    })).toEqual({ kind: null });
  });

  it("returns null for UNVERIFIED role", () => {
    expect(getPublicVerification({
      role: "UNVERIFIED",
      identityVerified: true,
      studentProfileApproved: false,
      providerPageVerified: false,
    })).toEqual({ kind: null });
  });

  it("returns null for undefined role", () => {
    expect(getPublicVerification({
      role: undefined,
      identityVerified: true,
      studentProfileApproved: true,
      providerPageVerified: false,
    })).toEqual({ kind: null });
  });
});
