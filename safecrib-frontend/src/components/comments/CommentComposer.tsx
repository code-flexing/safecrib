"use client";

import { useId, useRef, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/Icon";
import { UserName } from "@/components/common/UserName";
import { CommentAvatar } from "./CommentAvatar";
import { Button } from "@/components/ui/Button";

interface MentionCandidate {
  id: string;
  displayName?: string | null;
  username?: string | null;
  role?: string;
  profilePicture?: string | null;
  studentProfile?: { profilePicture?: string | null } | null;
  providerPage?: { profilePicture?: string | null } | null;
}

interface CommentComposerProps {
  commentBody: string;
  onCommentBodyChange: (value: string) => void;
  onSubmit: () => void;
  onCancelReply?: () => void;
  replyParentId?: string | null;
  replyingToUser?: { username?: string | null; displayName?: string | null } | null;
  mentionCandidates?: MentionCandidate[];
  onSelectMention: (person: MentionCandidate) => void;
  commentSubmitting?: boolean;
  commentError?: string;
  placeholder?: string;
  inputId?: string;
  maxLength?: number;
}

const DEFAULT_MAX_LENGTH = 1000;

export function CommentComposer({
  commentBody,
  onCommentBodyChange,
  onSubmit,
  onCancelReply,
  replyParentId,
  replyingToUser,
  mentionCandidates = [],
  onSelectMention,
  commentSubmitting = false,
  commentError,
  placeholder,
  inputId,
  maxLength = DEFAULT_MAX_LENGTH,
}: CommentComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionListRef = useRef<HTMLUListElement>(null);
  const generatedId = useId();
  const id = inputId ?? generatedId;

  useEffect(() => {
    if (replyParentId && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyParentId]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (!commentSubmitting && commentBody.trim()) {
          onSubmit();
        }
      }
    },
    [commentBody, commentSubmitting, onSubmit]
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onCommentBodyChange(event.target.value);
      event.target.style.height = "auto";
      event.target.style.height = `${Math.min(event.target.scrollHeight, 112)}px`;
    },
    [onCommentBodyChange]
  );

  const isReplying = Boolean(replyParentId);
  const defaultPlaceholder = isReplying ? "Write a reply..." : "Add a comment, or tag someone with @...";

  return (
    <div className="border-t border-theme-border bg-theme-surface/50 p-4">
      {replyParentId && replyingToUser && onCancelReply && (
        <div className="mb-2 flex items-center justify-between rounded-lg bg-theme-field/50 px-3 py-1.5 text-xs text-theme-text-muted">
          <span>Replying to @{replyingToUser.username ?? replyingToUser.displayName ?? "a comment"}</span>
          <button type="button" onClick={onCancelReply} className="font-semibold text-safecrib-green hover:underline">
            Cancel
          </button>
        </div>
      )}
      <label htmlFor={id} className="sr-only">
        {isReplying ? "Write a reply" : "Write a comment"}
      </label>
      <div className="flex items-end gap-2 rounded-2xl border border-theme-border bg-theme-field/30 px-3 py-1 transition focus-within:border-safecrib-green focus-within:bg-theme-surface">
        <textarea
          ref={textareaRef}
          id={id}
          value={commentBody}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          maxLength={maxLength}
          rows={1}
          placeholder={placeholder ?? defaultPlaceholder}
          className="max-h-28 min-h-[2.25rem] w-full resize-none bg-transparent py-2 text-sm text-theme-text-primary placeholder:text-theme-text-muted focus:outline-none"
          aria-describedby={mentionCandidates.length > 0 ? `${id}-mentions` : undefined}
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={commentSubmitting || !commentBody.trim()}
          className="mb-1 rounded-full px-3 py-1.5 text-sm font-semibold text-safecrib-green transition hover:bg-safecrib-green/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {commentSubmitting ? "Posting..." : isReplying ? "Post Reply" : "Post"}
        </button>
      </div>
      {mentionCandidates.length > 0 && (
        <ul
          ref={mentionListRef}
          id={`${id}-mentions`}
          aria-label="Tag a user"
          className="absolute bottom-full left-0 z-20 mb-2 max-h-44 w-full overflow-auto rounded-xl border border-theme-border bg-theme-surface shadow-lg"
        >
          {mentionCandidates.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => onSelectMention(person)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-safecrib-green/5"
              >
                <CommentAvatar user={person} small showVerification />
                <UserName user={person} size="sm" showHandle={true} />
                <span className="text-xs text-theme-text-muted">{person.role?.toLowerCase()}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {commentBody.length > 800 && (
        <p className="mt-1 text-right text-xs text-theme-text-muted" aria-live="polite">
          {commentBody.length}/{maxLength}
        </p>
      )}
      {commentError && <p role="alert" className="mt-2 text-xs font-medium text-theme-text-error">{commentError}</p>}
    </div>
  );
}