"use client";
import type { ReactNode } from "react";
import { friendlyError } from "@/lib/errors";
import { Button } from "./Button";

export const EmptyState = ({ children, className = "" }: { children: ReactNode; className?: string }) => <div className={`empty ${className}`}>{children}</div>;

export const Skeleton = ({ h = 20, className = "" }: { h?: number | string; className?: string }) => (
  <div className={`skeleton ${className}`} style={{ height: h }} aria-hidden="true" />
);

/** Full-page loading placeholder, shaped like the content it replaces. */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="wrap py-14" role="status" aria-label="Loading">
      <h1 className="sr-only">Loading</h1>
      <Skeleton h={18} className="mb-4 w-28" />
      <Skeleton h={48} className="mb-8 w-2/3 max-w-xl" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} h={200} />
        ))}
      </div>
    </div>
  );
}

export const CardGridSkeleton = ({ n = 4, h = 154, cols = "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" }: { n?: number; h?: number; cols?: string }) => (
  <div className={`grid gap-4 ${cols}`} role="status" aria-label="Loading">
    {Array.from({ length: n }).map((_, i) => (
      <Skeleton key={i} h={h} />
    ))}
  </div>
);

/** Honest failure state: shows the real error and offers a retry. */
export function ErrorState({ error, onRetry, back }: { error: Error; onRetry?: () => void; back?: { href: string; label: string } }) {
  return (
    <div className="empty" role="alert">
      <p className="mb-3">{friendlyError(error)}</p>
      <div className="flex justify-center gap-2">
        {onRetry && (
          <Button size="sm" variant="gold" onClick={onRetry}>
            Try again
          </Button>
        )}
        {back && (
          <Button size="sm" href={back.href}>
            {back.label}
          </Button>
        )}
      </div>
    </div>
  );
}
