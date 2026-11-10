import Link from "next/link";

/**
 * The Deed mark: a landscape title-deed — thin border, a gold inner rule, three lines of text, and a small
 * gold seal. It is meant to read as an ownership document, not a token logo. Drawn in chalk on the board by default.
 */
export function LogoMark({ size = 36, tone = "dark", className = "" }: { size?: number; tone?: "light" | "dark"; className?: string }) {
  // The UI is a dark chalkboard, so the default mark is chalk on the board. `light` is for light backgrounds.
  const ink = tone === "light" ? "#0A0A0A" : "#F5F5F4";
  const paper = tone === "light" ? "#F5F5F4" : "#131E18";
  return (
    <svg width={size} height={(size * 30) / 40} viewBox="0 0 40 30" fill="none" aria-hidden="true" className={`shrink-0 ${className}`}>
      <rect x="1" y="1" width="38" height="28" rx="3" fill={paper} stroke={ink} strokeWidth="2" />
      <rect x="4.5" y="4.5" width="31" height="21" rx="1.5" stroke="#D4A017" strokeWidth="1" />
      <path d="M9 10h14M9 14.2h10M9 18.4h7" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="29.5" cy="19" r="4.3" fill="#D4A017" />
      <circle cx="29.5" cy="19" r="2.3" stroke="#0A0A0A" strokeWidth="1" />
    </svg>
  );
}

export function Wordmark({ tone = "dark", className = "" }: { tone?: "light" | "dark"; className?: string }) {
  // chalk lettering on the board (`dark`); board-coloured lettering on a light background (`light`)
  return (
    <span className={`display inline-flex items-baseline tracking-[0.08em] ${tone === "dark" ? "text-ink" : "text-paper"} ${className}`}>
      DEED
    </span>
  );
}

/** The header logo shrinks on phones so a connected wallet chip and the menu button always fit beside it. */
export function Logo({ tone = "dark", href = "/" }: { tone?: "light" | "dark"; href?: string | null }) {
  const inner = (
    <>
      <LogoMark tone={tone} size={46} className="!h-[27px] !w-9 w480:!h-[34px] w480:!w-[46px]" />
      <Wordmark tone={tone} className="text-[16px] w480:text-[24px]" />
    </>
  );
  return href ? (
    <Link href={href} className="inline-flex min-w-0 items-center gap-2 no-underline w480:gap-2.5" aria-label="Deed home">
      {inner}
    </Link>
  ) : (
    <span className="inline-flex items-center gap-2.5">{inner}</span>
  );
}
