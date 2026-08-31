import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Target is Cloudflare Pages (precedent: empire-dojo), explicitly not another
  // container on the 4 GB VPS that already runs ~10 services. The order endpoint
  // arrives in Phase 6 as a Pages Function; until then this builds as a static
  // marketing surface.
  images: {
    formats: ["image/avif", "image/webp"],
  },

  async redirects() {
    // Legacy paths from the site this repo replaces on the root domain.
    // Portal paths are handled at the edge during the Phase 5 cutover, not here.
    return [
      { source: "/cohort", destination: "/ar/plans", permanent: true },
      { source: "/ar/cohort", destination: "/ar/plans", permanent: true },
      { source: "/en/cohort", destination: "/en/plans", permanent: true },
    ];
  },
};

export default nextConfig;
