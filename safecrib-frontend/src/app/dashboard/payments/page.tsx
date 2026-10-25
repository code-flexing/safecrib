"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function PaymentsPage() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('safecrib_access_token') : null;
  const [payments, setPayments] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    async function load() {
      try {
        const res = await fetch("/api/backend/users/me/payments", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setPayments(data);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 pt-6">
      <h1 className="text-xl font-semibold">Payments</h1>
      {loading ? (
        <p className="mt-4 text-sm text-black/60">Loading...</p>
      ) : payments.length === 0 ? (
        <p className="mt-4 text-sm text-black/60">No payments yet.</p>
      ) : (
        <div className="mt-4 divide-y divide-black/5 rounded-xl border border-black/10">
          {payments.map((p) => (
            <div key={String(p.id)} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">{String(p.listingTitle || "Home")}</p>
                <p className="text-xs text-black/50">₦{((Number(p.amountMinor)||0)/100).toLocaleString()} • {String(p.status)}</p>
              </div>
              {Boolean(p.receiptId) && (
                <Link href={`/dashboard/payments/${String(p.receiptId)}/receipt`} className="text-sm text-safecrib-green">View receipt</Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
