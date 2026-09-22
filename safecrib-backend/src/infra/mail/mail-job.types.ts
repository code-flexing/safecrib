export interface VerificationEmailJobData {
  type: 'verification';
  to: string;
  token: string;
}

export interface PasswordResetEmailJobData {
  type: 'password-reset';
  to: string;
  token: string;
}

export interface WelcomeEmailJobData {
  type: 'welcome';
  to: string;
  displayName?: string | null;
}

export interface StudentApprovalEmailJobData {
  type: 'student-approval';
  to: string;
}

export interface StudentRejectionEmailJobData {
  type: 'student-rejection';
  to: string;
  reason: string;
}

export interface LandlordApprovalEmailJobData {
  type: 'landlord-approval';
  to: string;
}

export interface LandlordRejectionEmailJobData {
  type: 'landlord-rejection';
  to: string;
  reason: string;
}

export interface ProviderContactEmailJobData {
  type: 'provider-contact';
  to: string;
  studentName: string;
  studentEmail: string;
  message: string;
  listingTitle?: string;
}

export type EmailJobData =
  | VerificationEmailJobData
  | PasswordResetEmailJobData
  | WelcomeEmailJobData
  | StudentApprovalEmailJobData
  | StudentRejectionEmailJobData
  | LandlordApprovalEmailJobData
  | LandlordRejectionEmailJobData
  | ProviderContactEmailJobData;

  