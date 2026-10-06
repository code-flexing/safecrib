"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, authenticatedFetch, clearSession, unwrapData } from "@/lib/api";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { errorMessage, SupportConversation, supportTimestamp } from "@/lib/support";

export default function SupportConversationPage() {
  const { id: encodedId } = useParams<{ id: string }>();
  const id = decodeURIComponent(encodedId);
  const router = useRouter();
  const [conversation, setConversation] = useState<SupportConversation | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = unwrapData<SupportConversation>(await authenticatedFetch<unknown>(`/api/v1/support/conversations/${encodeURIComponent(id)}`));
      setConversation(response);
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) { clearSession(); router.replace("/login?reason=session-expired"); return; }
      setError(loadError instanceof ApiError && loadError.status === 404 ? "This conversation is unavailable." : errorMessage(loadError, "We could not load this conversation."));
    } finally { setLoading(false); }
  }, [id, router]);

  useEffect(() => {
    if (!localStorage.getItem("safecrib_access_token")) { router.replace("/login"); return; }
    void load();
    const interval = window.setInterval(() => void load(), 12000);
    return () => window.clearInterval(interval);
  }, [load, router]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) { setError("Write a message before sending."); return; }
    if (trimmed.length > 5000) { setError("Your message must be 5,000 characters or fewer."); return; }
    setSending(true); setError("");
    try {
      await authenticatedFetch(`/api/v1/support/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ message: trimmed }) });
      setMessage("");
      await load();
    } catch (sendError) {
      if (sendError instanceof ApiError && sendError.status === 401) { clearSession(); router.replace("/login?reason=session-expired"); return; }
      if (sendError instanceof ApiError && (sendError.status === 409 || sendError.status === 400)) { setError(sendError.message || "This conversation is resolved. Start a new conversation for a new issue."); await load(); }
      else setError(sendError instanceof ApiError && sendError.status === 429 ? "Too many requests. Please try again later." : errorMessage(sendError, "We could not send your message."));
    } finally { setSending(false); }
  };

  if (loading) return <main className="min-h-screen px-4 pb-24 pt-8 md:pb-8"><DashboardNav onCreatePage={() => router.push("/page/new")} pageStatus="none" /><p className="mt-8 text-sm text-black/55">Loading conversation...</p></main>;
  if (!conversation) return <main className="min-h-screen px-4 pb-24 pt-8 md:pb-8"><DashboardNav onCreatePage={() => router.push("/page/new")} pageStatus="none" /><Link href="/support" className="mt-8 inline-block text-sm font-medium text-safecrib-green hover:underline">Back to support</Link><p className="mt-6 text-sm text-red-600">{error}</p></main>;
  const messages = conversation.messages ?? [];
  const resolved = conversation.status === "RESOLVED";

  return <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] px-4 pb-24 pt-8 sm:px-8 md:pb-8"><DashboardNav onCreatePage={() => router.push("/page/new")} pageStatus="none" /><section className="mx-auto max-w-3xl"><Link href="/support" className="text-sm font-medium text-safecrib-green hover:underline">Back to support</Link><div className="mt-6 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-safecrib-green">Support conversation</p><h1 className="mt-2 text-3xl font-medium">{conversation.subject || "Support request"}</h1></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${resolved ? "bg-black/5 text-black/55" : "bg-emerald-100 text-emerald-800"}`}>{conversation.status}</span></div><div className="mt-8 space-y-4">{messages.map((item) => <article key={item.id} className={`max-w-[90%] rounded-[8px] border p-4 ${item.senderRole === "USER" ? "border-safecrib-green/20 bg-safecrib-green/[0.06]" : "ml-auto border-black/10 bg-white"}`}><p className="whitespace-pre-wrap break-words text-sm leading-6">{item.body}</p><p className="mt-3 text-xs text-black/45">{item.senderRole === "ADMIN" ? "Support team" : "You"} · {supportTimestamp(item.createdAt)}</p></article>)}</div>{resolved ? <p className="mt-8 rounded-[8px] border border-black/10 bg-white p-4 text-sm text-black/60">This conversation is resolved. Start a new support request if you need more help.</p> : <form onSubmit={send} className="mt-8 rounded-[8px] border border-black/10 bg-white p-5"><label className="block text-sm font-medium">Reply<textarea required maxLength={5000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} className="mt-2 w-full rounded-[8px] border border-black/15 px-4 py-3 font-normal focus:border-safecrib-green focus:outline-none" /><span className="mt-1 block text-right text-xs font-normal text-black/45">{message.length}/5000</span></label>{error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}<button type="submit" disabled={sending} className="mt-4 rounded-[4px] bg-safecrib-green px-5 py-3 text-sm font-medium text-white disabled:opacity-40">{sending ? "Sending..." : "Send reply"}</button></form>}</section></main>;
}
