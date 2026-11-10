"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SearchIcon } from "@/components/ui/Icons";

/** Search → /coins?q=… (same behaviour as the reference: typing in the header takes you to the coin list). Needs a <Suspense> parent. */
export function HeaderSearch({ id = "hsearch", className = "", onDone }: { id?: string; className?: string; onDone?: () => void }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const urlQ = path === "/coins" ? (params.get("q") ?? "") : "";
  const [q, setQ] = useState(urlQ);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setQ(urlQ), [urlQ]);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const go = (v: string) => {
    const url = v.trim() ? `/coins?q=${encodeURIComponent(v.trim())}` : "/coins";
    if (path === "/coins") router.replace(url, { scroll: false });
    else router.push(url);
  };

  return (
    <form
      role="search"
      className={`flex h-10 items-center gap-2 rounded-[10px] border border-line bg-field px-3 text-muted focus-within:border-ink ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        go(q);
        onDone?.();
      }}
    >
      <SearchIcon size={16} />
      <input
        id={id}
        type="search"
        value={q}
        placeholder="Search coins, tickers, creators…"
        aria-label="Search coins"
        autoComplete="off"
        className="w-full min-w-0 border-0 bg-transparent text-sm font-medium text-ink outline-none placeholder:text-ink/45"
        onChange={(e) => {
          setQ(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => go(e.target.value), 250);
        }}
      />
    </form>
  );
}
