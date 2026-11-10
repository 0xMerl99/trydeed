/**
 * Hand-drawn chalk doodles around the hero's Deed certificate: a gavel, sparkles and an arrow with a note.
 * Original line art, purely decorative (aria-hidden). The outside-the-box pieces are hidden on narrow screens so
 * they can never push the page wider than the viewport.
 */
const CHALK = "#F5F5F4";
const GOLD = "#D4A017";

function Sparkle({ className = "", size = 22, color = GOLD }: { className?: string; size?: number; color?: string }) {
  return (
    <svg className={`absolute ${className}`} width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
      <path d="M0 -10 Q1 -1.5 10 0 Q1 1.5 0 10 Q-1 1.5 -10 0 Q-1 -1.5 0 -10Z" fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function ChalkDoodles() {
  return (
    <div className="pointer-events-none absolute inset-0 select-none" aria-hidden="true">
      <Sparkle className="-right-3 -top-4" size={26} />
      <Sparkle className="-bottom-5 left-8" size={20} color={CHALK} />
      <Sparkle className="right-10 -bottom-7" size={16} />

      {/* a gavel dropping on the corner of the certificate */}
      <svg className="absolute -left-12 -top-14 hidden w1181:block" width="104" height="104" viewBox="0 0 110 110" fill="none" stroke={CHALK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 30 L54 12 L68 36 L38 54 Z" />
        <path d="M33 25 L47 49" strokeWidth="2" />
        <path d="M52 46 L90 100" strokeWidth="4" />
        <path d="M72 106 H104" />
        <path d="M8 16 l11 6 M4 31 l13 2 M17 5 l5 11" stroke={GOLD} strokeWidth="2.4" />
      </svg>

      {/* a note above the certificate, with an arrow curling down to it */}
      <span className="absolute -top-[52px] right-[70px] hidden rotate-3 text-[16px] font-bold text-gold-ink w901:block">your 1/1 Deed</span>
      <svg className="absolute -top-[30px] right-[34px] hidden w901:block" width="64" height="40" viewBox="0 0 64 40" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 4 C 26 2, 46 10, 52 30" />
        <path d="M42 24 L52 32 L58 20" />
      </svg>
    </div>
  );
}
