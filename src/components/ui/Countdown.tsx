"use client";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/format";
import { countdown, countdownParts, countdownShort } from "@/lib/time";

/**
 * Countdown to an ON-CHAIN end time, rendered against the cluster clock (`useNow`), never a local timer that
 * "starts at N". `variant`: clock = 05:41:34 · short = 5h 41m · boxes = HOURS/MIN/SEC tiles.
 */
export function Countdown({ end, variant = "clock", className }: { end: number; variant?: "clock" | "short" | "boxes"; className?: string }) {
  const now = useNow();
  const ready = now > 0;
  const left = end - now;
  const hot = ready && left > 0 && left < 600;

  if (variant === "boxes") {
    const parts = ready ? countdownParts(end, now) : ["--", "--", "--"];
    return (
      <div className={cn("flex gap-2", className)} role="timer" aria-label={ready ? countdown(end, now) : "Loading countdown"}>
        {(["HOURS", "MIN", "SEC"] as const).map((l, i) => (
          <div key={l} className="flex flex-col items-center gap-1">
            <b className="mono grid h-[52px] w-[52px] place-items-center rounded-lg border-2 border-danger-soft text-[26px] font-semibold text-danger-soft">{parts[i]}</b>
            <span className="text-[10px] font-semibold tracking-[0.08em] text-danger-soft">{l}</span>
          </div>
        ))}
      </div>
    );
  }
  const text = !ready ? "—" : variant === "short" ? countdownShort(end, now) : countdown(end, now);
  return (
    <time className={cn("mono", hot && "text-danger", className)} dateTime={new Date(end * 1000).toISOString()} data-testid="countdown">
      {text}
    </time>
  );
}
