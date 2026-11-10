"use client";
import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/ui/Icons";
import { CA } from "@/lib/social";
import { short } from "@/lib/format";

/** The token's contract address as a copy button: `CA  CyM2…pump`. */
export function CaChip({ className = "" }: { className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={`Copy the contract address: ${CA}`}
      aria-label={`Copy contract address ${CA}`}
      data-testid="ca-chip"
      className={`h-10 items-center gap-2 rounded-[10px] border border-line bg-field px-3 text-[13px] font-semibold text-ink hover:border-ink ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(CA);
        } catch {
          window.prompt("Copy the contract address:", CA);
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      <span className="text-gold">CA</span>
      <span className="mono normal-case">{done ? "Copied" : short(CA, 4)}</span>
      {done ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
    </button>
  );
}
