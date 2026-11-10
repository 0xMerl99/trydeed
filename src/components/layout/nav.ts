export interface NavItem {
  href: string;
  label: string;
  /** Path prefixes that light this item up. */
  match: (path: string) => boolean;
}

/** The reference's eight destinations in the same order, plus Docs (the in-app documentation). */
export const NAV: NavItem[] = [
  { href: "/auctions", label: "Live Auctions", match: (p) => p.startsWith("/auctions") },
  { href: "/coins", label: "Coins", match: (p) => p.startsWith("/coins") },
  { href: "/launch", label: "Launch", match: (p) => p.startsWith("/launch") },
  { href: "/sell", label: "Sell", match: (p) => p.startsWith("/sell") },
  { href: "/portfolio", label: "Portfolio", match: (p) => p.startsWith("/portfolio") },
  { href: "/otc", label: "OTC Markets", match: (p) => p.startsWith("/otc") && !p.startsWith("/otc/mine") },
  { href: "/otc/mine", label: "My Offers", match: (p) => p.startsWith("/otc/mine") },
  { href: "/activity", label: "Activity", match: (p) => p.startsWith("/activity") },
  { href: "/docs", label: "Docs", match: (p) => p.startsWith("/docs") },
];
