export interface NotificationTemplate {
  key: string;
  label: string;
  title: string;
  message: string;
  link?: string;
}

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  {
    key: "complete-verification",
    label: "Please complete your verification",
    title: "Complete your profile verification",
    message: "Hi there! We noticed your profile verification is still pending. Please finish submitting your details so we can verify your account and unlock your full SafeCribs experience.",
    link: "/profile/complete",
  },
  {
    key: "listing-needs-updates",
    label: "Your listing needs updates",
    title: "Listing needs a few updates",
    message: "Thanks for sharing your listing. We reviewed it and found a couple of details that need adjusting before it can go live. Please update the listing and resubmit for review.",
    link: "/dashboard",
  },
  {
    key: "reviewing-report",
    label: "We are reviewing your report",
    title: "Report received — under review",
    message: "Thank you for reporting this concern. SafeCribs is reviewing your report along with any supporting details. We will follow up once the investigation is complete.",
    link: "/support",
  },
  {
    key: "booking-reminder",
    label: "Reminder: respond to your booking",
    title: "Booking reminder",
    message: "You have an active booking that needs your attention. Please check your booking details and respond to the student within 24 hours to keep your listing active.",
    link: "/dashboard",
  },
];

export function getNotificationTemplate(key: string | undefined): NotificationTemplate | null {
  if (!key) return null;
  return NOTIFICATION_TEMPLATES.find((template) => template.key === key) ?? null;
}

export const INTERNAL_LINK_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "(none)", value: "" },
  { label: "User dashboard", value: "/dashboard" },
  { label: "Profile page", value: "/profile" },
  { label: "Verification page", value: "/profile/complete" },
  { label: "Provider page", value: "/page" },
];
