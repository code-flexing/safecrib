"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export type ToastVariant = "success" | "error" | "info";
export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: {
    label: string;
    onClick: () => void;
    variant?: "primary" | "secondary";
  };
  persistent?: boolean;
  progress?: number;
}

type ToastOptions = Omit<Toast, "id" | "progress">;

type ToastContextValue = {
  showToast: ((toast: ToastOptions) => string) & ((message: string, type?: ToastType) => string);
  dismissToast: (id: string) => void;
  dismissAll: () => void;
};

function normalizeToastInput(messageOrToast: string | ToastOptions, type?: ToastType): ToastOptions {
  if (typeof messageOrToast === "string") {
    return { message: messageOrToast, variant: (type ?? "success") as ToastVariant };
  }
  return messageOrToast;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    return {
      showToast: ((messageOrToast: string | ToastOptions, type?: ToastType) => {
        if (typeof messageOrToast === "string") {
          const opts = normalizeToastInput(messageOrToast, type);
          window.dispatchEvent(new CustomEvent("safecrib:toast", { detail: opts }));
        }
        return "";
      }) as ToastContextValue["showToast"],
      dismissToast: () => {},
      dismissAll: () => {},
    };
  }
  return context;
}

export function useNotify() {
  const { showToast } = useToast();
  const notify = useCallback((
    variant: ToastVariant,
    message: string,
    options?: { action?: Toast["action"]; persistent?: boolean }
  ) => {
    return showToast({ message, variant, ...options });
  }, [showToast]);
  return { notify, notifyError: (msg: string, opts?: { action?: Toast["action"] }) => notify("error", msg, opts), notifySuccess: (msg: string, opts?: { action?: Toast["action"] }) => notify("success", msg, opts), notifyInfo: (msg: string, opts?: { action?: Toast["action"] }) => notify("info", msg, opts) };
}

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 4500;
const PROGRESS_UPDATE_MS = 50;

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);
  const progressTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const hoverRef = useRef<Set<string>>(new Set());
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => { reducedMotionRef.current = e.matches; };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const startProgress = useCallback((id: string) => {
    if (reducedMotionRef.current) return;
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const progress = Math.min(100, (elapsed / AUTO_DISMISS_MS) * 100);
      setToasts(current => current.map(t => t.id === id ? { ...t, progress } : t));
      if (progress >= 100) {
        clearInterval(timer);
        progressTimers.current.delete(id);
      }
    }, PROGRESS_UPDATE_MS);
    progressTimers.current.set(id, timer);
  }, []);

  const clearProgress = useCallback((id: string) => {
    const timer = progressTimers.current.get(id);
    if (timer) {
      clearInterval(timer);
      progressTimers.current.delete(id);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    clearProgress(id);
    setToasts(current => current.filter(t => t.id !== id));
  }, [clearProgress]);

  const showToast = useCallback(((messageOrToast: string | ToastOptions, type?: ToastType) => {
    const toast = normalizeToastInput(messageOrToast, type);
    const id = `toast-${Date.now()}-${counter.current++}`;
    const newToast: Toast = { ...toast, id, progress: 0 };
    
    setToasts(current => {
      const exists = current.find(t => t.message === toast.message && t.variant === toast.variant);
      if (exists && !toast.persistent) {
        clearProgress(exists.id);
        startProgress(exists.id);
        return current.map(t => t.id === exists.id ? { ...t, progress: 0 } : t);
      }
      const next = [...current, newToast];
      return next.slice(-MAX_VISIBLE);
    });

    if (!toast.persistent) {
      startProgress(id);
      setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
    }
    return id;
  }) as ToastContextValue["showToast"], [clearProgress, startProgress, removeToast]);

  const dismissAll = useCallback(() => {
    progressTimers.current.forEach(timer => clearInterval(timer));
    progressTimers.current.clear();
    setToasts([]);
  }, []);

  const handleHover = useCallback((id: string, entering: boolean) => {
    if (reducedMotionRef.current) return;
    setToasts(current => {
      const toast = current.find(t => t.id === id);
      if (!toast || toast.persistent) return current;
      if (entering) {
        hoverRef.current.add(id);
        clearProgress(id);
      } else {
        hoverRef.current.delete(id);
        if (!hoverRef.current.has(id)) startProgress(id);
      }
      return current;
    });
  }, [clearProgress, startProgress]);

  const handleSwipe = useCallback((id: string, deltaX: number) => {
    if (Math.abs(deltaX) > 80) {
      removeToast(id);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast: removeToast, dismissAll }}>
      {children}
      <ToastContainer 
        toasts={toasts} 
        onRemove={removeToast}
        onHover={handleHover}
        onSwipe={handleSwipe}
      />
    </ToastContext.Provider>
  );
}

