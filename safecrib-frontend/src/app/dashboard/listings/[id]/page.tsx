"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { UserName } from "@/components/common/UserName";
import { RestrictedActionModal } from "@/components/dashboard/RestrictedActionModal";
import { normalizeVerificationStage, VerificationBadge, type VerificationStageResult } from "@/components/verification/VerificationBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { apiFetch, cachedApiFetch, getPersistedVerification, normalizeAccountStatus, normalizePageStatus, resolveMediaUrl, setPersistedVerification, unwrapData, type AccountStatus, type PageStatus } from "@/lib/api";
import { ListingComments } from "@/components/comments";

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
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

/* ---------- icons ---------- */
const ICONS = {
  back: "m12 19-7-7 7-7M19 12H5",
  heart: "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z",
  comment: "M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z",
  bolt: "M13 2 3 14h9l-1 8 10-12h-9l1-8z",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm18 3-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",
  bookmark: "m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z",
  flag: "M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7",
  pin: "M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  play: "M6 3l14 9-14 9V3z",
  pause: "M6 4h4v16H6zM14 4h4v16h-4z",
  volume: "M11 5 6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14",
  muted: "M11 5 6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6",
  maximize: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3",
  minimize: "M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3",
  chevronLeft: "m15 18-6-6 6-6",
  chevronRight: "m9 18 6-6-6-6",
} as const;

