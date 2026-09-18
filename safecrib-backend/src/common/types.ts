export type ProfileTier = 'STUDENT' | 'LANDLORD';
export type ReviewType = 'SIGNUP' | 'CREATE_PAGE';
export type ProfileStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ReviewDecision = 'APPROVED' | 'REJECTED';
export type SubmissionEntityType = 'student_profile' | 'provider_page';

export interface PayoutAccount {
  provider: string;
  accountName: string;
  accountNumber: string;
}

export interface StudentProfileSubmission {
  displayName?: string | null;
  proofOfStudentship: string;
  schoolOfStudy: string;
  courseOfStudy: string;
  level: string;
  profilePicture: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  phoneNumber?: string | null;
  emergencyContact?: string | null;
  socialLinks?: Record<string, string> | null;
}

export interface ProviderProfileSubmission {
  displayName: string;
  proofOfLicense: string;
  payoutAccounts: PayoutAccount[];
  profilePicture: string;
  businessName?: string | null;
  businessRegNumber?: string | null;
  businessAddress?: string | null;
  additionalContacts?: string[] | null;
  socialLinks?: Record<string, string> | null;
  fraudFlags?: string[];
}

export type ProfileSubmissionData = StudentProfileSubmission | ProviderProfileSubmission;

export interface SubmissionRecord {
  id: string;
  email: string;
  tier: ProfileTier;
  reviewType: ReviewType;
  status: ProfileStatus;
  entityType: SubmissionEntityType;
  entityId: string;
  submittedData: ProfileSubmissionData;
  reviewNotes?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  submittedAt: string;
  createdAt: string;
}
