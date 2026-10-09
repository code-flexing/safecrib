"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { formatDistanceToNow } from "date-fns";
import { Icon } from "@/components/ui/Icon";
import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { cachedApiFetch, unwrapData, apiFetch } from "@/lib/api";
import { CommentItem, type ListingComment } from "./CommentItem";
import { CommentComposer } from "./CommentComposer";
import { UserName } from "@/components/common/UserName";
import { CommentAvatar } from "./CommentAvatar";

interface MentionCandidate {
  id: string;
  displayName?: string | null;
  username?: string | null;
  role?: string;
  profilePicture?: string | null;
  studentProfile?: { profilePicture?: string | null } | null;
  providerPage?: { profilePicture?: string | null } | null;
}

interface ListingCommentsProps {
  listingId: string;
  ownerId?: string;
  onCountChange: (count: number) => void;
  onClose: (listingId: string) => void;
  initialComments?: ListingComment[];
  initialError?: string;
  isModal?: boolean;
}

function formatCommentTime(iso: string) {
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

function renderBody(comment: ListingComment) {
  return comment.body.split(/(@[A-Za-z0-9_.]+)/g).map((part, index) => {
    if (part.length > 1 && part.startsWith("@")) {
      const handle = part.slice(1).toLowerCase();
      const mentioned = comment.mentions?.find((mention) => (mention.user.username ?? "").toLowerCase() === handle);
      if (mentioned) {
        return (
          <Link
            key={index}
            href={`/profile/${encodeURIComponent(mentioned.user.id)}`}
            className="font-medium text-theme-text-link hover:underline"
          >
            {part}
          </Link>
        );
      }
    }
    return <span key={index}>{part}</span>;
  });
}

export function ListingComments({
  listingId,
  ownerId,
  onCountChange,
  onClose,
  initialComments = [],
  initialError,
  isModal = true,
}: ListingCommentsProps) {
  const [comments, setComments] = useState<ListingComment[]>(initialComments);
  const [loading, setLoading] = useState(!initialComments.length && !initialError);
  const [commentBody, setCommentBody] = useState("");
  const [commentMentionIds, setCommentMentionIds] = useState<string[]>([]);
  const [mentionCandidates, setMentionCandidates] = useState<MentionCandidate[]>([]);
  const [taggedUsers, setTaggedUsers] = useState<MentionCandidate[]>([]);
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [commentError, setCommentError] = useState(initialError ?? "");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const inputId = `home-comment-${listingId}`;
  const titleId = useId();
  const closeDiscussion = useCallback(() => onClose(listingId), [listingId, onClose]);

  useEffect(() => {
    if (initialComments.length || initialError) return;
    let active = true;
    setLoading(true);
    void cachedApiFetch<unknown>(`/api/v1/listings/${encodeURIComponent(listingId)}/comments`)
      .then((response) => {
        if (!active) return;
        const list = unwrapData<ListingComment[]>(response);
        const items = Array.isArray(list) ? list : [];
        setComments(items);
        onCountChange(items.length);
      })
      .catch(() => {
        if (active) setCommentError("We could not load comments. Please refresh to retry.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listingId, initialComments.length, initialError]);

  const submitComment = async () => {
    const body = commentBody.trim();
    if (!body || body.length > 1000) {
      setCommentError("Write a comment up to 1,000 characters.");
      return;
    }
    setCommentSubmitting(true);
    setCommentError("");
    try {
      const response = await apiFetch<ListingComment>(`/api/v1/listings/${encodeURIComponent(listingId)}/comments`, {
        method: "POST",
        body: JSON.stringify({
          body,
          parentId: replyParentId ?? undefined,
          mentionUserIds: commentMentionIds,
        }),
      });
      const newComment = unwrapData<ListingComment>(response);
      setComments((current) => {
        const nextComments = [newComment, ...current];
        onCountChange(nextComments.length);
        return nextComments;
      });
      setCommentBody("");
      setReplyParentId(null);
      setCommentMentionIds([]);
      setTaggedUsers([]);
    } catch {
      setCommentError("Could not post comment. Please try again.");
    } finally {
      setCommentSubmitting(false);
    }
  };

  const updateCommentBody = (value: string) => {
    setCommentBody(value);
    setCommentMentionIds((current) =>
      current.filter((mentionId) => {
        const person = taggedUsers.find((user) => user.id === mentionId);
        const handle = person?.username ?? "";
        return person ? value.toLocaleLowerCase().includes(`@${handle.toLocaleLowerCase()}`) : false;
      })
    );
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
    setCommentMentionIds((current) => (current.includes(person.id) ? current : [...current, person.id]));
    setTaggedUsers((current) => (current.some((item) => item.id === person.id) ? current : [...current, person]));
    setMentionCandidates([]);
  };

  const startReply = (item: ListingComment) => {
    const handle = item.user.username;
    setReplyParentId(item.id);
    setCommentError("");
    setMentionCandidates([]);
    if (handle) {
      setCommentBody(`@${handle} `);
      setCommentMentionIds([item.user.id]);
      setTaggedUsers((current) =>
        current.some((person) => person.id === item.user.id)
          ? current
          : [...current, { id: item.user.id, displayName: item.user.displayName, username: handle, role: item.user.role }]
      );
    } else {
      setCommentBody("");
      setCommentMentionIds([]);
    }
  };

  const replyingTo = replyParentId ? comments.find((comment) => comment.id === replyParentId) : undefined;

  const rootComments = comments.filter((comment) => !comment.parentId);

  const content = (
    <Modal open onClose={closeDiscussion} titleId={titleId}>
      <div className="flex max-h-[88dvh] min-h-[52dvh] flex-col overflow-hidden rounded-[28px] bg-theme-surface shadow-[0_24px_60px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/5">
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-theme-border sm:hidden" />
        <header className="flex shrink-0 items-center justify-between border-b border-theme-border px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <h2 id={titleId} className="text-base font-bold text-theme-text-primary">
              Comments
            </h2>
            <span className="rounded-full bg-theme-border px-2 py-0.5 text-xs font-semibold text-theme-text-muted">
              {comments.length}
            </span>
          </div>
          <button
            type="button"
            onClick={closeDiscussion}
            aria-label="Close comments"
            className="flex h-8 w-8 items-center justify-center rounded-full text-theme-text-muted transition hover:bg-theme-field hover:text-theme-text-primary"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3 sm:px-6">
          {loading ? (
            <div className="space-y-4 py-4" aria-hidden="true">
              <Skeleton className="h-4 w-40 rounded-full" />
              <Skeleton className="h-12 w-full rounded-2xl" />
              <Skeleton className="h-12 w-4/5 rounded-2xl" />
            </div>
          ) : (
            <ul className="divide-y divide-theme-border">
              {rootComments.map((comment) => (
                <CommentItem
                  key={comment.id}
                  comment={comment}
                  isAuthor={Boolean(ownerId && comment.user.id === ownerId)}
                  replies={comments.filter((c) => c.parentId === comment.id).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())}
                  expanded={expandedThreads.has(comment.id)}
                  onReply={startReply}
                  onExpandClick={() =>
                    setExpandedThreads((current) => {
                      const next = new Set(current);
                      if (next.has(comment.id)) next.delete(comment.id);
                      else next.add(comment.id);
                      return next;
                    })
                  }
                  renderBody={renderBody}
                />
              ))}
              {!comments.length && !commentError && (
                <li className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-theme-border text-theme-text-muted">
                    <Icon name="message-circle" className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-theme-text-primary">No comments yet. Start the conversation.</p>
                </li>
              )}
            </ul>
          )}
          <div className="pb-2 pt-4">
            <Link href={`/dashboard/listings/${listingId}#comments`} className="text-xs font-semibold text-safecrib-green hover:underline">
              Open full discussion thread →
            </Link>
          </div>
        </div>

        <CommentComposer
          commentBody={commentBody}
          onCommentBodyChange={updateCommentBody}
          onSubmit={submitComment}
          onCancelReply={() => {
            setReplyParentId(null);
            setCommentBody("");
            setCommentMentionIds([]);
          }}
          replyParentId={replyParentId}
          replyingToUser={replyingTo?.user ?? null}
          mentionCandidates={mentionCandidates}
          onSelectMention={selectMention}
          commentSubmitting={commentSubmitting}
          commentError={commentError}
          inputId={inputId}
        />
      </div>
    </Modal>
  );

  if (isModal) {
    return createPortal(content, document.body);
  }

  return content;
}