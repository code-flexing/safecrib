"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
type MediaSlide = { type: "video"; url: string } | { type: "image"; url: string };

function photoUrl(photo: string | { url?: string }) {
  return typeof photo === "string" ? photo : photo.url;
}

function timeAgo(iso: string) {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

/** Uses the same verification source + badge the rest of the app already uses. */
function UserVerificationBadge({ userId }: { userId: string }) {
  const [verification, setVerification] = useState<VerificationStageResult | null>(null);
  useEffect(() => {
    let active = true;
    setVerification(normalizeVerificationStage(getPersistedVerification(userId)));
    void cachedApiFetch<unknown>(`/api/v1/trust/users/${encodeURIComponent(userId)}/verification-stage`)
      .then((response) => {
        const stage = normalizeVerificationStage(response);
        if (!stage || !active) return;
        setPersistedVerification(userId, response);
        setVerification(stage);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [userId]);
  return verification ? <VerificationBadge verification={verification} compact iconOnly /> : null;
}

const chevronProps = { "aria-hidden": true, viewBox: "0 0 24 24", className: "h-5 w-5", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

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
  const [taggedUsers, setTaggedUsers] = useState<MentionCandidate[]>([]);
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [commentError, setCommentError] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [modal, setModal] = useState<"contact" | "booking" | null>(null);
  const [contactMessage, setContactMessage] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportType, setReportType] = useState<ReportType>("FAKE_LISTING");
  const [reportDescription, setReportDescription] = useState("");
  const [slideIndex, setSlideIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

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

  /* ---------- media: video first (if any), then photos ---------- */
  const hasVideo = Boolean(listing?.video?.mediaId || listing?.video?.url);
  const slides = useMemo<MediaSlide[]>(() => {
    if (!listing) return [];
    const photoUrls = (listing.photos ?? []).map(photoUrl).filter((url): url is string => Boolean(url));
    const images = photoUrls.length ? photoUrls : (listing.images ?? []).filter(Boolean);
    const list: MediaSlide[] = [];
    if (hasVideo) list.push({ type: "video", url: videoUrl });
    images.forEach((url) => list.push({ type: "image", url }));
    return list;
  }, [listing, hasVideo, videoUrl]);
  const activeIndex = Math.min(slideIndex, Math.max(slides.length - 1, 0));
  const activeSlide = slides[activeIndex];
  const goToSlide = (next: number) => setSlideIndex(Math.max(0, Math.min(slides.length - 1, next)));

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
      if (replyParentId) setExpandedThreads((current) => new Set(current).add(replyParentId));
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
  const focusComposer = () => {
    document.getElementById("home-comment")?.focus();
  };

  /* ---------- location: text + map (coordinates first, text address as fallback) ---------- */
  const addressText = listing?.address?.trim() ?? "";
  const campusText = listing?.campus?.trim() ?? "";
  const landmarkText = listing?.locationReference?.trim() ?? "";
  const hasCoordinates = typeof listing?.lat === "number" && typeof listing.lng === "number";
  const textQuery = [addressText, campusText].filter(Boolean).join(", ");
  const mapQuery = hasCoordinates ? `${listing!.lat},${listing!.lng}` : textQuery;
  const mapUrl = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed` : "";
  const openMapUrl = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : "";

  /* ---------- comments ---------- */
  const rootComments = comments.filter((comment) => !comment.parentId);
  const repliesOf = (parentId: string) =>
    comments.filter((candidate) => candidate.parentId === parentId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const expandThread = (threadId: string, open: boolean) =>
    setExpandedThreads((current) => {
      const next = new Set(current);
      if (open) next.add(threadId); else next.delete(threadId);
      return next;
    });

  const renderComment = (item: ListingComment, depth = 0): ReactNode => {
    const replies = repliesOf(item.id);
    const expanded = expandedThreads.has(item.id);
    const visibleReplies = expanded ? replies : replies.slice(0, 1);
    const hiddenCount = replies.length - visibleReplies.length;
    const isAuthor = Boolean(listing?.ownerId && item.user.id === listing.ownerId);
    return <li key={item.id} className="py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold text-safecrib-black"><UserName user={item.user} size="sm" showHandle={true} /></span>
        <UserVerificationBadge userId={item.user.id} />
        {isAuthor && <span className="rounded-md bg-safecrib-green/10 px-1.5 py-0.5 text-[11px] font-semibold text-safecrib-green">Author</span>}
      </div>
      {item.body && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-black/70">{item.body}</p>}
      {item.mentions?.length ? <p className="mt-1 text-xs text-black/45">Tagged: {item.mentions.map((mention) => `@${mention.user.username ?? mention.user.displayName ?? "member"}`).join(", ")}</p> : null}
      <div className="mt-1.5 flex items-center gap-3 text-xs text-black/45">
        <time dateTime={item.createdAt}>{timeAgo(item.createdAt)}</time>
        <button type="button" onClick={() => { setReplyParentId(item.id); setCommentBody(""); setCommentError(""); focusComposer(); }} className="font-semibold text-black/55 hover:text-safecrib-green">Reply</button>
      </div>
      {visibleReplies.length > 0 && <ul className={`mt-2 ${depth < 2 ? "ml-3 border-l-2 border-black/10 pl-3 sm:ml-5" : ""}`}>{visibleReplies.map((reply) => renderComment(reply, depth + 1))}</ul>}
      {hiddenCount > 0 && <button type="button" onClick={() => expandThread(item.id, true)} className={`mt-1 flex items-center gap-2 text-xs font-semibold text-black/55 hover:text-safecrib-green ${depth < 2 ? "ml-3 sm:ml-5" : ""}`}>
        <span aria-hidden="true" className="h-px w-6 bg-black/25" />View {hiddenCount} more {hiddenCount === 1 ? "reply" : "replies"}
      </button>}
      {expanded && replies.length > 1 && <button type="button" onClick={() => expandThread(item.id, false)} className={`mt-1 flex items-center gap-2 text-xs font-semibold text-black/45 hover:text-safecrib-green ${depth < 2 ? "ml-3 sm:ml-5" : ""}`}>
        <span aria-hidden="true" className="h-px w-6 bg-black/25" />Hide replies
      </button>}
    </li>;
  };

  const price = listing?.discountedPrice ?? listing?.price;
  const isProvider = ["AGENT", "LANDLORD"].includes(role);

  return <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
    <DashboardNav onCreatePage={openPage} pageStatus={pageStatus} canManagePage={false} />
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <BackHomeLink label="Back to homes" />
      {listing ? <article className="mt-5 grid gap-4 lg:h-[min(48rem,calc(100vh-9rem))] lg:min-h-[34rem] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">

        {/* ---------- LEFT: media carousel (video first, then photos) ---------- */}
        <div
          className="relative aspect-square overflow-hidden rounded-xl bg-black shadow-[0_18px_40px_rgba(11,12,14,0.08)] lg:aspect-auto lg:h-full"
          tabIndex={0}
          role="region"
          aria-roledescription="carousel"
          aria-label="Home photos and video"
          onKeyDown={(event) => { if (event.key === "ArrowLeft") goToSlide(activeIndex - 1); if (event.key === "ArrowRight") goToSlide(activeIndex + 1); }}
          onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
          onTouchEnd={(event) => {
            const start = touchStartX.current;
            touchStartX.current = null;
            const end = event.changedTouches[0]?.clientX;
            if (start === null || end === undefined) return;
            const delta = end - start;
            if (Math.abs(delta) > 50) goToSlide(activeIndex + (delta < 0 ? 1 : -1));
          }}
        >
          {activeSlide?.type === "video" && (activeSlide.url
            ? <video key={activeSlide.url} src={activeSlide.url} controls playsInline preload="metadata" className="h-full w-full bg-black object-contain" />
            : <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-white/70">Video is not available yet. Refresh the listing to try again.</div>)}
          {activeSlide?.type === "image" && <Image key={activeSlide.url} src={activeSlide.url} alt={`${listing.title ?? "Home"} photo ${hasVideo ? activeIndex : activeIndex + 1}`} fill priority={activeIndex === 0} sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />}
          {!activeSlide && <div className="flex h-full w-full items-center justify-center text-sm text-white/60">No photos or video yet.</div>}

          {slides.length > 1 && <>
            <span className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white" aria-live="polite">{activeIndex + 1}/{slides.length}</span>
            {activeIndex > 0 && <button type="button" onClick={() => goToSlide(activeIndex - 1)} aria-label="Previous" className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><svg {...chevronProps}><path d="m15 18-6-6 6-6" /></svg></button>}
            {activeIndex < slides.length - 1 && <button type="button" onClick={() => goToSlide(activeIndex + 1)} aria-label="Next" className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><svg {...chevronProps}><path d="m9 18 6-6-6-6" /></svg></button>}
            <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
              {slides.map((slide, index) => <button key={`${slide.type}-${index}`} type="button" onClick={() => goToSlide(index)} aria-label={`Go to ${slide.type === "video" ? "video" : `photo ${hasVideo ? index : index + 1}`}`} aria-current={index === activeIndex} className={`pointer-events-auto h-1.5 rounded-full transition-all ${index === activeIndex ? "w-4 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"}`} />)}
            </div>
          </>}
        </div>

        {/* ---------- RIGHT: details, location, then comments ---------- */}
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-[0_18px_40px_rgba(11,12,14,0.05)] lg:h-full">
          <div className="min-h-0 px-5 pb-2 pt-5 lg:flex-1 lg:overflow-y-auto">
            {/* provider */}
            <div className="flex flex-wrap items-center gap-2 text-sm text-black/60">
              {listing.ownerId
                ? <Link href={`/profile/${encodeURIComponent(listing.ownerId)}`} className="font-medium text-safecrib-green hover:underline"><UserName user={listing.provider} size="sm" showHandle={true} /></Link>
                : <span><UserName user={listing.provider} size="sm" showHandle={true} /></span>}
              {providerVerification && <VerificationBadge verification={providerVerification} compact iconOnly />}
              <span className="ml-auto text-xs font-semibold text-safecrib-green">Verified home</span>
            </div>
            {providerBadgeUnavailable && <p className="mt-1 text-xs text-amber-800" role="status">Provider verification badge is temporarily unavailable.</p>}

            {/* main info */}
            <h1 className="mt-4 text-2xl font-medium text-safecrib-black">{listing.title ?? "Untitled home"}</h1>
            <p className="mt-2 text-xl font-medium text-safecrib-black">{typeof price === "number" ? `₦${price.toLocaleString()}` : "Price available on request"}</p>
            {typeof listing.discountAmount === "number" && listing.discountAmount > 0 && <p className="mt-0.5 text-sm text-black/50">Base price ₦{listing.price?.toLocaleString()}</p>}
            <p className="mt-1 text-xs text-black/45">{listing.viewCount ?? 0} views · {likeCount} likes</p>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-black/65">{listing.description ?? "No description provided."}</p>

            {/* location */}
            <section className="mt-6" aria-label="Home location">
              <h2 className="text-base font-semibold text-safecrib-black">Location</h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-black/10">
                <div className="flex items-start gap-3 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-safecrib-green/10 text-safecrib-green">
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.5" /></svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-safecrib-black">{addressText || campusText || "Location available on request"}</p>
                    {addressText && campusText && addressText.toLowerCase() !== campusText.toLowerCase() && <p className="mt-0.5 text-sm text-black/55">Near {campusText}</p>}
                    {landmarkText && <p className="mt-0.5 text-sm text-black/55">Landmark: {landmarkText}</p>}
                  </div>
                  {openMapUrl && <a href={openMapUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full border border-black/15 px-3 py-1.5 text-xs font-semibold text-safecrib-green transition hover:bg-safecrib-green/5">Open in Maps</a>}
                </div>
                {mapUrl && <iframe title="Home location map" src={mapUrl} loading="lazy" className="h-52 w-full border-0 border-t border-black/10" referrerPolicy="no-referrer-when-downgrade" />}
              </div>
            </section>

            {/* actions */}
            <div className="mt-6 flex flex-wrap gap-2">
              <Button type="button" onClick={() => gate("book this home")}>Book this home</Button>
              {!isProvider && <Button type="button" variant="secondary" onClick={() => void toggleBookmark()}>{bookmarked ? "Saved" : "Save"}</Button>}
              <Button type="button" variant="secondary" onClick={() => gate("contact the provider")}>Contact provider</Button>
              <Button type="button" variant="secondary" onClick={() => setReportOpen(true)}>Report listing</Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-black/10 pt-3">
              <button type="button" onClick={() => void toggleLike()} disabled={!listing.ownerId || likePending} aria-pressed={liked} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${liked ? "bg-safecrib-green/10 font-semibold text-safecrib-green" : "text-black/65 hover:bg-black/[0.04]"}`}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 11h9.2a3 3 0 0 0 2.9-2.2l2-7A3 3 0 0 0 18.2 8H14l.7-3.2A2.4 2.4 0 0 0 12.4 2L7 10v11Z" /></svg> Like <span>{likeCount}</span>
              </button>
              <button type="button" onClick={() => { document.getElementById("comments")?.scrollIntoView({ behavior: "smooth", block: "start" }); focusComposer(); }} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-black/65 transition hover:bg-black/[0.04]">
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z" /></svg> Comment
              </button>
              <button type="button" onClick={() => void toggleRecommendation()} disabled={role !== "STUDENT" || !listing.ownerId || !recommendationStateLoaded || recommendationPending} aria-pressed={recommended} title={role === "STUDENT" ? "Recommend this provider to students" : "Student accounts can recommend providers"} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${recommended ? "bg-amber-100 font-semibold text-amber-800" : "text-black/65 hover:bg-black/[0.04]"}`}>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m13 2-3 8h7l-6 12 2-9H6l7-11Z" /></svg> Recommend provider <span>{recommendationCount}</span>
              </button>
            </div>

            {/* comments */}
            <section id="comments" className="mt-5 scroll-mt-2 border-t border-black/10 pt-5" aria-labelledby="home-comments-title">
              <h2 id="home-comments-title" className="text-base font-semibold text-safecrib-black">Comments ({comments.length})</h2>
              {commentError && <p role="alert" className="mt-3 text-sm text-red-700">{commentError}</p>}
              <ul className="mt-2 divide-y divide-black/10">
                {rootComments.map((comment) => renderComment(comment))}
                {!comments.length && !commentError && <li className="py-4 text-sm text-black/50">No comments yet. Start the conversation.</li>}
              </ul>
            </section>
          </div>

          {/* composer, pinned to the bottom of the panel */}
          <div className="border-t border-black/10 bg-white p-3">
            {mentionCandidates.length > 0 && <ul aria-label="Tag a user" className="mb-2 max-h-40 overflow-auto rounded-lg border border-black/10 bg-white shadow-lg">{mentionCandidates.map((person) => <li key={person.id}><button type="button" onClick={() => selectMention(person)} className="w-full px-4 py-2 text-left text-sm hover:bg-safecrib-green/5"><UserName user={person} size="sm" showHandle={true} /> <span className="text-xs text-black/45">{person.role?.toLowerCase()}</span></button></li>)}</ul>}
            {replyParentId && <div className="mb-2 flex items-center justify-between rounded-md bg-black/[0.04] px-3 py-1.5 text-xs text-black/60">
              <span>Replying to a comment</span>
              <button type="button" onClick={() => setReplyParentId(null)} className="font-semibold text-safecrib-green hover:underline">Cancel</button>
            </div>}
            <label htmlFor="home-comment" className="sr-only">{replyParentId ? "Write a reply" : "Write a comment about this home"}</label>
            <div className="flex items-end gap-2">
              <textarea id="home-comment" value={commentBody} onChange={(event) => updateCommentBody(event.target.value)} maxLength={1000} rows={2} placeholder={replyParentId ? "Write a reply..." : "Ask a question or tag someone with @..."} className="min-h-[3rem] w-full resize-none rounded-lg border border-black/15 px-3 py-2 text-sm text-safecrib-black focus:border-safecrib-green focus:outline-none" />
              <Button type="button" loading={commentSubmitting} onClick={() => void submitComment()}>{replyParentId ? "Reply" : "Post"}</Button>
            </div>
            <p className="mt-1 text-right text-xs text-black/40">{commentBody.length}/1000</p>
          </div>
        </aside>
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