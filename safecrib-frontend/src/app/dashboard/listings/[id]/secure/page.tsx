"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export default function SecureCheckoutPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const token = typeof window !== 'undefined' ? localStorage.getItem('safecrib_access_token') : null;
  const { showToast } = useToast();
  const id = params?.id;
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<{ total?: number } | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!token || !id) return;
    async function load() {
      try {
        const res = await fetch(`/api/backend/listings/${id}/secure-quote`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("quote_failed");
        const q = await res.json();
        setQuote(q);
      } catch (e) {
        showToast("Unable to load checkout details.", "error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, id, showToast]);

  async function handlePay() {
    if (!token || !id || !accepted || paying) return;
    setPaying(true);
    try {
      const res = await fetch(`/api/backend/bookings/${id}/payment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "pay_failed");
      }
      const data = await res.json();
      if (data?.authorizationUrl) {
        // Redirect the browser to Paystack's hosted checkout
        window.location.href = data.authorizationUrl;
        return;
      }
      // Reused existing payment — poll the verify endpoint instead
      router.push(`/dashboard/checkout/result?reference=${encodeURIComponent(data?.reference || '')}&bookingId=${encodeURIComponent(id)}`);
    } catch (e) {
      showToast("Payment initiation failed.", "error");
    } finally {
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 md:px-6 lg:px-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 rounded bg-black/5" />
          <div className="h-48 rounded-xl bg-black/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 md:px-6 lg:px-8">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-black/10 bg-white/80 p-6 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-zinc-900/70">
            <h1 className="text-xl font-semibold">Secure accommodation</h1>
            <p className="mt-2 text-sm text-black/60 dark:text-white/60">You pay securely. Money is held by SafeCribs until confirmed.</p>
          </div>
        </div>
        <div className="space-y-4">
          <div className="sticky top-6 rounded-2xl border border-black/10 bg-white/90 p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900/80">
            <h2 className="text-base font-semibold">Order summary</h2>
            {quote && (
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Total</span>
                  <span>₦{((quote.total ?? 0) / 100).toLocaleString()}</span>
                </div>
              </div>
            )}
            <label className="mt-4 flex items-start gap-2 text-xs">
              <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5" />
              <span>I accept the terms and conditions</span>
            </label>
            <Button className="mt-4 w-full" disabled={!accepted || paying} onClick={handlePay}>
              {paying ? "Processing..." : "Pay now"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}