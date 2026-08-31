import { NextRequest, NextResponse } from "next/server";
import { seeOther } from "@/lib/redirect";
import { CURRENCY_COOKIE } from "@/lib/currency";
import { locales, defaultLocale } from "@/i18n/config";

/**
 * Persist a currency choice, then send the visitor back.
 *
 * WHY A ROUTE HANDLER AND NOT A CLICK HANDLER
 * -------------------------------------------
 * `resolveCurrency` reads a cookie, but a server component cannot write one during
 * render — so before this existed the choice lived only in `?c=`, and it was lost
 * the moment the visitor followed any link. Requirement R1.4 asks for the choice to
 * persist across navigation.
 *
 * Doing it here rather than in client JavaScript keeps the switch working with
 * JavaScript disabled (R11.4), which matters on a page whose audience is on
 * constrained mobile connections. It is a plain link to a GET endpoint that sets a
 * cookie and redirects.
 */

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function GET(req: NextRequest) {
  const to = (req.nextUrl.searchParams.get("to") ?? "").toUpperCase();
  if (to !== "EGP" && to !== "USD") {
    return NextResponse.json({ error: "to must be EGP or USD" }, { status: 400 });
  }

  /**
   * Only same-origin, locale-prefixed paths are accepted as a destination.
   *
   * `next` comes from the query string, so echoing it into a redirect unvalidated is
   * a textbook open-redirect: an attacker could send a link that appears to be this
   * site and lands the visitor somewhere else with the trust already earned.
   */
  const requested = req.nextUrl.searchParams.get("next") ?? "";
  const safeNext = isSafeInternalPath(requested) ? requested : `/${defaultLocale}`;

  // Keep the parameter in the URL too, so a copied link still carries the currency
  // even for someone who arrives without the cookie. Built as a relative path, never
  // against `req.nextUrl.origin` — see src/lib/redirect.ts for why that origin is wrong
  // behind a proxy.
  const [pathOnly, existingQuery] = safeNext.split("?");
  const params = new URLSearchParams(existingQuery ?? "");
  params.set("c", to);
  const res = seeOther(`${pathOnly}?${params.toString()}`);
  res.cookies.set(CURRENCY_COOKIE, to, {
    path: "/",
    maxAge: ONE_YEAR,
    httpOnly: false, // not a secret; it only chooses which price list is shown
    sameSite: "lax",
  });
  return res;
}

function isSafeInternalPath(value: string): boolean {
  // Must be a root-relative path, and not a protocol-relative "//evil.com".
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  const [pathOnly] = value.split("?");
  const segments = pathOnly.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  return (locales as readonly string[]).includes(segments[0]);
}