function ToastContainer({ 
  toasts, 
  onRemove, 
  onHover,
  onSwipe 
}: { 
  toasts: Toast[]; 
  onRemove: (id: string) => void;
  onHover: (id: string, entering: boolean) => void;
  onSwipe: (id: string, deltaX: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  if (toasts.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="status"
      aria-live="polite"
      className={`
        fixed z-[100] flex flex-col gap-2 pointer-events-none px-4
        ${isMobile 
          ? "top-[calc(env(safe-area-inset-top)+0.5rem)] left-1/2 -translate-x-1/2 w-full max-w-sm" 
          : "top-4 right-4"
        }
      `}
    >
      {toasts.map((toast) => (
        <ToastItem 
          key={toast.id} 
          toast={toast} 
          onRemove={onRemove}
          onHover={onHover}
          onSwipe={onSwipe}
          isMobile={isMobile}
        />
      ))}
    </div>
  );
}

function ToastItem({ 
  toast, 
  onRemove, 
  onHover,
  onSwipe,
  isMobile
}: { 
  toast: Toast; 
  onRemove: (id: string) => void;
  onHover: (id: string, entering: boolean) => void;
  onSwipe: (id: string, deltaX: number) => void;
  isMobile: boolean;
}) {
  const [swipeX, setSwipeX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startXRef = useRef(0);

  const variantStyles = {
    success: "bg-emerald-500/95 text-white border-emerald-400/30",
    error: "bg-rose-500/95 text-white border-rose-400/30",
    info: "bg-blue-500/95 text-white border-blue-400/30",
  };

  const iconNames = {
    success: "check-circle",
    error: "alert-circle",
    info: "info",
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) startXRef.current = touch.clientX;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isSwiping) return;
    const touch = e.touches[0];
    if (touch) {
      const deltaX = touch.clientX - startXRef.current;
      setSwipeX(deltaX);
    }
  };

  const handleTouchEnd = () => {
    if (!isSwiping) return;
    setIsSwiping(false);
    onSwipe(toast.id, swipeX);
    setSwipeX(0);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isMobile) return;
    startXRef.current = e.clientX;
    setIsSwiping(true);
    const handleMove = (ev: MouseEvent) => {
      if (!isSwiping) return;
      setSwipeX(ev.clientX - startXRef.current);
    };
    const handleUp = () => {
      setIsSwiping(false);
      onSwipe(toast.id, swipeX);
      setSwipeX(0);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const glassStyle = {
    background: "rgba(255, 255, 255, 0.15)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
  } as React.CSSProperties;

  const darkGlassStyle = {
    background: "rgba(15, 23, 42, 0.85)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
  } as React.CSSProperties;

  return (
    <div
      className={`pointer-events-auto flex items-start gap-3 rounded-2xl p-4 shadow-2xl transition-all duration-300 ease-out animate-in slide-in-from-top-4 fade-in ${variantStyles[toast.variant]}`}
      style={{
        ...(typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? darkGlassStyle : glassStyle),
        transform: isSwiping ? `translateX(${swipeX}px)` : undefined,
        opacity: isSwiping && Math.abs(swipeX) > 40 ? 0.7 : 1,
      }}
      onMouseEnter={() => onHover(toast.id, true)}
      onMouseLeave={() => onHover(toast.id, false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      role="alert"
      aria-live={toast.variant === "error" ? "assertive" : "polite"}
    >
      <Icon name={iconNames[toast.variant]} className="h-5 w-5 shrink-0 mt-0.5" aria-hidden="true" />
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-relaxed">{toast.message}</p>
        {toast.action && (
          <button
            type="button"
            onClick={() => { toast.action?.onClick(); onRemove(toast.id); }}
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
              toast.action.variant === "primary"
                ? "bg-white/20 text-white hover:bg-white/30 border border-white/30"
                : "bg-white/10 text-white hover:bg-white/20 border border-white/20"
            }`}
            aria-label={toast.action.label}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onRemove(toast.id)}
        className="shrink-0 rounded-full p-1 text-white/70 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Dismiss"
      >
        <Icon name="x" className="h-4 w-4" />
      </button>

      {!toast.persistent && (
        <div 
          className="absolute bottom-0 left-0 h-1 rounded-bl-2xl rounded-br-2xl bg-white/30 overflow-hidden"
          style={{ width: `${toast.progress ?? 0}%` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export { ToastProvider };