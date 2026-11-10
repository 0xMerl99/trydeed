/** @type {import('next').NextConfig} */
const nextConfig = {
  // A second server (the browser QA suite) needs its own build directory next to the developer's: NEXT_DIST_DIR=.next-qa
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  // Anchor's ESM build touches `exports` when evaluated on the server; load it as the CommonJS package it ships as.
  serverExternalPackages: ["@coral-xyz/anchor"],
  // Remote coin images are rendered with a plain <img> (see Avatar) so no remotePatterns are needed.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
