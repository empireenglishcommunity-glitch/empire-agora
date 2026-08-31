import { NextRequest, NextResponse } from "next/server";
import { seeOther } from "@/lib/redirect";
import { createOrder, OrderError, type Rail } from "@/commerce/orders";
import { isRailValidFor, railAccount } from "@/commerce/rails";
import { getTier, type Currency, type TierId, type Term } from "@/commerce/pricing";
import { locales } from "@/i18n/config";
import { randomUUID } from "node:crypto";

/**
 * The buyer-facing submit handler.
 *
 * A PLAIN FORM POST that redirects, so the whole checkout works with JavaScript
 * disabled or broken — which on a constrained Egyptian mobile connection is not a
 * hypothetical. `/api/orders` (JSON) stays for programmatic use; this is the one a
 * human actually hits.
 *
 * On success it redirects to the confirmation page, which is where payment
 * instructions live. They are never rendered into the form page (requirements R5.7).
 *
 * Errors redirect BACK to the form with a code rather than rendering a dead end, so a
 * buyer who mistyped a field still has their other answers and a way forward.
 */

const TIERS = ["darb", "asas", "tarkeez", "vip", "nukhba"] as const;
const TERMS = ["monthly", "annual"] as const;
const CURRENCIES = ["EGP", "USD"] as const;

const MAX_ATTEMPTS = 20;
const WINDOW_MS = 10 * 60_000;
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

function field(form: FormData, name: string, max: number): string | null {
  const raw = form.get(name);
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v || v.length > max) return null;
  return v;
}

export async function POST(req: NextRequest) {
    const key = clientKey(req);
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { n: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.n += 1;
    if (entry.n > MAX_ATTEMPTS) {
      return seeOther(`/ar/join?e=rate`);
    }
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return seeOther(`/ar/join?e=invalid`);
  }

  const localeRaw = form.get("locale");
  const locale =
    typeof localeRaw === "string" && (locales as readonly string[]).includes(localeRaw)
      ? localeRaw
      : "ar";

  const back = (code: string, extra = "") =>
    seeOther(`/${locale}/join?e=${code}${extra}`);

  const currency = form.get("currency") as Currency;
  if (!CURRENCIES.includes(currency)) return back("currency");

  const tier = form.get("tier") as TierId;
  if (!TIERS.includes(tier)) return back("tier");

  const term = form.get("term") as Term;
  if (!TERMS.includes(term)) return back("term");

  const rail = form.get("rail");
  if (typeof rail !== "string" || !isRailValidFor(rail, currency)) {
    return back("rail", `&tier=${tier}&term=${term}`);
  }

  if (getTier(tier).availability[currency] === "unavailable") {
    return back("tier", `&term=${term}`);
  }

  /**
   * The 18+ affirmation. An unchecked box submits NOTHING — the field is simply absent —
   * so this must test for presence, not for a falsy value.
   */
  if (form.get("ageConfirmed") !== "yes") {
    return back("age", `&tier=${tier}&term=${term}`);
  }

  const name = field(form, "name", 120);
  const contact = field(form, "contact", 80);
  if (!name) return back("name", `&tier=${tier}&term=${term}`);
  if (!contact) return back("contact", `&tier=${tier}&term=${term}`);

  // A rail with no configured account cannot be paid, so refuse BEFORE creating an
  // order — otherwise the queue fills with rows nobody can settle.
  if (!railAccount(rail as Rail)) {
    console.error(`[orders] rail "${rail}" is not configured; refusing submission`);
    return back("rail_unavailable", `&tier=${tier}&term=${term}`);
  }

  /**
   * Idempotency key.
   *
   * Taken from the form when present — the form page mints one per render, so the
   * browser's own "resubmit?" prompt and a double tap both reuse it. Falls back to a
   * fresh UUID rather than failing, because a missing key must not block a real buyer.
   */
  const idempotencyKey = field(form, "idempotencyKey", 200) ?? randomUUID();

  try {
    const { order } = createOrder({
      locale,
      currency,
      tier,
      term,
      rail: rail as Rail,
      name,
      contact,
      email: field(form, "email", 160),
      country: field(form, "country", 60),
      discord: field(form, "discord", 80),
      source: field(form, "source", 60),
      ageConfirmed: true,
      idempotencyKey,
    });

    return seeOther(`/${locale}/join/${order.referenceCode}`);
  } catch (err) {
    if (err instanceof OrderError && err.code === "invalid") {
      return back("invalid", `&tier=${tier}&term=${term}`);
    }
    // Loud in the log, and honest to the buyer: never a confirmation page for an
    // order that was not stored.
    console.error("[orders] submit failed:", err);
    return back("storage", `&tier=${tier}&term=${term}`);
  }
}
