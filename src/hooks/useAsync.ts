"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  /** First load for the current deps. */
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * Loads `fn` when `deps` change, optionally polls (paused while the tab is hidden), ignores out-of-order responses,
 * and drops the previous data when deps change so e.g. another wallet's portfolio is never shown.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], opts: { refreshMs?: number; enabled?: boolean } = {}): AsyncState<T> {
  const { refreshMs, enabled = true } = opts;
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: enabled });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const run = useCallback(async (silent: boolean) => {
    const id = ++seq.current;
    if (!silent) setState({ data: undefined, error: undefined, loading: true });
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, loading: false });
    } catch (e) {
      if (id === seq.current) setState((s) => ({ data: silent ? s.data : undefined, error: e instanceof Error ? e : new Error(String(e)), loading: false }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      seq.current++;
      setState({ loading: false });
      return;
    }
    void run(false);
    if (!refreshMs) return () => void seq.current++;
    const t = setInterval(() => {
      if (!document.hidden) void run(true);
    }, refreshMs);
    return () => {
      clearInterval(t);
      seq.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, refreshMs, run]);

  const reload = useCallback(() => run(true), [run]);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}
