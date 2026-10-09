"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { UserName } from "@/components/common/UserName";
import { BackHomeLink } from "@/components/ui/BackHomeLink";
import { RestrictedActionModal } from "@/components/dashboard/RestrictedActionModal";
import { normalizeVerificationStage, VerificationBadge, type VerificationStageResult } from "@/components/verification/VerificationBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { apiFetch, cachedApiFetch, getPersistedVerification, normalizeAccountStatus, normalizePageStatus, resolveMediaUrl, setPersistedVerification, unwrapData, type AccountStatus, type PageStatus } from "@/lib/api";

type Listing = { id: string; ownerId?: string; title?: string; description?: string; price?: number; discountAmount?: number; discountedPrice?: number; address?: string; campus?: string; lat?: number; lng?: number; locationReference?: string; photos?: (string | { url?: string })[]; images?: string[]; video?: { mediaId?: string; url?: string } | null; providerId?: string; providerPageId?: string; likeCount?: number; viewCount?: number; likedByCurrentUser?: boolean; providerRecommendationCount?: number; provider?: { id?: string; displayName?: string; username?: string | null; email?: string } };
type Profile = { id?: string; role?: string; studentProfileStatus?: unknown };
type ProviderPage = { status?: string } | null;
type ReportType = "FAKE_LISTING" | "MISREPRESENTED" | "DOUBLE_BOOKING" | "SCAM_AGENT" | "OTHER";
type ListingComment = {
  id: string;
  body: string;
  parentId?: string | null;
  createdAt: string;
  user: { id: string; displayName?: string | null; username?: string | null; role?: string };
  mentions?: Array<{ user: { id: string; displayName?: string | null; username?: string | null } }>;
};
type MentionCandidate = { id: string; displayName?: string | null; username?: string | null; role?: string };

function photoUrl(photo: string | { url?: string }) {
  return typeof photo === "string" ? photo : photo.url;
}

