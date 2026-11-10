"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BellIcon, MenuIcon } from "@/components/ui/Icons";
import { Logo } from "@/components/ui/Logo";
import { ConnectButton } from "@/components/wallet/ConnectButton";
import { useDeedWallet } from "@/components/wallet/DeedWallet";
import { useNotifications } from "@/hooks/useNotifications";
import { HeaderSearch } from "./HeaderSearch";
import { MobileMenu } from "./MobileMenu";
import { NAV } from "./nav";

function Bell() {
  const { address } = useDeedWallet();
  const { unread } = useNotifications();
  if (!address) return null;
  return (
    <Link
      href="/otc/mine?tab=notes"
      aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
      className="relative hidden h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-line bg-field hover:border-ink w480:grid"
    >
      <BellIcon size={17} />
      {unread > 0 && (
        <span className="mono absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full bg-gold px-1 text-[10px] font-bold text-paper">{unread > 99 ? "99+" : unread}</span>
      )}
    </Link>
  );
}

export function Header() {
  const path = usePathname();
  const [menu, setMenu] = useState(false);

  useEffect(() => setMenu(false), [path]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <div className="wrap flex h-[69px] items-center gap-3 sm:gap-4">
        <Logo />

        {/* desktop nav */}
        <nav aria-label="Main" className="hidden shrink-0 items-center gap-0.5 w1200:flex">
          {NAV.map((n) => {
            const on = n.match(path);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={on ? "page" : undefined}
                className={`whitespace-nowrap rounded-[10px] px-2.5 py-[9.5px] text-[13.5px] font-semibold no-underline transition-colors ${on ? "bg-ink text-paper" : "text-ink hover:bg-stone"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-2.5">
          <Suspense fallback={<div className="hidden h-10 w-full max-w-[260px] rounded-[10px] border border-line bg-field w1200:block" />}>
            <HeaderSearch className="hidden w-full min-w-[150px] max-w-[260px] w1200:flex" />
          </Suspense>
          <Bell />
          <ConnectButton />
          <button
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] border border-line bg-field hover:border-ink w1200:hidden"
            aria-label="Open menu"
            aria-expanded={menu}
            aria-controls="mobile-menu"
            onClick={() => setMenu(true)}
            data-testid="menu-button"
          >
            <MenuIcon size={20} />
          </button>
        </div>
      </div>
      <MobileMenu open={menu} onClose={() => setMenu(false)} />
    </header>
  );
}
