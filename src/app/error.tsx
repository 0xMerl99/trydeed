"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";

/** Route-level error boundary: a render failure shows a recoverable message instead of a blank page. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="wrap py-24 text-center" role="alert">
      <span className="eyebrow">Something broke</span>
      <h1 className="display my-4 text-4xl font-semibold tracking-tight">This page failed to load.</h1>
      <p className="muted mx-auto mb-6 max-w-md">Nothing was sent to your wallet. Try again, or go back home.</p>
      <div className="flex justify-center gap-2.5"><Button variant="gold" onClick={reset}>Try again</Button><Button href="/">Go home</Button></div>
    </div>
  );
}
