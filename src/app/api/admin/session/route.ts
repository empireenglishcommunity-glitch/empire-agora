import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, isValidAdminToken, adminTokenConfigured } from "@/lib/admin";

/**
 * Owner sign-in for the order queue.
 *
 * A plain form POST so it works without JavaScript, matching the rest of this app.
 * The token goes into an httpOnly cookie rather than a query string, because a query
 * string ends up in server logs, browser history and any shared link.
 */

const MAX_ATTEMPTS = 8;
const WINDOW_MS = 15 * 60_000;
const attempts = new Map<string, { n: number; resetAt: number }>();

function clientKey(req: NextRequest): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

/** Count one failed-guess budget slot. Returns false when the caller is locked out. */
function takeAttempt(req: NextRequest): boolean {
  const key = clientKey(req);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { n: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.n += 1;
  return entry.n <= MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = form.get("token");
  const locale = typeof form.get("locale") === "string" ? String(form.get("locale")) : "en";
  const target = `/${locale === "ar" ? "ar" : "en"}/admin/orders`;

  /**
   * Sign-out is a form POST too, not the DELETE below, because the queue must work
   * without JavaScript — and an operator who cannot sign out on a borrowed phone will
   * simply not sign out.
   *
   * Handled BEFORE the rate limiter, and not counted by it. Signing out is not a
   * guess at the token, so counting it would mean four sign-in/sign-out cycles locks
   * the owner out of their own queue with a correct token in hand.
   */
  if (form.get("action") === "signout") {
    const out = NextResponse.redirect(new URL(target, req.nextUrl.origin), 303);
    out.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
    return out;
  }

  // Brute-forcing a single shared token is exactly the attack this endpoint invites,
  // so real sign-in attempts are rate-limited harder than the public endpoints.
  if (!takeAttempt(req)) {
    return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
  }

  if (!adminTokenConfigured()) {
    // Says "not configured" rather than "wrong", because this one is an operator
    // problem and silently behaving like a wrong password wastes their afternoon.
    return NextResponse.redirect(new URL(`${target}?e=unconfigured`, req.nextUrl.origin), 303);
  }

  if (typeof token !== "string" || !isValidAdminToken(token)) {
    return NextResponse.redirect(new URL(`${target}?e=denied`, req.nextUrl.origin), 303);
  }

  const res = NextResponse.redirect(new URL(target, req.nextUrl.origin), 303);
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60, // 12h — long enough for a work session, not indefinite
  });
  return res;
}

export async function DELETE(req: NextRequest) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  void req;
  return res;
}
