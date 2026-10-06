"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, authenticatedFetch, clearSession, unwrapData } from "@/lib/api";
import { errorMessage, SupportConversation, supportTimestamp, unwrapSupportList } from "@/lib/support";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { BackHomeLink } from "@/components/ui/BackHomeLink";
import { Icon } from "@/components/ui/Icon";

export default function SupportPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<SupportConversation[]>([]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    try {
      const identity = unwrapData<{ role?: string }>(await authenticatedFetch<unknown>("/api/v1/auth/me", { method: "POST" }));
      const role = String(identity.role ?? "").toUpperCase();
      if (!["STUDENT", "AGENT", "LANDLORD", "ADMIN"].includes(role)) {
        setConversations([]);
        setError("");
        return;
      }
      const response = unwrapData<unknown>(await authenticatedFetch<unknown>("/api/v1/support/conversations"));
      setConversations(unwrapSupportList(response));
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) { clearSession(); router.replace("/login?reason=session-expired"); return; }
      setError(errorMessage(loadError, "We could not load your support conversations."));
    } finally { setLoading(false); }
  }, [router]);

  useEffect(() => {
    if (!localStorage.getItem("safecrib_access_token")) { router.replace("/login"); return; }
    void load();
    const interval = window.setInterval(() => void load(), 12000);
    return () => window.clearInterval(interval);
  }, [load, router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    const trimmedSubject = subject.trim();
    if (!trimmedMessage) { setError("Describe the issue before sending."); return; }
    if (trimmedMessage.length > 5000) { setError("Your message must be 5,000 characters or fewer."); return; }
    if (trimmedSubject.length > 160) { setError("Your subject must be 160 characters or fewer."); return; }
    setSending(true); setError(""); setSuccess("");
    try {
      const response = await authenticatedFetch<unknown>("/api/v1/support/conversations", { method: "POST", body: JSON.stringify({ subject: trimmedSubject || undefined, message: trimmedMessage }) });
      const conversation = unwrapData<SupportConversation>(response);
      setSubject(""); setMessage(""); setSuccess("Your support request was sent.");
      await load();
      if (conversation?.id) router.push(`/support/${encodeURIComponent(conversation.id)}`);
    } catch (sendError) {
      if (sendError instanceof ApiError && sendError.status === 401) { clearSession(); router.replace("/login?reason=session-expired"); return; }
      setError(sendError instanceof ApiError && sendError.status === 403 ? "Your request was not sent. Support access is not enabled for this account yet." : sendError instanceof ApiError && sendError.status === 429 ? "Too many requests. Please try again later." : errorMessage(sendError, "We could not send your support request."));
    } finally { setSending(false); }
  };

  return (
    <main className="min-h-screen bg-[#f1f7f6] px-4 pb-24 pt-8 sm:px-8 md:pb-8">
      <DashboardNav onCreatePage={() => router.push("/page/new")} pageStatus="none" />
      <section className="mx-auto max-w-6xl">
        <BackHomeLink />

        <header className="support-enter mt-6 flex flex-col justify-between gap-6 border-b border-black/10 pb-7 sm:flex-row sm:items-center">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-safecrib-green">SafeCrib support</p>
            <h1 className="mt-3 text-3xl font-medium text-safecrib-black sm:text-4xl">A real person is here to help.</h1>
            <p className="mt-3 text-sm leading-6 text-black/60">Send us a note or pick up an existing conversation. Your message stays connected to your account.</p>
          </div>
          <svg aria-hidden="true" viewBox="0 0 240 150" className="h-32 w-52 shrink-0 self-center sm:h-36 sm:w-60">
            <path d="M27 30c0-11 9-20 20-20h109c11 0 20 9 20 20v49c0 11-9 20-20 20H91l-28 20v-20H47c-11 0-20-9-20-20V30Z" fill="#dff2e9" />
            <path d="M100 62c0-10 8-18 18-18h76c10 0 18 8 18 18v36c0 10-8 18-18 18h-12v17l-23-17h-41c-10 0-18-8-18-18V62Z" fill="#dce9f8" stroke="#3b82f6" strokeOpacity=".32" strokeWidth="2" />
            <path d="M55 47h91M55 64h67M120 74h69M120 89h48" stroke="#0c7355" strokeLinecap="round" strokeWidth="5" />
            <circle cx="188" cy="28" r="8" fill="#f4c430" />
            <circle cx="207" cy="42" r="4" fill="#0c7355" opacity=".55" />
          </svg>
        </header>

        <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
          <form onSubmit={submit} className="support-enter rounded-[8px] border border-black/10 bg-white p-5 sm:p-7">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-safecrib-green/10 text-safecrib-green"><Icon name="support" /></span>
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-safecrib-green">New conversation</p><h2 className="mt-1 text-xl font-medium text-safecrib-black">Tell us what&apos;s going on</h2><p className="mt-1 text-sm leading-6 text-black/55">We&apos;ll keep your message and replies together here.</p></div>
            </div>

            <label className="mt-6 block text-sm font-medium text-safecrib-black">Subject <span className="font-normal text-black/45">(optional)</span>
              <input maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What do you need help with?" className="mt-2 w-full rounded-lg border border-black/15 bg-white px-4 py-3 font-normal text-safecrib-black placeholder:text-black/35 focus:border-safecrib-green focus:outline-none" />
            </label>
            <label className="mt-5 block text-sm font-medium text-safecrib-black">Message
              <textarea required maxLength={5000} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Share a few details so we can help." className="mt-2 w-full resize-y rounded-lg border border-black/15 bg-white px-4 py-3 font-normal text-safecrib-black placeholder:text-black/35 focus:border-safecrib-green focus:outline-none" />
              <span className="mt-1 block text-right text-xs font-normal text-black/45">{message.length}/5000</span>
            </label>
            {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800" role="alert">{error}</p>}
            {success && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-900" role="status">{success}</p>}
            <button type="submit" disabled={sending} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-safecrib-green px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0a5f47] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
              <Icon name="support" className="h-4 w-4" />{sending ? "Sending..." : "Send to support"}
            </button>
          </form>

          <section aria-labelledby="support-history-title" className="support-enter support-enter--later overflow-hidden rounded-[8px] border border-black/10 bg-white">
            <div className="flex items-center justify-between gap-4 border-b border-black/10 px-5 py-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-black/45">Your inbox</p><h2 id="support-history-title" className="mt-1 text-lg font-medium text-safecrib-black">Conversations</h2></div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e5eef9] text-[#1d4ed8]"><Icon name="page" className="h-4 w-4" /></span>
            </div>
            {loading ? <p className="p-5 text-sm text-black/55" role="status">Loading conversations...</p> : conversations.length === 0 ? <div className="px-5 py-10 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-safecrib-green/10 text-safecrib-green"><Icon name="support" className="h-5 w-5" /></span><p className="mt-4 text-sm font-medium text-safecrib-black">Nothing here yet</p><p className="mt-1 text-sm leading-6 text-black/55">Your support replies will appear here.</p></div> : <div className="divide-y divide-black/10">{conversations.map((conversation) => <Link key={conversation.id} href={`/support/${encodeURIComponent(conversation.id)}`} className="block p-5 transition-colors hover:bg-[#f7faf8]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium text-safecrib-black">{conversation.subject || "Support request"}</p><p className="mt-2 line-clamp-2 text-sm leading-6 text-black/60">{conversation.latestMessage?.body || conversation.messages?.[conversation.messages.length - 1]?.body || "Open conversation"}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${conversation.status === "OPEN" ? "bg-emerald-100 text-emerald-800" : "bg-black/5 text-black/55"}`}>{conversation.status}</span></div><p className="mt-3 text-xs text-black/45">{supportTimestamp(conversation.lastMessageAt ?? conversation.createdAt)}</p></Link>)}</div>}
          </section>
        </div>
      </section>
    </main>
  );
}
