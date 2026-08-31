import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  /**
   * Standalone output — a self-contained Node server, Dockerised on the VPS.
   *
   * THIS REVERSES AN EARLIER DECISION, and the reason matters.
   *
   * The original plan was Cloudflare Pages (precedent: empire-dojo), on the premise
   * that this was a static marketing surface. That premise is gone: the page must
   * read a cookie and a geo header to choose a currency, so it is server-rendered on
   * demand. A static host cannot serve it.
   *
   * Given that, this mirrors the pattern already proven in production by
   * `EEC-MATERIAL/web` — standalone build, Docker, bound to 127.0.0.1, routed through
   * the existing Cloudflare Named Tunnel. No new toolchain, and one fewer thing that
   * can be wrong on a day that also moves the root domain.
   *
   * The edge alternative (next-on-pages / OpenNext) is not ruled out forever, but its
   * compatibility with Next 16 is unverified here and could not be tested without
   * deploying — which is exactly the wrong thing to discover during a cutover.
   */
  output: "standalone",

  images: {
    formats: ["image/avif", "image/webp"],
  },

  /**
   * Legacy paths from the site this repo replaces on the root domain.
   *
   * After the cutover, `empireenglish.online` is served by THIS app, so every route
   * the old app owned either has a home here or 404s. Anything that 404s is a link
   * already shared in Telegram posts, WhatsApp messages and student bookmarks —
   * which is why these are enumerated rather than discovered later.
   *
   * Two classes:
   *   · superseded by this page  → redirect internally
   *   · still owned by the portal → redirect to the portal hostname
   */
  async redirects() {
    const portal = "https://portal.empireenglish.online";

    return [
      // `/plans` is a SECTION of the home page, not a route. The first version of
      // this config pointed /cohort at /ar/plans, which does not exist — the
      // redirect resolved to a 404, which is worse than no redirect because it
      // looks handled.
      { source: "/cohort", destination: "/ar#plans", permanent: true },
      { source: "/:locale(ar|en)/cohort", destination: "/:locale#plans", permanent: true },

      // The waitlist is superseded: the page's own call to action is the free
      // placement test.
      { source: "/waitlist", destination: "/ar", permanent: true },
      { source: "/:locale(ar|en)/waitlist", destination: "/:locale", permanent: true },

      // Still the portal's, and must keep working. The coursebook endpoints are
      // auth-gated and their gate is re-verified after cutover — losing that check
      // is how the Teacher's Edition leaked once already.
      {
        source: "/:locale(ar|en)/portal/:path*",
        destination: `${portal}/:locale/portal/:path*`,
        permanent: false,
      },
      { source: "/api/coursebook/:path*", destination: `${portal}/api/coursebook/:path*`, permanent: false },

      // Content pages the old app owns that this repo does not reimplement.
      { source: "/:locale(ar|en)/guide", destination: `${portal}/:locale/guide`, permanent: false },
      { source: "/:locale(ar|en)/about", destination: `${portal}/:locale/about`, permanent: false },
      { source: "/:locale(ar|en)/accent-lab", destination: `${portal}/:locale/accent-lab`, permanent: false },
    ];
  },
};

export default nextConfig;
