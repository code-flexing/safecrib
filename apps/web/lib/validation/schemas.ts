/**
 * schemas.ts — Zod validation schemas mirroring backend DTOs.
 *
 * Shared by form components so validation rules stay in sync with the backend.
 * Do not import backend code here — these are mirrored, not literally shared.
 */

import { z } from "zod";

// ── Auth ───────────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be under 72 characters"),
  displayName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be under 80 characters")
    .optional()
    .or(z.literal("")),
  role: z.enum(["STUDENT", "AGENT", "LANDLORD"]),
});

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .email("Enter a valid email address"),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be under 72 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

// ── Listings ───────────────────────────────────────────────────────────────

export const createListingSchema = z.object({
  title: z
    .string()
    .min(5, "Title must be at least 5 characters")
    .max(120, "Title must be under 120 characters"),
  description: z
    .string()
    .min(20, "Description must be at least 20 characters")
    .max(3000, "Description must be under 3000 characters"),
  price: z
    .number({ invalid_type_error: "Price must be a number" })
    .positive("Price must be greater than 0")
    .max(100000, "Price seems unusually high — please check"),
  address: z.string().min(5, "Address is required"),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  availableFrom: z.string().min(1, "Available from date is required"),
});

export type CreateListingFormValues = z.infer<typeof createListingSchema>;

// ── Bookings ───────────────────────────────────────────────────────────────

export const createBookingSchema = z.object({
  listingId: z.string().uuid("Invalid listing ID"),
  moveInDate: z.string().min(1, "Move-in date is required"),
});

export type CreateBookingFormValues = z.infer<typeof createBookingSchema>;

// ── Fraud report ───────────────────────────────────────────────────────────

export const fraudReportSchema = z.object({
  targetListingId: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
  type: z.enum([
    "FAKE_LISTING",
    "DOUBLE_BOOKING",
    "SCAM_PAYMENT",
    "MISREPRESENTATION",
    "OTHER",
  ]),
  description: z
    .string()
    .min(20, "Please describe the issue in at least 20 characters")
    .max(2000, "Description must be under 2000 characters"),
  evidenceUrls: z.array(z.string().url()).optional(),
});

export type FraudReportFormValues = z.infer<typeof fraudReportSchema>;

// ── Profile ────────────────────────────────────────────────────────────────

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(80, "Name must be under 80 characters"),
});

export type UpdateProfileFormValues = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password must be under 72 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

// ── Admin onboarding ───────────────────────────────────────────────────────

export const onboardAgentSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  displayName: z.string().min(2, "Name is required"),
  role: z.enum(["AGENT", "LANDLORD"]),
});

export type OnboardAgentFormValues = z.infer<typeof onboardAgentSchema>;
