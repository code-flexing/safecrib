import type { IconName } from "@/components/ui/Icon";

export type SettingsCategoryKey =
  | "personal"
  | "account"
  | "appearance"
  | "notifications"
  | "security"
  | "verification"
  | "help"
  | "logout";

export type SettingsUserRole = "user" | "agent" | "admin";

export type SettingsCategory = {
  id: SettingsCategoryKey;
  label: string;
  icon: IconName;
  description: string;
  route: string;
  visibleFor: SettingsUserRole[];
};

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "personal",
    label: "Personal information",
    icon: "user",
    description: "Your profile photo, display name, and username.",
    route: "/settings/personal",
    visibleFor: ["user", "agent", "admin"],
  },
  {
    id: "account",
    label: "Account",
    icon: "info",
    description: "Email, account mode, and connected details.",
    route: "/settings/account",
    visibleFor: ["user", "agent", "admin"],
  },
  {
    id: "appearance",
    label: "Appearance",
    icon: "moon",
    description: "Choose how SafeCrib looks.",
    route: "/settings/appearance",
    visibleFor: ["user", "agent", "admin"],
  },
  {
    id: "notifications",
    label: "Notifications",
    icon: "bell",
    description: "Phone alerts and notification preferences.",
    route: "/settings/notifications",
    visibleFor: ["user", "agent", "admin"],
  },
  {
    id: "security",
    label: "Security",
    icon: "key",
    description: "Password, sessions, and account protection.",
    route: "/settings/security",
    visibleFor: ["user", "agent", "admin"],
  },
  {
    id: "verification",
    label: "Verification",
    icon: "check-circle",
    description: "Identity and provider verification status.",
    route: "/settings/verification",
    visibleFor: ["user", "agent", "admin"],
  },
  {
    id: "help",
    label: "Help and support",
    icon: "help-circle",
    description: "Get help and contact SafeCrib support.",
    route: "/settings/help",
    visibleFor: ["user", "agent", "admin"],
  },
  {
    id: "logout",
    label: "Log out",
    icon: "logout",
    description: "Sign out of your SafeCrib account.",
    route: "/settings/logout",
    visibleFor: ["user", "agent", "admin"],
  },
];

const categoryById = new Map(SETTINGS_CATEGORIES.map((category) => [category.id, category]));

export function getSettingsCategory(id: SettingsCategoryKey): SettingsCategory | undefined {
  return categoryById.get(id);
}

export function isCategoryVisible(category: SettingsCategory, userRole: string): boolean {
  const role = userRole.toUpperCase();
  if (role === "ADMIN") return category.visibleFor.includes("admin");
  if (["AGENT", "LANDLORD"].includes(role)) return category.visibleFor.includes("agent");
  return category.visibleFor.includes("user");
}

export const SETTINGS_CATEGORY_ALIASES: Record<string, SettingsCategoryKey> = {
  profile: "personal",
};
