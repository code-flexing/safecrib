"use client";

import { useId } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Icon } from "@/components/ui/Icon";
import { UserName } from "@/components/common/UserName";
import { CommentAvatar } from "./CommentAvatar";

export interface ListingComment {
  id: string;
  body: string;
  parentId?: string | null;
  createdAt: string;
  user: {
    id: string;
    displayName?: string | null;
    username?: string | null;
    role?: string;
    profilePicture?: string | null;
    studentProfile?: { profilePicture?: string | null } | null;
    providerPage?: { profilePicture?: string | null } | null;
  };
  mentions?: Array<{
    user: {
      id: string;
      displayName?: string | null;
      username?: string | null;
      role?: string;
      profilePicture?: string | null;
      studentProfile?: { profilePicture?: string | null } | null;
      providerPage?: { profilePicture?: string | null } | null;
    };
  }>;
}

interface CommentItemProps {
  comment: ListingComment;
  depth?: number;
  isAuthor?: boolean;
  replies?: ListingComment[];
  expanded?: boolean;
  onReply?: (comment: ListingComment) => void;
  onExpandClick?: () => void;
  renderBody?: (comment: ListingComment) => React.ReactNode;
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

export function CommentItem({
  comment,
  depth = 0,
  isAuthor = false,
  replies = [],
  expanded = false,
  onReply,
  onExpandClick,
  renderBody,
}: CommentItemProps) {
  const commentTime = formatCommentTime(comment.createdAt);
  const showRepliesToggle = replies.length > 1;
  const showFirstReplyOnly = replies.length > 1 && !expanded;
  const visibleReplies = showFirstReplyOnly ? replies.slice(0, 1) : replies;
  const remainingRepliesCount = replies.length - visibleReplies.length;

  return (
    <li key={comment.id} className="py-2.5" style={{ marginLeft: `${Math.min(depth, 4) * 16}px` }}>
      <div className="group relative">
        <div className="rounded-2xl border border-theme-border bg-theme-surface p-3.5 transition-colors hover:border-safecrib-green/40 hover:bg-theme-field/40">
          <div className="flex gap-3">
            <CommentAvatar user={comment.user} small={depth > 0} showVerification />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Link
                  href={`/profile/${encodeURIComponent(comment.user.id)}`}
                  className="font-semibold text-theme-text-primary transition hover:text-theme-text-link"
                >
                  <UserName user={comment.user} size="sm" showHandle={true} />
                </Link>
                {isAuthor && (
                  <span
                    className="rounded-full bg-safecrib-green/15 px-2 py-0.5 text-[10px] font-bold text-safecrib-green"
                    aria-label="Listing author"
                  >
                    Author
                  </span>
                )}
                <time dateTime={comment.createdAt} className="font-normal text-theme-text-muted">
                  • {commentTime}
                </time>
              </div>
              {comment.body && (
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-theme-text-primary">
                  {renderBody ? renderBody(comment) : comment.body}
                </p>
              )}
              {comment.mentions && comment.mentions.length > 0 && (
                <p className="mt-1 text-xs text-theme-text-muted">
                  Tagged:{comment.mentions.map((m) => (
                    <Link
                      key={m.user.id}
                      href={`/profile/${encodeURIComponent(m.user.id)}`}
                      className="font-medium text-theme-text-link hover:underline mx-0.5"
                    >
                      @{m.user.username ?? m.user.displayName ?? "member"}
                    </Link>
                  ))}
                </p>
              )}
              <div className="mt-2 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => onReply?.(comment)}
                  className="text-xs font-semibold text-safecrib-green hover:text-safecrib-green/80 transition"
                >
                  Reply
                </button>
              </div>
            </div>
          </div>
        </div>
        {replies.length > 0 && (
          <ul className="mt-2 space-y-2 border-l-2 border-theme-border pl-3" role="group" aria-label="Replies">
            {visibleReplies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                depth={depth + 1}
                isAuthor={isAuthor}
                renderBody={renderBody}
                onReply={onReply}
              />
            ))}
            {showRepliesToggle && (
              <li className="mt-1">
                <button
                  type="button"
                  onClick={onExpandClick}
                  aria-expanded={expanded}
                  aria-controls={`${comment.id}-replies`}
                  className="flex items-center gap-2 text-xs font-semibold text-safecrib-green transition hover:underline"
                >
                  <span aria-hidden="true" className="h-px w-6 bg-safecrib-green/40" />
                  {expanded ? "Hide replies" : `View ${remainingRepliesCount} more ${remainingRepliesCount === 1 ? "reply" : "replies"}`}
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </li>
  );
}