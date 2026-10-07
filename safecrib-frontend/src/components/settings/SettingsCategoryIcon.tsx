"use client";

import { Icon } from "@/components/ui/Icon";
import type { SettingsCategory } from "@/lib/settings-config";

export function SettingsCategoryIcon({ category }: { category: SettingsCategory }) {
  return <Icon name={category.icon as never} className="h-5 w-5" />;
}
