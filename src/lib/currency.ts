// Currency resolution.
//
// THE RULE: exactly one currency per visitor, never both, never a converted
// equivalent (requirements R1.1, R1.3).
//
// The Egypt tier is roughly a third of the international price in real terms. That
// is deliberate purchasing-power pricing — but a side-by-side toggle publishes the
// asymmetry to the higher-paying market for no benefit. So the page picks one and
// commits to it, and a CI gate asserts no rendered document contains both.
//
// Suggested by geo, never enforced by it: VPNs are ordinary, and Gulf residents
// browsing on Egyptian SIMs are a real segment. The visitor can always override,
// and the override is phrased as a statement about where they PAY FROM — which is
// what actually determines the rail (R1.5) — rather than a claim about who they are.

import { cookies, headers } from "next/headers";
import type { Currency } from "@/commerce/pricing";

export const CURRENCY_COOKIE = "eec_currency";

/** The query parameter, so a shared link keeps its currency. */
export const CURRENCY_PARAM = "c";

function normalise(value: string | undefined | null): Currency | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (v === "EGP" || v === "EG") return "EGP";
  if (v === "USD") return "USD";
  return null;
}

/**
 * Resolve the currency for this request, in precedence order:
 *   1. an explicit `?c=` in the URL (a shared link keeps its pricing)
 *   2. the visitor's saved choice
 *   3. Cloudflare's country header — a SUGGESTION only
 *   4. USD
 *
 * USD is the default rather than EGP on purpose: showing the lower price to
 * someone the system cannot place would leak the Egypt tier to the whole world,
 * and an Egyptian visitor who sees USD can switch in one tap. The failure is
 * recoverable in one direction and not in the other.
 */
export async function resolveCurrency(searchParam?: string): Promise<Currency> {
  const fromUrl = normalise(searchParam);
  if (fromUrl) return fromUrl;

  const cookieStore = await cookies();
  const fromCookie = normalise(cookieStore.get(CURRENCY_COOKIE)?.value);
  if (fromCookie) return fromCookie;

  const h = await headers();
  const country = h.get("cf-ipcountry") ?? h.get("x-vercel-ip-country");
  if (country && country.toUpperCase() === "EG") return "EGP";

  return "USD";
}

/** The other currency — for the single switch control. */
export function otherCurrency(currency: Currency): Currency {
  return currency === "EGP" ? "USD" : "EGP";
}

/**
 * Arabic register follows the currency, per the style guide amendment of
 * 2026-08-31: Egyptian colloquial on the EGP path (same audience as the lessons),
 * lighter MSA on the USD path, because heavy Egyptian idiom reads as foreign to a
 * Gulf buyer — and that segment pays roughly three times more, so it is the least
 * able to absorb friction.
 *
 * The copy files do not yet carry an MSA variant; this is the seam it will hang on.
 */
export function registerFor(currency: Currency): "egyptian" | "msa" {
  return currency === "EGP" ? "egyptian" : "msa";
}
