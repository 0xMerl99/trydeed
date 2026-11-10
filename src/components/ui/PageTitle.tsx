import type { ReactNode } from "react";

/** Eyebrow + H1 (last word underlined in gold) + one paragraph — the heading block every page in the reference opens with. */
export function PageTitle({ eyebrow, lead, hl, children, aside }: { eyebrow: ReactNode; lead?: string; hl: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="page-title">
      <span className="eyebrow">{eyebrow}</span>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1>
            {lead ? `${lead} ` : ""}
            <em className="hl">{hl}</em>
          </h1>
          {children && <p>{children}</p>}
        </div>
        {aside}
      </div>
    </div>
  );
}