function Icon({ d, className = "h-5 w-5", filled = false, strokeWidth = 1.8 }: { d: string; className?: string; filled?: boolean; strokeWidth?: number }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

function ActionButton({ label, onClick, disabled, pressed, tone, count, children }: { label: string; onClick: () => void; disabled?: boolean; pressed?: boolean; tone: string; count?: number; children: ReactNode }) {
  return <button type="button" title={label} aria-label={label} aria-pressed={pressed} onClick={onClick} disabled={disabled} className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition hover:bg-black/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-safecrib-green disabled:cursor-not-allowed disabled:opacity-50 ${tone}`}>
    {children}
    {count !== undefined && <span className="tabular-nums">{count}</span>}
  </button>;
}

/* ---------- custom video player ---------- */
const SPEEDS = [1, 1.5, 2, 0.5];

function VideoPlayer({ src, reserveBottom }: { src: string; reserveBottom: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const revealControls = () => {
    setControlsVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setControlsVisible(false);
    }, 2500);
  };
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined); else video.pause();
    revealControls();
  };
  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };
  const cycleSpeed = () => {
    const video = videoRef.current;
    if (!video) return;
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length] ?? 1;
    video.playbackRate = next;
    setSpeed(next);
  };
  const toggleFullscreen = () => {
    const video = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) { void document.exitFullscreen(); return; }
    if (wrapRef.current?.requestFullscreen) void wrapRef.current.requestFullscreen().catch(() => undefined);
    else video?.webkitEnterFullscreen?.();
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;
  const visible = controlsVisible || !playing;
  const controlButton = "flex h-9 w-9 items-center justify-center rounded-full text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";

  return <div ref={wrapRef} className="group relative h-full w-full bg-black" onMouseMove={revealControls} onMouseLeave={() => { if (playing) setControlsVisible(false); }}>
    <video
      ref={videoRef}
      src={src}
      playsInline
      preload="metadata"
      className="h-full w-full cursor-pointer object-contain"
      onClick={togglePlay}
      onPlay={() => { setPlaying(true); revealControls(); }}
      onPause={() => { setPlaying(false); setControlsVisible(true); }}
      onEnded={() => { setPlaying(false); setControlsVisible(true); }}
      onTimeUpdate={(event) => setCurrent(event.currentTarget.currentTime)}
      onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
    />
    {!playing && <button type="button" onClick={togglePlay} aria-label="Play video" className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 pl-1 text-safecrib-black shadow-lg transition hover:scale-105 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
      <Icon d={ICONS.play} className="h-7 w-7" filled strokeWidth={1} />
    </button>}
    <div data-no-swipe className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-3 pt-12 transition-opacity duration-200 ${reserveBottom ? "pb-8" : "pb-3"} ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={current}
        onChange={(event) => { const video = videoRef.current; if (video) { video.currentTime = Number(event.target.value); setCurrent(video.currentTime); } }}
        aria-label="Seek"
        className="block h-3 w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow"
        style={{ background: `linear-gradient(to right, #ffffff ${progress}%, rgba(255,255,255,0.3) ${progress}%) center / 100% 4px no-repeat` }}
      />
      <div className="mt-1 flex items-center gap-1 text-white">
        <button type="button" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} className={controlButton}><Icon d={playing ? ICONS.pause : ICONS.play} className="h-5 w-5" filled strokeWidth={1} /></button>
        <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className={controlButton}><Icon d={muted ? ICONS.muted : ICONS.volume} /></button>
        <span className="ml-1 text-xs font-medium tabular-nums text-white/90">{formatTime(current)} / {formatTime(duration)}</span>
        <button type="button" onClick={cycleSpeed} aria-label={`Playback speed ${speed}x`} className="ml-auto h-9 rounded-full px-3 text-xs font-semibold tabular-nums text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">{speed}x</button>
        <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"} className={controlButton}><Icon d={fullscreen ? ICONS.minimize : ICONS.maximize} /></button>
      </div>
    </div>
  </div>;
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
  const [commentCount, setCommentCount] = useState(0);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
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
      if (commentsResponse) {
        const list = unwrapData<ListingComment[]>(commentsResponse);
        setComments(list);
        setCommentCount(list.length);
      } else {
        setCommentError("We could not load home comments. Please refresh to retry.");
      }
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
  const goBack = () => { if (window.history.length > 1) router.back(); else router.push("/dashboard"); };
  useEffect(() => {
    if (!commentsOpen) return;
    const focusCommentField = () => {
      const textarea = document.querySelector<HTMLTextAreaElement>('textarea[id^="home-comment"]');
      textarea?.focus();
    };
    window.requestAnimationFrame(focusCommentField);
  }, [commentsOpen]);

  /* ---------- location: text + map (coordinates first, text address as fallback) ---------- */
  const addressText = listing?.address?.trim() ?? "";
  const campusText = listing?.campus?.trim() ?? "";
  const landmarkText = listing?.locationReference?.trim() ?? "";
  const hasCoordinates = typeof listing?.lat === "number" && typeof listing.lng === "number";
  const textQuery = [addressText, campusText].filter(Boolean).join(", ");
  const mapQuery = hasCoordinates ? `${listing!.lat},${listing!.lng}` : textQuery;
  const mapUrl = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed` : "";
  const openMapUrl = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : "";

  const price = listing?.discountedPrice ?? listing?.price;
  const isProvider = ["AGENT", "LANDLORD"].includes(role);

  return <main className="min-h-screen bg-[linear-gradient(180deg,#ffffff_0%,#f5f7f2_100%)] pb-24 md:pb-8">
    <DashboardNav onCreatePage={openPage} pageStatus={pageStatus} canManagePage={false} />
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
      <button type="button" onClick={goBack} aria-label="Back to homes" title="Back to homes" className="flex h-10 w-10 items-center justify-center rounded-full border border-safecrib-green/25 bg-safecrib-green/10 text-safecrib-green transition hover:bg-safecrib-green/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-safecrib-green">
        <Icon d={ICONS.back} />
      </button>
      {listing ? <article className="mt-5 grid gap-4 lg:h-[min(48rem,calc(100vh-9rem))] lg:min-h-[34rem] lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">

        {/* ---------- LEFT: media carousel (video first, then photos) ---------- */}
        <div
          className="relative aspect-square overflow-hidden rounded-xl bg-black shadow-[0_18px_40px_rgba(11,12,14,0.08)] lg:aspect-auto lg:h-full"
          tabIndex={0}
          role="region"
          aria-roledescription="carousel"
          aria-label="Home photos and video"
          onKeyDown={(event) => {
            if ((event.target as HTMLElement).tagName === "INPUT") return;
            if (event.key === "ArrowLeft") goToSlide(activeIndex - 1);
            if (event.key === "ArrowRight") goToSlide(activeIndex + 1);
          }}
          onTouchStart={(event) => {
            if ((event.target as HTMLElement).closest("[data-no-swipe]")) { touchStartX.current = null; return; }
            touchStartX.current = event.touches[0]?.clientX ?? null;
          }}
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
            ? <VideoPlayer key={activeSlide.url} src={activeSlide.url} reserveBottom={slides.length > 1} />
            : <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-white/70">Video is not available yet. Refresh the listing to try again.</div>)}
          {activeSlide?.type === "image" && <Image key={activeSlide.url} src={activeSlide.url} alt={`${listing.title ?? "Home"} photo ${hasVideo ? activeIndex : activeIndex + 1}`} fill priority={activeIndex === 0} sizes="(min-width: 1024px) 55vw, 100vw" className="object-cover" />}
          {!activeSlide && <div className="flex h-full w-full items-center justify-center text-sm text-white/60">No photos or video yet.</div>}

          {slides.length > 1 && <>
            <span className="absolute right-3 top-3 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white" aria-live="polite">{activeIndex + 1}/{slides.length}</span>
            {activeIndex > 0 && <button type="button" onClick={() => goToSlide(activeIndex - 1)} aria-label="Previous" className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><Icon d={ICONS.chevronLeft} strokeWidth={2.2} /></button>}
            {activeIndex < slides.length - 1 && <button type="button" onClick={() => goToSlide(activeIndex + 1)} aria-label="Next" className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><Icon d={ICONS.chevronRight} strokeWidth={2.2} /></button>}
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
            <p className="mt-1 text-xs text-black/45">{listing.viewCount ?? 0} views</p>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-black/65">{listing.description ?? "No description provided."}</p>

            {/* location */}
            <section className="mt-6" aria-label="Home location">
              <h2 className="text-base font-semibold text-safecrib-black">Location</h2>
              <div className="mt-3 overflow-hidden rounded-xl border border-black/10">
                <div className="flex items-start gap-3 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-safecrib-green/10 text-safecrib-green"><Icon d={ICONS.pin} /></span>
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

            {/* primary action + icon actions */}
            <Button type="button" onClick={() => gate("secure this accommodation")} className="mt-6 w-full">Secure accommodation</Button>
            <div className="mt-3 flex items-center justify-between border-t border-black/10 pt-2">
              <div className="flex items-center">
                <ActionButton label={liked ? "Unlike" : "Like"} onClick={() => void toggleLike()} disabled={!listing.ownerId || likePending} pressed={liked} tone="text-red-500" count={likeCount}>
                  <Icon d={ICONS.heart} className="h-[22px] w-[22px]" filled={liked} />
                </ActionButton>
                <ActionButton label="Comments" onClick={() => setCommentsOpen(true)} tone="text-black/65" count={commentCount}>
                  <Icon d={ICONS.comment} className="h-[22px] w-[22px]" />
                </ActionButton>
                <ActionButton label={role === "STUDENT" ? (recommended ? "Remove recommendation" : "Recommend this provider") : "Student accounts can recommend providers"} onClick={() => void toggleRecommendation()} disabled={role !== "STUDENT" || !listing.ownerId || !recommendationStateLoaded || recommendationPending} pressed={recommended} tone="text-blue-600" count={recommendationCount}>
                  <Icon d={ICONS.bolt} className="h-[22px] w-[22px]" filled={recommended} />
                </ActionButton>
                <ActionButton label="Contact provider" onClick={() => gate("contact the provider")} tone="text-black/65">
                  <Icon d={ICONS.mail} className="h-[22px] w-[22px]" />
                </ActionButton>
              </div>
              <div className="flex items-center">
                {!isProvider && <ActionButton label={bookmarked ? "Remove from saved" : "Save listing"} onClick={() => void toggleBookmark()} pressed={bookmarked} tone={bookmarked ? "text-safecrib-green" : "text-black/65"}>
                  <Icon d={ICONS.bookmark} className="h-[22px] w-[22px]" filled={bookmarked} />
                </ActionButton>}
                <ActionButton label="Report listing" onClick={() => setReportOpen(true)} tone="text-black/65 hover:text-red-600">
                  <Icon d={ICONS.flag} className="h-[22px] w-[22px]" />
                </ActionButton>
              </div>
            </div>

            {commentsOpen && (
              <ListingComments
                listingId={id}
                ownerId={listing?.ownerId}
                initialComments={comments}
                initialError={commentError ?? undefined}
                isModal
                onCountChange={setCommentCount}
                onClose={() => setCommentsOpen(false)}
              />
            )}
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
      <h2 id="booking-title" className="text-xl font-medium text-safecrib-black">Secure accommodation</h2>
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