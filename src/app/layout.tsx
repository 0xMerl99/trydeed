import type { Metadata, Viewport } from "next";
import { Fredericka_the_Great, JetBrains_Mono, Kalam } from "next/font/google";
import "./globals.css";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { NetworkGuard } from "@/components/layout/NetworkGuard";
import { Ticker } from "@/components/layout/Ticker";
import { AppProviders } from "@/components/providers/AppProviders";
import { config } from "@/lib/config";
import { X_HANDLE } from "@/lib/social";

// Chalkboard type. Headlines: chalk lettering. Body: a readable hand. Numbers: monospaced, so amounts never jump width.
const fred = Fredericka_the_Great({ subsets: ["latin"], weight: "400", variable: "--font-fred", display: "swap" });
const kalam = Kalam({ subsets: ["latin"], weight: ["300", "400", "700"], variable: "--font-kalam", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jbmono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  title: { default: "Deed — Own the fees.", template: "%s · Deed" },
  description:
    "Launch a coin. Receive the Deed. Auction the rights. Deed is the ownership layer for coins launched on Pump.fun: a unique 1/1 Ownership NFT that controls 100% of a coin’s creator fees.",
  openGraph: { title: "Deed — Own the fees.", description: "Launch a coin. Receive the Deed. Auction the rights.", siteName: "Deed", type: "website" },
  twitter: { card: "summary_large_image", site: X_HANDLE, creator: X_HANDLE, title: "Deed — Own the fees.", description: "Launch a coin. Receive the Deed. Auction the rights." },
};

export const viewport: Viewport = { themeColor: "#131e18", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fred.variable} ${kalam.variable} ${mono.variable}`}>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded focus:bg-ink focus:px-3 focus:py-2 focus:text-paper">
          Skip to content
        </a>
        <AppProviders>
          <Header />
          <NetworkGuard />
          <Ticker />
          <main id="main" className="min-h-[60vh] pb-6">
            {children}
          </main>
          <Footer />
        </AppProviders>
      </body>
    </html>
  );
}
