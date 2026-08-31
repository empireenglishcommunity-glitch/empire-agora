import { NextResponse } from "next/server";

/**
 * A 303 redirect with a RELATIVE `Location`, which is the only kind that survives a proxy.
 *
 * WHY THIS EXISTS — a bug that would have broken every checkout on go-live
 * -----------------------------------------------------------------------
 * Every route handler here used `NextResponse.redirect(new URL(path, req.nextUrl.origin))`.
 * That is the documented pattern and it worked in every local test. In the real container it
 * produced:
 *
 *     location: https://0.0.0.0:3000/ar/join/EEC-2608-ASEG-BDYQ
 *
 * `req.nextUrl.origin` resolves from the address the server is BOUND to, and the Dockerfile
 * sets `HOSTNAME=0.0.0.0` so the container listens on all interfaces. Sending `Host:`,
 * `X-Forwarded-Host` and `X-Forwarded-Proto` exactly as Cloudflare Tunnel does made no
 * difference — the origin was still `0.0.0.0:3000`.
 *
 * A browser cannot follow that. So a buyer would have submitted an order, the order would
 * have been stored correctly, and they would have landed on an error instead of the page
 * carrying their reference code and payment details. Same for the receipt upload, the admin
 * sign-in, and every action in the order queue.
 *
 * The server sees a 303 and considers itself successful, so nothing would have been logged.
 *
 * WHY IT SURVIVED EVERY GATE: locally the app is reached at the address it is bound to, so
 * `origin` happened to be correct and the redirect resolved. The bug needs the app to be
 * behind a proxy on a different host — which is only true in production. `check-live` boots a
 * real server and follows real redirects, and it passed for exactly this reason.
 *
 * WHY RELATIVE RATHER THAN TRUSTING A HEADER: RFC 7231 §7.1.2 permits a relative reference in
 * `Location`, and every browser resolves it against the request URL. That needs no proxy
 * configuration, no trusted-host list, and cannot be spoofed by a forged `X-Forwarded-Host` —
 * which is itself an open-redirect vector. Fewer moving parts and strictly safer.
 *
 * `NextResponse.redirect()` requires an absolute URL, so this constructs the response
 * directly. Cookies still work: `const res = seeOther("/x"); res.cookies.set(...)`.
 */
export function seeOther(path: string): NextResponse {
  if (!path.startsWith("/")) {
    // A guard, not politeness. An absolute URL here would reintroduce the bug, and an
    // attacker-supplied one would make this an open redirect.
    throw new Error(`seeOther expects a root-relative path, got "${path}"`);
  }
  return new NextResponse(null, { status: 303, headers: { location: path } });
}
