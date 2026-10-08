"use client";

import { useCallback, useRef, useState } from "react";

type ToggleState = "idle" | "pending" | "confirmed";

interface OptimisticToggleOptions<T> {
  key: string;
  initialValue: T;
  onToggle: (nextValue: T) => Promise<void>;
  getNextValue: (current: T) => T;
  equals?: (a: T, b: T) => boolean;
  onError?: (error: Error, rollbackValue: T) => void;
  onSuccess?: (serverValue: T) => void;
}

interface OptimisticToggleReturn<T> {
  value: T;
  state: ToggleState;
  toggle: () => void;
  setValue: (value: T) => void;
}

export function useOptimisticToggle<T>({
  key,
  initialValue,
  onToggle,
  getNextValue,
  equals = (a, b) => a === b,
  onError,
  onSuccess,
}: OptimisticToggleOptions<T>): OptimisticToggleReturn<T> {
  const [value, setValueState] = useState<T>(initialValue);
  const [state, setState] = useState<ToggleState>("idle");
  
  const pendingIntentRef = useRef<T | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);
  const lastConfirmedRef = useRef<T>(initialValue);
  const isMountedRef = useRef(true);

  const setValue = useCallback((nextValue: T) => {
    if (!equals(value, nextValue)) {
      setValueState(nextValue);
    }
  }, [value, equals]);

  const executeToggle = useCallback(async (intentValue: T) => {
    setState("pending");
    pendingIntentRef.current = null;
    
    try {
      await onToggle(intentValue);
      if (!isMountedRef.current) return;
      
      lastConfirmedRef.current = intentValue;
      setState("confirmed");
      onSuccess?.(intentValue);
      
      setTimeout(() => {
        if (isMountedRef.current && state === "confirmed") {
          setState("idle");
        }
      }, 0);
    } catch (error) {
      if (!isMountedRef.current) return;
      
      const rollbackValue = lastConfirmedRef.current;
      setValueState(rollbackValue);
      setState("idle");
      onError?.(error as Error, rollbackValue);
    } finally {
      inflightRef.current = null;
      
      if (pendingIntentRef.current !== null) {
        const nextIntent = pendingIntentRef.current;
        pendingIntentRef.current = null;
        await executeToggle(nextIntent);
      }
    }
  }, [onToggle, onSuccess, onError]);

  const toggle = useCallback(() => {
    const nextValue = getNextValue(value);
    
    if (equals(value, nextValue)) return;
    
    lastConfirmedRef.current = value;
    setValueState(nextValue);
    
    if (inflightRef.current) {
      pendingIntentRef.current = nextValue;
      return;
    }
    
    inflightRef.current = executeToggle(nextValue);
  }, [value, getNextValue, equals, executeToggle]);

  return { value, state, toggle, setValue };
}

export function createOptimisticKey(base: string, id: string): string {
  return `${base}:${id}`;
}