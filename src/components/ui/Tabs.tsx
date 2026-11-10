"use client";
import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabDef<K extends string> {
  key: K;
  label: string;
  count?: number;
}

/**
 * Accessible tablist: roving focus with ←/→/Home/End, `aria-selected`, optional count badges.
 * `aside` (e.g. a "My wallet tokens →" link) is rendered NEXT TO the tablist, never inside it:
 * a `role=tablist` may only contain `role=tab` children.
 */
export function Tabs<K extends string>({ tabs, value, onChange, label, aside }: { tabs: TabDef<K>[]; value: K; onChange: (k: K) => void; label: string; aside?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.key === value);
    let n = -1;
    if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    if (n < 0) return;
    e.preventDefault();
    onChange(tabs[n].key);
    requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[n]?.focus());
  };
  return (
    <div className="tabs-wrap">
      <div className="tabs" role="tablist" aria-label={label} ref={ref} onKeyDown={onKey}>
        {tabs.map((t) => (
          <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-selected={value === t.key} aria-controls={`panel-${t.key}`} tabIndex={value === t.key ? 0 : -1} onClick={() => onChange(t.key)}>
            {t.label}
            {t.count !== undefined && <span className="ct">{t.count}</span>}
          </button>
        ))}
      </div>
      {aside}
    </div>
  );
}
