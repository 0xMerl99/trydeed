"use client";
import { useState } from "react";
import { hueOf } from "@/lib/format";

const SIZES = { xs: 28, sm: 38, md: 56, sq: 62, lg: 76, xl: 112 } as const;
export type AvatarSize = keyof typeof SIZES;

/** Coin image with a restrained tinted-initial fallback (no broken-image icons, no network dependency). */
export function Avatar({ coin, size = "md", square = false }: { coin: { symbol?: string; image?: string }; size?: AvatarSize; square?: boolean }) {
  const [broken, setBroken] = useState(false);
  const t = (coin.symbol || "?").toUpperCase();
  const px = SIZES[size];
  const hue = hueOf(t);
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center overflow-hidden border-2 border-ink/70 font-display"
      // coloured chalk: a pastel disc with board-coloured lettering, so the initial is always readable
      style={{ width: px, height: px, borderRadius: square || size === "sq" || size === "xl" ? Math.max(8, px * 0.14) : "50%", background: `hsl(${hue} 42% 76%)`, color: "#131e18", fontSize: px * 0.42 }}
      aria-hidden="true"
    >
      {coin.image && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coin.image} alt="" loading="lazy" className="h-full w-full object-cover" onError={() => setBroken(true)} />
      ) : (
        t[0]
      )}
    </span>
  );
}
