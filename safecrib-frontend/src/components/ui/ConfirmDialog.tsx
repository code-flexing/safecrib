"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";

export type ConfirmAction = "confirm" | "cancel" | "input";

export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    message: string;
    inputLabel?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    inputValue?: string;
  }>({ open: false, title: "", message: "" });

  const open = (config: {
    title: string;
    message: string;
    inputLabel?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    inputValue?: string;
  }) => {
    setState({ open: true, ...config });
  };

  const close = () => setState((current) => ({ ...current, open: false }));

  return {
    state,
    open,
    close,
  };
}

export function ConfirmDialog({
  open,
  title,
  message,
  inputLabel,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  inputValue: controlledInputValue,
  onResult,
}: {
  open: boolean;
  title: string;
  message: string;
  inputLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputValue?: string;
  onResult: (action: ConfirmAction, value?: string) => void;
}) {
  const [internalInput, setInternalInput] = useState("");

  const handleConfirm = () => {
    const value = controlledInputValue ?? internalInput;
    onResult("confirm", inputLabel ? value : undefined);
  };

  const handleCancel = () => {
    onResult("cancel");
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={handleCancel}
      titleId="confirm-dialog-title"
    >
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <Icon name="alert-circle" className="h-6 w-6 text-amber-600" />
          </div>
          <h2 id="confirm-dialog-title" className="text-lg font-semibold text-safecrib-black">{title}</h2>
        </div>
        <p className="text-sm text-black/60 mb-4">{message}</p>
        {inputLabel && (
          <label className="block text-sm font-medium text-safecrib-black mb-2">
            {inputLabel}
            <input
              type="text"
              value={controlledInputValue ?? internalInput}
              onChange={(e) => inputLabel && controlledInputValue === undefined && setInternalInput(e.target.value)}
              className="mt-1 block w-full border border-black/15 px-3 py-2 text-sm focus:border-safecrib-green focus:outline-none"
              autoComplete="off"
            />
          </label>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" onClick={handleCancel}>{cancelLabel}</Button>
          <Button onClick={handleConfirm} variant="primary">{confirmLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}
