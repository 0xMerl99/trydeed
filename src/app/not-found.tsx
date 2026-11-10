import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="wrap py-24 text-center">
      <span className="eyebrow">404</span>
      <h1 className="display my-4 text-5xl font-semibold tracking-tight">This page <em className="hl">isn’t on the register.</em></h1>
      <p className="muted mx-auto mb-6 max-w-md">The page you’re looking for doesn’t exist, or the link is wrong.</p>
      <div className="flex justify-center gap-2.5"><Button variant="gold" href="/">Go home</Button><Button href="/auctions">View Live Auctions</Button></div>
    </div>
  );
}
