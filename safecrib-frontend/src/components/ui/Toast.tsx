"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastType = "success" | "error";
type Toast = { id: string; message: string; type: ToastType };

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    const event = new CustomEvent("safecrib:toast", { detail: { message: "useToast must be used inside ToastProvider." } });
    window.dispatchEvent(event);
    return { showToast: () => undefined };
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = `toast-${Date.now()}-${counter.current++}`;
    const toast: Toast = { id, message, type };
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => removeToast(id), 3500);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  return (
    <div
      className={`pointer-events-auto flex items-center gap-2.5 rounded-[3px] px-4 py-2.5 text-sm font-medium shadow-lg
        ${toast.type === "success"
          ? "bg-safecrib-green text-safecrib-white"
          : "border border-red-300 bg-red-50 text-red-800"}`}
    >
      {toast.type === "success" && <span aria-hidden="true">✓</span>}
      {toast.type === "error" && <span aria-hidden="true">!</span>}
      <span>{toast.message}</span>
      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        className="ml-1 rounded p-0.5 hover:bg-black/10"
        aria-label="Dismiss"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
          <line x1="5" y1="5" x2="15" y2="15" />
        </svg>
      </button>
    </div>
  );
}
