"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastKind = "info" | "success" | "error";
interface ToastApi {
  toast: (message: string, kind?: ToastKind, ms?: number) => void;
}
const Ctx = createContext<ToastApi>({ toast: () => {} });
export const useToast = () => useContext(Ctx).toast;

/** One polite live region, like the reference's single bottom-centre toast. Errors stay longer. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ m: string; kind: ToastKind; show: boolean }>({ m: "", kind: "info", show: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string, kind: ToastKind = "info", ms?: number) => {
    if (timer.current) clearTimeout(timer.current);
    setT({ m: message, kind, show: true });
    timer.current = setTimeout(() => setT((x) => ({ ...x, show: false })), ms ?? (kind === "error" ? 6500 : 4200));
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className={`toast ${t.show ? "show" : ""}`} data-kind={t.kind} role={t.kind === "error" ? "alert" : "status"} aria-live={t.kind === "error" ? "assertive" : "polite"}>
        {t.m}
      </div>
    </Ctx.Provider>
  );
}
