import { NextRequest, NextResponse } from "next/server";
import { createOrder, OrderError, amountForDisplay, type Rail } from "@/commerce/orders";
import { isRailValidFor, railAccount } from "@/commerce/rails";
import { getTier, type Currency, type TierId, type Term } from "@/commerce/pricing";
import { locales } from "@/i18n/config";

/**
 * POST /api/orders — create an order.
 *
 * THIS ENDPOINT MUST NOT LIE. It returns success only when a row is committed.
 *
 * `EEC-MATERIAL`'s waitlist route appends a lead and returns `{ok:true}` even when the
 * write threw. That is a reasonable trade for a lead and a disqualifying one for an
 * order: a buyer who sees "received" and was never recorded has paid into a void, and
 * nobody finds out until they ask why they have no access.
 *
 * The response is also where payment instructions are revealed — never in the page
 * markup (R5.7).
 *
 * Spec: requirements.md R5.1–R5.4, R5.7, R12.4.
 */

const MAX_BODY_BYTES = 4 * 1024;

const TIERS = ["darb", "asas", "tarkeez", "vip", "nukhba"] as const;
const TERMS = ["monthly", "annual"] as const;
const CURRENCIES = ["EGP", "USD"] as const;

/** Simple in-process limiter. Orders are rare; abuse is not. */
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 12;

function clientKey(req: NextRequest): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function rateLimited(req: NextRequest): boolean {
  const key = clientKey(req);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

export async function POST(req: NextRequest) {
  if (rateLimited(req)) {
    return NextResponse.json({ error: "too_many_requests" }, { status: 429 });
  }

  // Bound the body before parsing. An unbounded JSON parse is a cheap way to make a
  // 384 MB container fall over.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "body_too_large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw || "{}");
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // ── Validate everything. Nothing is inferred, nothing is defaulted silently. ──
  const currency = body.currency as Currency;
  if (!CURRENCIES.includes(currency)) {
    return NextResponse.json({ error: "invalid_currency" }, { status: 400 });
  }

  const tier = body.tier as TierId;
  if (!TIERS.includes(tier)) {
    return NextResponse.json({ error: "invalid_tier" }, { status: 400 });
  }

  const term = body.term as Term;
  if (!TERMS.includes(term)) {
    return NextResponse.json({ error: "invalid_term" }, { status: 400 });
  }

  const locale = typeof body.locale === "string" && (locales as readonly string[]).includes(body.locale)
    ? body.locale
    : "ar";

  const rail = body.rail;
  if (typeof rail !== "string" || !isRailValidFor(rail, currency)) {
    // Also the geo gate: an EGP-only rail cannot be paired with USD, and vice versa.
    return NextResponse.json({ error: "invalid_rail_for_currency" }, { status: 400 });
  }

  // A tier that is not sold in this currency must not be orderable, even though the
  // ledger checks this too. Two layers, because this one can give a better message.
  if (getTier(tier).availability[currency] === "unavailable") {
    return NextResponse.json({ error: "tier_not_available_in_currency" }, { status: 400 });
  }

  const name = str(body.name, 120);
  const contact = str(body.contact, 80);
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  if (!contact) return NextResponse.json({ error: "contact_required" }, { status: 400 });

  const idempotencyKey =
    str(req.headers.get("idempotency-key"), 200) ?? str(body.idempotencyKey, 200);
  if (!idempotencyKey) {
    // Required, not generated server-side: a server-generated key cannot deduplicate
    // a retry, which is the entire point.
    return NextResponse.json({ error: "idempotency_key_required" }, { status: 400 });
  }

  // ── Create. A throw here becomes a 5xx; it never becomes a fake success. ──
  let created;
  try {
    created = createOrder({
      locale,
      currency,
      tier,
      term,
      rail: rail as Rail,
      name,
      contact,
      email: str(body.email, 160),
      country: str(body.country, 60),
      discord: str(body.discord, 80),
      source: str(body.source, 60),
      idempotencyKey,
    });
  } catch (err) {
    if (err instanceof OrderError && err.code === "invalid") {
      return NextResponse.json({ error: "invalid_order" }, { status: 400 });
    }
    // Loud, and deliberately not dressed up as success.
    console.error("[orders] failed to create order:", err);
    return NextResponse.json({ error: "order_not_stored" }, { status: 500 });
  }

  const { order, reused } = created;

  // Payment details are attached HERE and nowhere else — not in any page's markup.
  const account = railAccount(order.rail);

  if (!account) {
    // The order is committed but this rail has no configured account, so the buyer
    // cannot actually pay it.
    //
    // Reported as an error rather than returned as a success with a null account. A
    // 201 here would leave the buyer holding a reference they can never pay and the
    // owner with an unpayable row in the queue. Better: tell them now so they pick a
    // working rail. The committed order is harmless — it stays `created`, and the
    // same idempotency key returns it if they retry on a rail that works.
    console.error(
      `[orders] rail "${order.rail}" has no configured account; ` +
        `order ${order.referenceCode} cannot be paid. Set its env var.`,
    );
    return NextResponse.json(
      { error: "rail_not_configured", rail: order.rail },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      referenceCode: order.referenceCode,
      amount: amountForDisplay(order),
      currency: order.currency,
      tier: order.tier,
      term: order.term,
      rail: order.rail,
      account,
      reused,
    },
    { status: reused ? 200 : 201 },
  );
}
