"use client";

import { useRouter } from "next/navigation";
import { logoutSession } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useState } from "react";

export function LogoutContent() {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    setSigningOut(true);
    void logoutSession().finally(() => {
      setSigningOut(false);
      router.replace("/login");
    });
  };

  return (
    <div>
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-100">
          <Icon name="logout" className="h-6 w-6 text-red-700" />
        </div>
        <div>
          <h3 className="font-semibold text-safecrib-black">Sign out of SafeCrib</h3>
          <p className="mt-1 text-sm text-black/55">
            You will be signed out of your account on this device.
          </p>
        </div>
      </div>

      <Button
        onClick={() => setConfirmOpen(true)}
        variant="secondary"
        className="border-red-300 text-red-700 hover:bg-red-50"
      >
        Sign out
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title="Sign out?"
        message="Are you sure you want to sign out? Any unsaved changes will be lost."
        confirmLabel="Sign out"
        cancelLabel="Cancel"
        onResult={(action) => {
          if (action === "confirm") {
            setConfirmOpen(false);
            void handleSignOut();
          } else {
            setConfirmOpen(false);
          }
        }}
      />

      {signingOut && <p className="mt-4 text-sm text-black/55">Signing out…</p>}
    </div>
  );
}
