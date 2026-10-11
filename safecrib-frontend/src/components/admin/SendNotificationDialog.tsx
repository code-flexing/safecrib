"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { UserName } from "@/components/common/UserName";
import { Icon } from "@/components/ui/Icon";
import { ApiError, adminFetch, getCachedCurrentUser, unwrapData } from "@/lib/api";
import { getNotificationTemplate, INTERNAL_LINK_OPTIONS, type NotificationTemplate } from "@/components/admin/notification-templates";

const MAX_TITLE_LENGTH = 80;
const MAX_MESSAGE_LENGTH = 500;

type RecipientUser = {
  id: string;
  displayName: string | null;
  username: string | null;
  role: string;
  profilePicture: string | null;
};

export interface SendNotificationDialogProps {
  open: boolean;
  onClose: () => void;
  recipient: RecipientUser;
  onSuccess: () => void;
}

type FormState = "idle" | "confirm" | "success" | "error";

function NotificationPreview({
  title,
  message,
  senderName,
  senderAvatar,
  senderRole,
  senderId,
  link,
}: {
  title: string;
  message: string;
  senderName: string;
  senderAvatar: string | null;
  senderRole: string;
  senderId: string;
  link: string;
}) {
  return (
    <div className="rounded-[8px] border border-black/10 bg-[#f8faf8] p-4">
      <div className="flex items-start gap-3">
        <ProfileAvatar
          src={senderAvatar}
          alt={`${senderName} profile`}
          size="small"
          className="h-10 w-10"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-0">
            <UserName
              user={{ id: senderId, displayName: senderName, username: null, role: senderRole }}
              size="sm"
              showHandle={false}
              nameClassName="text-sm font-semibold text-safecrib-black"
            />
            <span className="ml-1 text-sm text-black/60"> from SafeCribs</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-safecrib-black">{title || "(no title)"}</p>
          <p className="mt-1 text-sm whitespace-pre-wrap text-black/70">{message || "(no message)"}</p>
          {link && (
            <p className="mt-2 text-xs text-safecrib-green">{link}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function SendNotificationDialog({ open, onClose, recipient, onSuccess }: SendNotificationDialogProps) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [selectedLink, setSelectedLink] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [state, setState] = useState<FormState>("idle");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const messageId = useId();
  const linkId = useId();
  const templateId = useId();

  const adminUser = getCachedCurrentUser<{ id?: string; displayName?: string; username?: string; role?: string; profilePicture?: string }>();
  const senderName = adminUser?.displayName ?? adminUser?.username ?? "SafeCribs Team";
  const senderAvatar = adminUser?.profilePicture ?? null;
  const senderId = adminUser?.id ?? "";
  const senderRole = adminUser?.role ?? "ADMIN";

  function applyTemplate(template: NotificationTemplate) {
    setTitle(template.title);
    setMessage(template.message);
    setSelectedLink(template.link ?? "");
    setSelectedTemplate(template.key);
  }

  function handleTemplateChange(value: string) {
    setSelectedTemplate(value);
    if (value) {
      const template = getNotificationTemplate(value);
      if (template) applyTemplate(template);
    } else {
      setTitle("");
      setMessage("");
      setSelectedLink("");
    }
  }

  const titleRemaining = MAX_TITLE_LENGTH - title.length;
  const messageRemaining = MAX_MESSAGE_LENGTH - message.length;

  const canSubmit = title.trim().length > 0 && message.trim().length > 0;

  function resetForm() {
    setTitle("");
    setMessage("");
    setSelectedLink("");
    setSelectedTemplate("");
    setState("idle");
    setError("");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleConfirmDialogClose() {
    setState("idle");
  }

  async function handleSubmit() {
    if (!canSubmit) return;
    setState("confirm");
  }

  async function doSend() {
    setSending(true);
    setError("");
    const idempotencyKey = crypto.randomUUID();
    let succeeded = false;

    try {
      const payload: { title: string; message: string; link?: string; templateKey?: string } = {
        title: title.trim().slice(0, MAX_TITLE_LENGTH),
        message: message.trim().slice(0, MAX_MESSAGE_LENGTH),
      };
      if (selectedLink) payload.link = selectedLink;
      if (selectedTemplate) payload.templateKey = selectedTemplate;

      const result = unwrapData<{ id: string; duplicate?: boolean }>(
        await adminFetch<{ id: string; duplicate?: boolean }>(
          `/api/v1/admin/users/${encodeURIComponent(recipient.id)}/notifications`,
          {
            method: "POST",
            headers: {
              "Idempotency-Key": idempotencyKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        ),
      );

      if (result.duplicate) {
        setError("You already sent this notification. It's saved in the history.");
      } else {
        succeeded = true;
        setState("success");
        onSuccess();
      }
    } catch (sendError) {
      const status = sendError instanceof ApiError ? sendError.status : 0;
      if (status === 429) {
        setError("You've sent too many notifications. Please wait a moment and try again.");
      } else if (status === 400) {
        setError(sendError instanceof Error ? sendError.message : "Please check your title and message.");
      } else if (status === 404) {
        setError("This user is no longer available.");
      } else {
        setError(sendError instanceof Error ? sendError.message : "Could not send the notification. Please try again.");
      }
      setState("error");
    } finally {
      if (!succeeded) setState("idle");
      setSending(false);
    }
  }

  function renderStep() {
    if (state === "confirm") {
      return (
        <div className="p-6">
          <h2 id={titleId} className="text-lg font-semibold text-safecrib-black">Confirm notification</h2>
          <p className="mt-3 text-sm text-black/60">
            Send this message to <span className="font-medium text-safecrib-black">{senderName}</span>?
          </p>
          <div className="mt-4">
            <NotificationPreview
              title={title}
              message={message}
              senderName={senderName}
              senderAvatar={senderAvatar}
              senderRole={senderRole}
              senderId={senderId}
              link={selectedLink}
            />
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <Button variant="secondary" onClick={handleConfirmDialogClose}>Cancel</Button>
            <Button variant="primary" onClick={() => void doSend()} loading={sending}>Send</Button>
          </div>
        </div>
      );
    }

    if (state === "success") {
      return (
        <div className="p-6 text-center">
          <div className="mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <Icon name="check-circle" className="h-6 w-6 text-emerald-600" />
          </div>
          <h2 id={titleId} className="mt-3 text-lg font-semibold text-safecrib-black">Sent to {senderName}</h2>
          <p className="mt-2 text-sm text-black/60">The notification has been delivered and appears in the user&apos;s notification history.</p>
          <div className="mt-6">
            <Button variant="secondary" onClick={handleClose}>Done</Button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="p-6">
          <h2 id={titleId} className="text-lg font-semibold text-safecrib-black">Send notification to {senderName}</h2>

          {error && (
            <p role="alert" className="mt-4 rounded-[4px] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
          >
            <div>
              <label htmlFor={templateId} className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                Quick template
              </label>
              <select
                id={templateId}
                value={selectedTemplate}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="mt-1 block w-full rounded-[4px] border border-black/15 bg-white px-3 py-2 text-sm focus:border-safecrib-green focus:outline-none"
              >
                <option value="">Pick a template…</option>
                {["complete-verification", "listing-needs-updates", "reviewing-report", "booking-reminder"].map((key) => {
                  const template = getNotificationTemplate(key);
                  if (!template) return null;
                  return (
                    <option key={template.key} value={template.key}>{template.label}</option>
                  );
                })}
              </select>
            </div>

            <div>
              <label htmlFor={titleId} className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                <span>Title</span>
                <span className={titleRemaining < 15 ? "text-red-500" : "text-black/45"}>{titleRemaining}/80</span>
              </label>
              <input
                id={titleId}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE_LENGTH))}
                placeholder="e.g. Your profile needs attention"
                maxLength={MAX_TITLE_LENGTH}
                required
                className="mt-1 block w-full rounded-[4px] border border-black/15 bg-white px-3 py-2 text-sm focus:border-safecrib-green focus:outline-none"
                aria-invalid={title.length > 0 && title.trim() === ""}
              />
            </div>

            <div>
              <label htmlFor={messageId} className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                <span>Message</span>
                <span className={messageRemaining < 30 ? "text-red-500" : "text-black/45"}>{messageRemaining}/500</span>
              </label>
              <textarea
                id={messageId}
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
                placeholder="Write your message here… Plain text only."
                maxLength={MAX_MESSAGE_LENGTH}
                required
                rows={5}
                className="mt-1 block w-full rounded-[4px] border border-black/15 bg-white px-3 py-2 text-sm focus:border-safecrib-green focus:outline-none resize-y"
                aria-invalid={message.length > 0 && message.trim() === ""}
              />
            </div>

            <div>
              <label htmlFor={linkId} className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45">
                Link (optional)
              </label>
              <select
                id={linkId}
                value={selectedLink}
                onChange={(e) => setSelectedLink(e.target.value)}
                className="mt-1 block w-full rounded-[4px] border border-black/15 bg-white px-3 py-2 text-sm focus:border-safecrib-green focus:outline-none"
              >
                {INTERNAL_LINK_OPTIONS.map((option) => (
                  <option key={option.value || "__none__"} value={option.value}>{option.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-black/45">Only internal SafeCribs pages are allowed.</p>
            </div>

            <div className="rounded-[8px] border border-black/10 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-black/45 mb-2">Preview</p>
              <NotificationPreview
                title={title}
                message={message}
                senderName={senderName}
                senderAvatar={senderAvatar}
                senderRole={senderRole}
                senderId={senderId}
                link={selectedLink}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" type="button" onClick={handleClose}>Cancel</Button>
              <Button
                variant="primary"
                type="submit"
                disabled={!canSubmit}
                loading={false}
              >
                Continue
              </Button>
            </div>
          </form>
        </div>
      </>
    );
  }

  return (
    <Modal open={open} onClose={handleClose} titleId={titleId}>
      <div className="w-full max-w-lg" style={{ maxHeight: "90vh", overflowY: "auto" }}>
        {renderStep()}
      </div>
    </Modal>
  );
}
