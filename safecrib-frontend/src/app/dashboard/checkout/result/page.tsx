"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import Link from "next/link";

export default function CheckoutResultPage() {
  const params = useSearchParams();
  const router = useRouter();
  const reference = params.get("reference");
  const bookingId = params.get("bookingId");
  const [status, setStatus] = useState<"confirming" | "success" | "failed">("confirming");
  const [message, setMessage] = useState("Confirming your payment...");

  useEffect(() => {
    if (!reference) {
      setStatus("failed");
      setMessage("Missing payment reference.");
      return;
    }
    const token = typeof window !== "undefined" ? localStorage.getItem("safecrib_access_token") : null;
    if (!token) {
      router.push("/login");
      return;
    }

    let cancelled = false;
    async function verify() {
      try {
        const res = await fetch(`/api/backend/payments/verify?reference=${encodeURIComponent(reference!)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && data?.status === "success") {
          setStatus("success");
          setMessage("Payment received");
        } else {
          setStatus("failed");
          setMessage(data?.message || "Payment could not be verified yet. It may still be processing.");
        }
      } catch {
        if (cancelled) return;
        setStatus("failed");
        setMessage("Unable to verify payment. Please try again.");
      }
    }
    verify();
    return () => { cancelled = true; };
  }, [reference, router]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-20 pt-10 text-center">
      <h1 className="text-2xl font-semibold">Payment confirmation</h1>
      {status === "confirming" && <p className="mt-4 text-black/60">{message}</p>}
      {status === "success" && (
        <div className="mt-6 space-y-4">
          <p className="text-lg">Payment received</p>
          <div className="flex justify-center gap-3">
            <Link href="/dashboard/payments"><Button variant="secondary">View payments</Button></Link>
            <Link href="/dashboard"><Button>Back to home</Button></Link>
          </div>
        </div>
      )}
      {status === "failed" && (
        <div className="mt-6 space-y-4">
          <p className="text-red-600">{message}</p>
          <div className="flex justify-center gap-3">
            <Button variant="secondary" onClick={() => router.push("/dashboard/payments")}>View payments</Button>
            <Button onClick={() => router.push("/dashboard")}>Back to home</Button>
          </div>
        </div>
      )}
    </div>
  );
}