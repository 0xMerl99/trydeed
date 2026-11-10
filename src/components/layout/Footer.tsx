import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/ui/Logo";
import { NetworkTag } from "./NetworkGuard";
import { AddressLink } from "@/components/ui/Explorer";
import idl from "@/chain/idl/deed_fun.json";

/** Same structure as the reference footer: logo + tagline on the left, links and network tag on the right. */
export function Footer() {
  const link = "text-soft no-underline hover:text-ink";
  return (
    <footer className="mt-14 bg-deep text-soft">
      {/* the chalk tray: a ledge with three sticks of chalk, like the foot of a blackboard */}
      <div className="chalk-tray" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="wrap flex flex-wrap items-center justify-between gap-x-8 gap-y-5 py-7 text-[13px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <LogoMark tone="dark" size={32} />
          <Wordmark tone="dark" className="text-xl" />
          <span className="text-soft">Own the fees. Launch a coin. Receive the Deed. Auction the rights.</span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/auctions" className={link}>Live Auctions</Link>
          <Link href="/coins" className={link}>Coins</Link>
          <Link href="/launch" className={link}>Launch</Link>
          <Link href="/sell" className={link}>Sell</Link>
          <Link href="/otc" className={link}>OTC Markets</Link>
          <Link href="/activity" className={link}>Activity</Link>
          <Link href="/docs" className={link}>Docs</Link>
          <span className="text-ink"><NetworkTag /></span>
        </nav>
      </div>
      <p className="wrap m-0 pb-6 text-[12px] text-soft">
        Every action is a Solana transaction that you sign. Auctions and OTC offers are enforced by the Deed program <AddressLink value={idl.address} chars={6} />, not by this website.
      </p>
    </footer>
  );
}