export default function ListingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [providerVerification, setProviderVerification] = useState<VerificationStageResult | null>(null);
  const [providerBadgeUnavailable, setProviderBadgeUnavailable] = useState(false);
  const [role, setRole] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [accountStatus, setAccountStatus] = useState<AccountStatus>("not_submitted");
  const [pageStatus, setPageStatus] = useState<PageStatus>("none");
  const [message, setMessage] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likePending, setLikePending] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [recommendationCount, setRecommendationCount] = useState(0);
  const [recommended, setRecommended] = useState(false);
  const [recommendationStateLoaded, setRecommendationStateLoaded] = useState(false);
  const [recommendationPending, setRecommendationPending] = useState(false);
  const [comments, setComments] = useState<ListingComment[]>([]);
  const [commentBody, setCommentBody] = useState("");
  const [commentMentionIds, setCommentMentionIds] = useState<string[]>([]);
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [commentError, setCommentError] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [modal, setModal] = useState<"contact" | "booking" | null>(null);
  const [contactMessage, setContactMessage] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("FAKE_LISTING");
  const [reportDescription, setReportDescription] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("safecrib_access_token")) { router.replace("/login"); return; }
    void Promise.all([
      cachedApiFetch<unknown>(`/api/v1/listings/${id}`),
      apiFetch<Profile>("/api/v1/users/me"),
      cachedApiFetch<unknown>("/api/v1/provider-pages/me").catch(() => null),
      cachedApiFetch<unknown>(`/api/v1/listings/${encodeURIComponent(id)}/comments`).catch(() => null),
    ]).then(async ([homeResponse, userResponse, pageResponse, commentsResponse]) => {
      const home = unwrapData<Listing>(homeResponse);
      const user = unwrapData<Profile>(userResponse);
      const page = unwrapData<ProviderPage>(pageResponse);
      setListing(home);
      setLiked(home.likedByCurrentUser === true);
      setLikeCount(home.likeCount ?? 0);
      setRecommendationCount(home.providerRecommendationCount ?? 0);
      if (commentsResponse) setComments(unwrapData<ListingComment[]>(commentsResponse));
      else setCommentError("We could not load home comments. Please refresh to retry.");
      if (home.ownerId) {
        const verificationPath = `/api/v1/trust/users/${encodeURIComponent(home.ownerId)}/verification-stage`;
        setProviderVerification(normalizeVerificationStage(getPersistedVerification(home.ownerId)));
        void cachedApiFetch<unknown>(verificationPath)
          .then((response) => {
            const stage = normalizeVerificationStage(response);
            if (stage) setPersistedVerification(home.ownerId, response);
            if (stage) setProviderVerification(stage);
          })
          .catch(() => {
            if (!getPersistedVerification(home.ownerId)) {
              setProviderVerification(null);
              setProviderBadgeUnavailable(true);
            }
          });
      }
      const accountRole = String(user.role ?? "").toUpperCase();
      const providerRole = ["AGENT", "LANDLORD"].includes(accountRole);
      setRole(accountRole);
      if (accountRole === "STUDENT") {
        void apiFetch<string[]>("/api/v1/trust/me/recommendations")
          .then((response) => {
            setRecommended(unwrapData<string[]>(response).includes(home.ownerId ?? ""));
            setRecommendationStateLoaded(true);
          })
          .catch(() => setMessage("We could not load your provider recommendations."));
      }
      setPageStatus(normalizePageStatus(page?.status));
      const [studentStatus, bookmarks] = await Promise.all([
        accountRole === "STUDENT" ? apiFetch<unknown>("/api/v1/student-profiles/status").catch(() => null) : Promise.resolve(null),
        accountRole === "STUDENT" ? apiFetch<Listing[]>("/api/v1/listings/bookmarks").catch(() => []) : Promise.resolve([]),
      ]);
      const persistedStatus = typeof user.studentProfileStatus === "object" && user.studentProfileStatus !== null && "status" in user.studentProfileStatus
        ? user.studentProfileStatus.status
        : studentStatus && typeof studentStatus === "object" && "status" in studentStatus ? studentStatus.status : studentStatus;
      setAccountStatus(providerRole ? (String(page?.status ?? "").toUpperCase() === "VERIFIED" ? "approved" : "pending") : normalizeAccountStatus(persistedStatus));
      setBookmarked(Array.isArray(bookmarks) && bookmarks.some((saved) => saved.id === home.id));
      const mediaUrl = home.video?.url ?? await resolveMediaUrl(home.video?.mediaId);
      setVideoUrl(mediaUrl ?? "");
    });
  }, [id, router]);

  const gate = (action: string) => {
    if (["AGENT", "LANDLORD"].includes(role) && pageStatus === "approved") { setModal(action === "contact the provider" ? "contact" : "booking"); return; }
    if (accountStatus === "pending" || accountStatus === "not_submitted") setMessage(`Your account is still under review. You'll be able to ${action} once it's approved.`);
    else if (accountStatus === "rejected") setMessage("Your account submission wasn't approved. Please update and resubmit your profile.");
    else setModal(action === "contact the provider" ? "contact" : "booking");
  };
  const toggleBookmark = async () => {
    if (accountStatus !== "approved") { gate("save this listing"); return; }
    try {
      await apiFetch(`/api/v1/listings/${id}/bookmark`, { method: bookmarked ? "DELETE" : "POST" });
      setBookmarked((current) => !current);
    } catch { setMessage("We could not update your saved listings. Please try again."); }
  };
  const toggleLike = async () => {
    if (likePending) return;
    setLikePending(true);
    try {
      await apiFetch(`/api/v1/listings/${encodeURIComponent(id)}/like`, { method: liked ? "DELETE" : "POST" });
      setLiked((current) => !current);
      setLikeCount((count) => Math.max(0, count + (liked ? -1 : 1)));
    } catch {
      setMessage("We could not update your like. Please try again.");
    } finally {
      setLikePending(false);
    }
  };
  const toggleRecommendation = async () => {
    if (!listing?.ownerId || recommendationPending) return;
    setRecommendationPending(true);
    try {
      await apiFetch(`/api/v1/trust/users/${encodeURIComponent(listing.ownerId)}/recommendation`, { method: recommended ? "DELETE" : "POST" });
      setRecommended((current) => !current);
      setRecommendationCount((count) => Math.max(0, count + (recommended ? -1 : 1)));
    } catch {
      setMessage("We could not update your recommendation. Please try again.");
    } finally {
      setRecommendationPending(false);
    }
  };
  const submitComment = async () => {
    const body = commentBody.trim();
    if (!body || body.length > 1000) {
      setCommentError("Write a comment up to 1,000 characters.");
      return;
    }
    setCommentSubmitting(true);
    setCommentError("");
    try {
      const response = await apiFetch<ListingComment>(`/api/v1/listings/${encodeURIComponent(id)}/comments`, {
        method: "POST",
        body: JSON.stringify({
          body,
          parentId: replyParentId ?? undefined,
          mentionUserIds: commentMentionIds,
        }),
      });
      setComments((current) => [unwrapData<ListingComment>(response), ...current]);
      setCommentBody("");
      setCommentMentionIds([]);
      setReplyParentId(null);
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : "We could not post your comment.");
    } finally {
      setCommentSubmitting(false);
    }
  };
  const updateCommentBody = (value: string) => {
    setCommentBody(value);
    setCommentMentionIds((current) => current.filter((mentionId) => {
      const person = taggedUsers.find((user) => user.id === mentionId);
      const handle = person?.username ?? "";
      return person ? value.toLocaleLowerCase().includes(`@${handle.toLocaleLowerCase()}`) : false;
    }));
    const match = value.match(/(?:^|\s)@([^@\n]*)$/);
    if (!match) {
      setMentionCandidates([]);
      return;
    }
    const query = (match[1] ?? "").trim();
    if (!query) {
      setMentionCandidates([]);
      return;
    }
    void apiFetch<{ users: MentionCandidate[] }>(`/api/v1/users/discover?q=${encodeURIComponent(query)}`)
      .then((response) => setMentionCandidates(unwrapData<{ users: MentionCandidate[] }>(response).users.slice(0, 5)))
      .catch(() => setMentionCandidates([]));
  };
  const [taggedUsers, setTaggedUsers] = useState<MentionCandidate[]>([]);
  const selectMention = (person: MentionCandidate) => {
    const mentionStart = commentBody.lastIndexOf("@");
    const handle = person.username ?? person.displayName ?? "member";
    setCommentBody(`${commentBody.slice(0, mentionStart)}@${handle} `);
    setCommentMentionIds((current) => current.includes(person.id) ? current : [...current, person.id]);
    setTaggedUsers((current) => current.some((item) => item.id === person.id) ? current : [...current, person]);
    setMentionCandidates([]);
  };
  const submitContact = async () => {
    const providerId = listing?.providerPageId ?? listing?.providerId ?? listing?.provider?.id;
    if (!providerId || !contactMessage.trim()) { setMessage("A provider and message are required to send an email."); return; }
    setSubmitting(true);
    try {
      await apiFetch(`/api/v1/provider-pages/${providerId}/contact`, { method: "POST", body: JSON.stringify({ message: contactMessage.trim(), listingId: id }) });
      setModal(null); setContactMessage(""); setMessage("Your email was sent to the provider.");
    } catch { setMessage("We could not send your email. Please try again."); }
    finally { setSubmitting(false); }
  };
  const submitBooking = async () => {
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) { setMessage("Enter a valid deposit amount."); return; }
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/bookings", { method: "POST", body: JSON.stringify({ listingId: id, depositAmount: amount }) });
      setModal(null); setDepositAmount(""); setMessage("Your booking hold was created.");
    } catch { setMessage("We could not create this booking. Please try again."); }
    finally { setSubmitting(false); }
  };
  const submitReport = async () => {
    if (reportDescription.trim().length < 10 || reportDescription.trim().length > 2000) { setMessage("Describe the concern in 10 to 2,000 characters."); return; }
    setSubmitting(true);
    try {
      await apiFetch("/api/v1/fraud/reports", { method: "POST", body: JSON.stringify({ targetListingId: id, type: reportType, description: reportDescription.trim() }) });
      setReportOpen(false);
      setReportDescription("");
      setMessage("Your report was sent for review. Submitting a report does not automatically remove this listing.");
    } catch (reportError) {
      setMessage(reportError instanceof Error ? reportError.message : "We could not send your report. Please try again.");
    } finally { setSubmitting(false); }
  };
  const openPage = () => router.push(pageStatus === "none" ? "/page/new" : "/page");
  const image = listing?.photos?.[0] ? photoUrl(listing.photos[0]) : listing?.images?.[0];
  const mapUrl = typeof listing?.lat === "number" && typeof listing.lng === "number" ? `https://www.google.com/maps?q=${encodeURIComponent(`${listing.lat},${listing.lng}`)}&output=embed` : "";

  return <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
    <DashboardNav onCreatePage={openPage} pageStatus={pageStatus} canManagePage={false} />
    <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-8">
      <BackHomeLink label="Back to homes" />
      {listing ? <article className="mt-6 overflow-hidden rounded-[12px] border border-black/10 bg-white shadow-[0_18px_40px_rgba(11,12,14,0.05)]">
        {image && <Image src={image} alt={listing.title ?? "Listing"} width={1200} height={700} className="max-h-[28rem] w-full object-cover" />}
        <div className="p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-safecrib-green">Verified home</p>
          <h1 className="mt-2 text-3xl font-medium text-safecrib-black">{listing.title ?? "Untitled home"}</h1>
          <p className="mt-4 text-2xl font-medium text-safecrib-black">{typeof (listing.discountedPrice ?? listing.price) === "number" ? `₦${(listing.discountedPrice ?? listing.price)!.toLocaleString()}` : "Price available on request"}</p>
          {typeof listing.discountAmount === "number" && listing.discountAmount > 0 && <p className="mt-1 text-sm text-black/50">Base price ₦{listing.price?.toLocaleString()}</p>}
          <p className="mt-2 text-sm text-black/55">{listing.address ?? listing.campus ?? "Location available on request"}</p>
          <p className="mt-2 text-xs text-black/45">{listing.viewCount ?? 0} views · {likeCount} likes</p>
          <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-black/65">{listing.description ?? "No description provided."}</p>
          {listing.photos && listing.photos.length > 1 && <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{listing.photos.slice(1).map((photo, index) => {
            const url = photoUrl(photo);
            return url ? <Image key={`${url}-${index}`} src={url} alt={`${listing.title ?? "Home"} photo ${index + 2}`} width={500} height={360} className="aspect-[4/3] w-full object-cover" /> : null;
          })}</div>}
          {mapUrl && <section className="mt-7" aria-label="Home location"><h2 className="mb-3 text-lg font-medium">Location</h2><iframe title="Home location map" src={mapUrl} loading="lazy" className="h-64 w-full border-0" referrerPolicy="no-referrer-when-downgrade" /></section>}
          {listing.video?.mediaId && <section className="mt-7" aria-label="Home video"><h2 className="mb-3 text-lg font-medium">Home video</h2>{videoUrl ? <video src={videoUrl} controls preload="metadata" className="max-h-[28rem] w-full bg-black" /> : <p className="text-sm text-black/55">Video is not available yet. Refresh the listing to try again.</p>}</section>}
          <p className="mt-6 flex flex-wrap items-center gap-2 text-sm text-black/60">
            Provider: {listing.ownerId
              ? <Link href={`/profile/${encodeURIComponent(listing.ownerId)}`} className="font-medium text-safecrib-green hover:underline"><UserName user={listing.provider} size="sm" showHandle={true} /></Link>
              : <span><UserName user={listing.provider} size="sm" showHandle={true} /></span>}
            {providerVerification && <VerificationBadge verification={providerVerification} compact iconOnly />}
          </p>
          {providerBadgeUnavailable && <p className="mt-1 text-xs text-amber-800" role="status">Provider verification badge is temporarily unavailable.</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <Button type="button" onClick={() => gate("book this home")}>Book this home</Button>
            {!(["AGENT", "LANDLORD"].includes(role)) && <Button type="button" variant="secondary" onClick={() => void toggleBookmark()}>{bookmarked ? "Saved" : "Save"}</Button>}
            <Button type="button" variant="secondary" onClick={() => gate("contact the provider")}>Contact provider</Button>
            <Button type="button" variant="secondary" onClick={() => setReportOpen(true)}>Report listing</Button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-black/10 pt-4">
            <button type="button" onClick={() => void toggleLike()} disabled={!listing.ownerId || likePending} aria-pressed={liked} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${liked ? "bg-safecrib-green/10 font-semibold text-safecrib-green" : "text-black/65 hover:bg-black/[0.04]"}`}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 11h9.2a3 3 0 0 0 2.9-2.2l2-7A3 3 0 0 0 18.2 8H14l.7-3.2A2.4 2.4 0 0 0 12.4 2L7 10v11Z" /></svg> Like <span>{likeCount}</span>
            </button>
            <a href="#comments" className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-black/65 transition hover:bg-black/[0.04]">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /></svg> Comment
            </a>
            <button type="button" onClick={() => void toggleRecommendation()} disabled={role !== "STUDENT" || !listing.ownerId || !recommendationStateLoaded || recommendationPending} aria-pressed={recommended} title={role === "STUDENT" ? "Recommend this provider to students" : "Student accounts can recommend providers"} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${recommended ? "bg-amber-100 font-semibold text-amber-800" : "text-black/65 hover:bg-black/[0.04]"}`}>
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m13 2-3 8h7l-6 12 2-9H6l7-11Z" /></svg> Recommend provider <span>{recommendationCount}</span>
            </button>
          </div>
          <section id="comments" className="mt-7 border-t border-black/10 pt-6" aria-labelledby="home-comments-title">
            <h2 id="home-comments-title" className="text-lg font-semibold text-safecrib-black">Home comments</h2>
            <p className="mt-1 text-xs text-black/50">Comments support text and tagged members.</p>
            <label htmlFor="home-comment" className="sr-only">{replyParentId ? "Write a reply" : "Write a comment about this home"}</label>
            <textarea id="home-comment" value={commentBody} onChange={(event) => updateCommentBody(event.target.value)} maxLength={1000} rows={3} placeholder={replyParentId ? "Write a reply..." : "Ask a question or share a helpful note..."} className="mt-4 w-full rounded-lg border border-black/15 px-4 py-3 text-sm text-safecrib-black focus:border-safecrib-green focus:outline-none" />
            {mentionCandidates.length > 0 && <ul aria-label="Tag a user" className="mt-2 max-h-44 overflow-auto rounded-lg border border-black/10 bg-white shadow-lg">{mentionCandidates.map((person) => <li key={person.id}><button type="button" onClick={() => selectMention(person)} className="w-full px-4 py-2 text-left text-sm hover:bg-safecrib-green/5"><UserName user={person} size="sm" showHandle={true} /> <span className="text-xs text-black/45">{person.role?.toLowerCase()}</span></button></li>)}</ul>}
            {replyParentId && <button type="button" onClick={() => setReplyParentId(null)} className="mt-2 text-xs font-medium text-safecrib-green hover:underline">Cancel reply</button>}
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-black/45">{commentBody.length}/1000</span>
              <Button type="button" loading={commentSubmitting} onClick={() => void submitComment()}>{replyParentId ? "Post reply" : "Post comment"}</Button>
            </div>
            {commentError && <p role="alert" className="mt-3 text-sm text-red-700">{commentError}</p>}
            <ul className="mt-5 divide-y divide-black/10">
              {comments.filter((comment) => !comment.parentId).map((comment) => {
                const renderComment = (item: ListingComment, depth = 0): React.ReactNode => {
                  const replies = comments.filter((candidate) => candidate.parentId === item.id);
                  const isCreatorReply = Boolean(item.parentId && item.user.id === listing.ownerId);
return <li key={item.id} className="py-4" style={{ marginLeft: `${Math.min(depth, 5) * 16}px` }}>
                      <p className="text-sm font-semibold text-safecrib-black">
                        <UserName user={item.user} size="sm" showHandle={true} />
                        {isCreatorReply && <span className="ml-2 font-bold text-safecrib-green">Creator</span>}
                        <time className="ml-2 text-xs font-normal text-black/45">{new Date(item.createdAt).toLocaleDateString()}</time>
                     </p>
                     {item.body && <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-black/65">{item.body}</p>}
                     {item.mentions?.length ? <p className="mt-2 text-xs text-black/45">Tagged: {item.mentions.map((mention) => `@${mention.user.username ?? mention.user.displayName ?? "member"}`).join(", ")}</p> : null}
                    <button type="button" onClick={() => { setReplyParentId(item.id); setCommentBody(""); setCommentError(""); document.getElementById("home-comment")?.focus(); }} className="mt-2 text-xs font-semibold text-safecrib-green hover:underline">Reply</button>
                    {replies.length > 0 && <ul className="mt-2 divide-y divide-black/10 border-l-2 border-black/10 pl-3">{replies.map((reply) => renderComment(reply, depth + 1))}</ul>}
                  </li>;
                };
                return renderComment(comment);
              })}
              {!comments.length && !commentError && <li className="py-4 text-sm text-black/50">No comments yet. Start the conversation.</li>}
            </ul>
          </section>
        </div>
      </article> : <p className="mt-8 text-sm text-black/60">Loading listing details...</p>}
    </section>
    <RestrictedActionModal message={message} onClose={() => setMessage(null)} />
    <Modal open={modal === "contact"} onClose={() => setModal(null)} titleId="contact-provider-title">
      <h2 id="contact-provider-title" className="text-xl font-medium text-safecrib-black">Email provider</h2>
      <p className="mt-3 text-sm leading-6 text-black/60">Your message will be sent to the provider by email.</p>
      <textarea value={contactMessage} onChange={(event) => setContactMessage(event.target.value)} rows={5} placeholder="Write your message" className="mt-4 w-full rounded-[8px] border border-black/15 px-4 py-3 text-sm text-safecrib-black focus:border-safecrib-green focus:outline-none" />
      <Button type="button" loading={submitting} onClick={() => void submitContact()} className="mt-4">Send email</Button>
    </Modal>
    <Modal open={modal === "booking"} onClose={() => setModal(null)} titleId="booking-title">
      <h2 id="booking-title" className="text-xl font-medium text-safecrib-black">Book this home</h2>
      <p className="mt-3 text-sm leading-6 text-black/60">Enter the deposit amount in the backend&apos;s minor currency unit.</p>
      <input inputMode="numeric" type="number" min="1" value={depositAmount} onChange={(event) => setDepositAmount(event.target.value)} placeholder="Deposit amount" className="mt-4 w-full rounded-[8px] border border-black/15 px-4 py-3 text-sm text-safecrib-black focus:border-safecrib-green focus:outline-none" />
      <Button type="button" loading={submitting} onClick={() => void submitBooking()} className="mt-4">Create booking hold</Button>
    </Modal>
    <Modal open={reportOpen} onClose={() => setReportOpen(false)} titleId="report-listing-title">
      <h2 id="report-listing-title" className="text-xl font-medium text-safecrib-black">Report this listing</h2>
      <p className="mt-3 text-sm leading-6 text-black/60">Reports are reviewed by SafeCrib. Sending one does not immediately hide the home.</p>
      <label className="mt-4 block text-sm font-medium">Concern<select value={reportType} onChange={(event) => setReportType(event.target.value as ReportType)} className="mt-2 w-full border border-black/15 bg-white px-4 py-3"><option value="FAKE_LISTING">Fake listing</option><option value="MISREPRESENTED">Misrepresented</option><option value="DOUBLE_BOOKING">Double booking</option><option value="SCAM_AGENT">Scam agent</option><option value="OTHER">Other</option></select></label>
      <label className="mt-4 block text-sm font-medium">Details<textarea minLength={10} maxLength={2000} rows={5} value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} className="mt-2 w-full border border-black/15 px-4 py-3 text-sm" /></label>
      <p className="mt-1 text-right text-xs text-black/45">{reportDescription.length}/2,000</p>
      <Button type="button" loading={submitting} onClick={() => void submitReport()} className="mt-4">Send report</Button>
    </Modal>
  </main>;
}