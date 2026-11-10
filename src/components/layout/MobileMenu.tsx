"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { CloseIcon, XIcon } from "@/components/ui/Icons";
import { X_URL } from "@/lib/social";
import { Logo } from "@/components/ui/Logo";
import { HeaderSearch } from "./HeaderSearch";
import { NAV } from "./nav";

/**
 * Slide-over navigation for < 1100 px. A native <dialog>, so focus is trapped and Esc / backdrop close work for free.
 * This is where Deed deliberately differs from the reference, which stacks its header into four rows on phones.
 */
export function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const path = usePathname();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      id="mobile-menu"
      className="drawer"
      aria-label="Menu"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-[68px] shrink-0 items-center justify-between border-b border-line px-4">
          <Logo href={null} />
          <button type="button" className="grid h-10 w-10 place-items-center rounded-[10px] border border-line hover:border-ink" aria-label="Close menu" onClick={onClose}>
            <CloseIcon size={20} />
          </button>
        </div>
        <div className="px-4 pt-4">
          <Suspense fallback={null}>
            <HeaderSearch id="msearch" onDone={onClose} className="w-full" />
          </Suspense>
        </div>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {NAV.map((n) => {
            const on = n.match(path);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                onClick={onClose}
                className={`flex min-h-12 items-center justify-between rounded-xl px-4 text-base font-semibold no-underline ${on ? "bg-ink text-paper" : "text-ink hover:bg-stone"}`}
              >
                {n.label}
                {on && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
              </Link>
            );
          })}
        </nav>
        <a
          href={X_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-3 mb-4 flex min-h-12 items-center gap-3 rounded-xl border border-line px-4 text-base font-semibold text-ink no-underline hover:bg-stone [margin-bottom:max(16px,env(safe-area-inset-bottom))]"
        >
          <XIcon size={16} /> Follow Deed on X
        </a>
      </div>
    </dialog>
  );
}
