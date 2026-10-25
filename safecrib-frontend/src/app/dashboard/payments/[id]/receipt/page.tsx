"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/Button";

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const token = typeof window !== 'undefined' ? localStorage.getItem('safecrib_access_token') : null;
  const id = params?.id;
  const [receipt, setReceipt] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !id) return;
    async function load() {
      try {
        const res = await fetch(`/api/backend/receipts/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          setReceipt(await res.json());
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, id]);

  if (loading) return <div className="mx-auto max-w-2xl px-4 pt-6">Loading...</div>;
  if (!receipt) return <div className="mx-auto max-w-2xl px-4 pt-6">Receipt not found</div>;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-20 pt-6 print:max-w-full">
      <div className="rounded-2xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Receipt</h1>
          <span className="text-sm text-black/60">{String(receipt.receiptNumber ?? '')}</span>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><span>Total</span><span>₦{((Number(receipt.totalMinor)||0)/100).toLocaleString()} {String(receipt.currency ?? 'NGN')}</span></div>
          <div className="flex justify-between"><span>Paystack Ref</span><span>{String(receipt.paystackReference ?? '')}</span></div>
        </div>
        <div className="mt-6 flex gap-2 print:hidden">
          <Button onClick={() => window.print()}>Print</Button>
        </div>
      </div>
    </div>
  );
}
