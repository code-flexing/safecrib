"use client";

import { useState } from "react";
import Link from "next/link";
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
  onReply?: (comment: ListingComment) => void;
  renderBody?: (comment: ListingComment) => React.ReactNode;
  autoExpand?: boolean;
  targetCommentId?: string | null;
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

const REPLY_NAME_SIZE = "text-[12px]";
const REPLY_TEXT_SIZE = "text-[13px] leading-tight";
const REPLY_TIME_SIZE = "text-[11px]";
const CONNECTOR_LEFT_OFFSET = 15;
const REPLY_INDENT = 12;
const GAP_COMMENT_REPLIES = 8;
const GAP_REPLIES = 8;
const ACTION_GAP = 12;

export function CommentItem({
  comment,
  depth = 0,
  isAuthor = false,
  replies = [],
  onReply,
  renderBody,
  autoExpand = false,
  targetCommentId = null,
}: CommentItemProps) {
  const commentTime = formatCommentTime(comment.createdAt);
  const hasReplies = replies.length > 0;
  const [expanded, setExpanded] = useState(autoExpand || false);

  const isReply = depth > 0;
  const nameSize = isReply ? REPLY_NAME_SIZE : "text-xs";
  const textSize = isReply ? REPLY_TEXT_SIZE : "text-sm leading-6";
  const timeSize = isReply ? REPLY_TIME_SIZE : "text-xs";
  const actionGap = isReply ? "gap-[3px]" : `gap-[${ACTION_GAP}px]`;
  const marginLeft = isReply ? `${CONNECTOR_LEFT_OFFSET + REPLY_INDENT}px` : `${Math.min(depth, 4) * 16}px`;

  const isTarget = targetCommentId === comment.id;
  const liId = isTarget ? `comment-${comment.id}` : undefined;

  const toggleReplies = () => setExpanded((prev) => !prev);

  return (
    <li
      key={comment.id}
      id={liId}
      className={`py-2 first:pt-1 last:pb-1 ${isReply ? "mt-1" : ""}`}
      style={{ marginLeft }}
      tabIndex={isTarget ? -1 : undefined}
    >
      <div className="group relative">
        <div className="flex gap-2">
          <CommentAvatar
            user={comment.user}
            small={isReply}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Link
                href={`/profile/${encodeURIComponent(comment.user.id)}`}
                className={`font-semibold text-theme-text-primary transition hover:text-theme-text-link ${nameSize}`}
              >
                <UserName user={comment.user} size={isReply ? "sm" : "sm"} showHandle={true} />
              </Link>
              {isAuthor && (
                <span
                  className="rounded-full bg-safecrib-green/15 px-2 py-0.5 text-[10px] font-bold text-safecrib-green"
                  aria-label="Listing creator"
                >
                  Creator
                </span>
              )}
              <time dateTime={comment.createdAt} className={`font-normal text-theme-text-muted ${timeSize}`}>
                {commentTime}
              </time>
            </div>
            {comment.body && (
              <p className={`mt-1 whitespace-pre-wrap ${textSize} text-theme-text-primary`}>
                {renderBody ? renderBody(comment) : comment.body}
              </p>
            )}
            {comment.mentions && comment.mentions.length > 0 && (
              <p className="mt-1 text-xs text-theme-text-muted">
                Tagged:{comment.mentions.map((m) => (
                  <Link
                    key={m.user.id}
                    href={`/profile/${encodeURIComponent(m.user.id)}`}
                    className="mx-0.5 font-medium text-theme-text-link hover:underline"
                  >
                    @{m.user.username ?? m.user.displayName ?? "member"}
                  </Link>
                ))}
              </p>
            )}
            <div className={`mt-1.5 flex items-center ${actionGap}`}>
              {hasReplies && (
                <button
                  type="button"
                  onClick={toggleReplies}
                  aria-expanded={expanded}
                  aria-controls={`${comment.id}-replies`}
                  className="text-[12px] font-semibold text-safecrib-green transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safecrib-green py-2 px-1 -ml-1"
                >
                  {expanded ? "Hide replies" : `View replies (${replies.length})`}
                </button>
              )}
              <button
                type="button"
                onClick={() => onReply?.(comment)}
                className="text-[12px] font-semibold text-theme-text-muted transition hover:text-safecrib-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-safecrib-green py-2 px-1"
              >
                Reply
              </button>
            </div>
          </div>
        </div>
        {hasReplies && expanded && (
          <ul
            id={`${comment.id}-replies`}
            className="relative"
            role="group"
            aria-label="Replies"
            style={{ paddingLeft: isReply ? 0 : CONNECTOR_LEFT_OFFSET }}
          >
            <div
              className="absolute top-0 bottom-0 w-px bg-black/10"
              style={{ left: isReply ? REPLY_INDENT / 2 : CONNECTOR_LEFT_OFFSET }}
              aria-hidden="true"
            />
            <div className={`space-y-[${GAP_REPLIES}px] mt-[${GAP_COMMENT_REPLIES}px] pl-[${REPLY_INDENT}px]`}>
              {replies.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  depth={depth + 1}
                  isAuthor={isAuthor}
                  replies={[]}
                  renderBody={renderBody}
                  onReply={onReply}
                  targetCommentId={targetCommentId}
                />
              ))}
            </div>
          </ul>
        )}
      </div>
    </li>
  );
}