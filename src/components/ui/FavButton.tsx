"use client";
import { HeartIcon } from "./Icons";
import { useToast } from "./Toast";
import { useWatchlist } from "@/hooks/useWatchlist";

/** Watch heart. Saved in this browser only, which the tooltip says. */
export function FavButton({ id, className = "" }: { id: string; className?: string }) {
  const { has, toggle } = useWatchlist();
  const toast = useToast();
  const on = has(id);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove from watchlist" : "Add to watchlist"}
      title="Watchlist (saved in this browser)"
      className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:text-ink aria-pressed:text-danger ${className}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toast(toggle(id) ? "Added to your watchlist" : "Removed from your watchlist");
      }}
    >
      <HeartIcon size={18} fill={on ? "currentColor" : "none"} />
    </button>
  );
}
