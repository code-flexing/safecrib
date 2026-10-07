"use client";

import { useRouter } from "next/navigation";
import { VerificationOverview } from "@/components/verification/VerificationOverview";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { SettingsSection, SettingsSectionDivider } from "@/components/settings/SettingsSection";
import { Button } from "@/components/ui/Button";

export function VerificationContent() {
  const router = useRouter();

  return (
    <>
      <VerificationOverview />

      <SettingsSectionDivider />

      <SettingsSection title="Verification actions" description="Submit or review your verification documents.">
        <SettingsRow label="Student profile" description="Complete your student profile for verification." />
        <SettingsRow label="Provider page" description="Set up your provider page for agent verification." />
        <div className="flex gap-3">
          <Button onClick={() => router.push("/profile/complete")} className="w-fit">
            Complete student profile
          </Button>
          <Button onClick={() => router.push("/page/new")} variant="secondary" className="w-fit">
            Manage provider page
          </Button>
        </div>
      </SettingsSection>
    </>
  );
}
