/**
 * FX policy — data, not prose.
 *
 * EGP prices are NOT a live conversion of USD prices. They are set from a target
 * ratio and reviewed on a trigger. This file records the anchor so that a future
 * session can tell whether a review is due instead of guessing.
 *
 * Spec: requirements.md §4.5, R2.4.
 */

import { TIERS, type Currency, type TierId } from "./pricing";

/**
 * The reference rate the current EGP prices were set against.
 *
 * Source: Wise mid-market, read 2026-08-31 (30-day average 50.35 at the time).
 * Rate data summarised from Wise; content rephrased for compliance with
 * licensing restrictions.
 */
export const FX_ANCHOR = {
  egpPerUsd: 50.82,
  recordedOn: "2026-08-31",
  source: "Wise mid-market",
} as const;

/**
 * Egypt pays roughly one third of the international price in real terms.
 *
 * This is deliberate purchasing-power pricing and it matches the documented
 * strategy (`EEC-MATERIAL/strategy/01-foundational-strategy.md` §12 specifies a
 * Gulf/diaspora tier at 3–5× the Egypt tier). The live prices independently
 * landed at 3.05×, so this codifies an instinct that was already correct.
 *
 * The ratio deliberately narrows on VIP and the assessment, because both consume
 * near-fixed owner time regardless of the buyer's passport.
 */
export const TARGET_EGYPT_RATIO = 3.0;

/** Volume tiers held near TARGET_EGYPT_RATIO; the rest are intentional. */
export const RATIO_ENFORCED_TIERS: readonly TierId[] = [
  "darb",
  "asas",
  "tarkeez",
] as const;

/** Tolerance on the ratio for enforced tiers, as a fraction. */
export const RATIO_TOLERANCE = 0.15;

/**
 * A move of this much from the anchor triggers a REVIEW — a deliberate
 * re-pricing decision, never an automatic conversion.
 *
 * At the 50.82 anchor that means revisiting at roughly 58.4 or 43.2 EGP/USD.
 * The Egyptian pound has devalued repeatedly; annual EGP members are locked for
 * their term, which is real accepted exposure, priced as the cost of removing
 * eleven churn decisions.
 */
export const REVIEW_IF_MOVES_BEYOND_PCT = 15;

export function reviewThresholds(): { upper: number; lower: number } {
  const f = REVIEW_IF_MOVES_BEYOND_PCT / 100;
  return {
    upper: FX_ANCHOR.egpPerUsd * (1 + f),
    lower: FX_ANCHOR.egpPerUsd * (1 - f),
  };
}

/** True if the current rate has moved far enough to warrant a pricing review. */
export function isReviewDue(currentEgpPerUsd: number): boolean {
  const { upper, lower } = reviewThresholds();
  return currentEgpPerUsd >= upper || currentEgpPerUsd <= lower;
}

/** An EGP amount expressed in USD at the anchor rate — for internal analysis. */
export function egpToUsdAtAnchor(egp: number): number {
  return egp / FX_ANCHOR.egpPerUsd;
}

/**
 * How many times more an international buyer pays than an Egyptian one, in real
 * terms, for the same tier. Null if the tier is not sold in both currencies.
 */
export function egyptRatio(tierId: TierId): number | null {
  const tier = TIERS.find((t) => t.id === tierId);
  const egp = tier?.price.EGP?.monthly;
  const usd = tier?.price.USD?.monthly;
  if (!egp || !usd) return null;
  return usd / egpToUsdAtAnchor(egp);
}

/**
 * Formatting note, deliberately colocated with the FX policy:
 *
 * A price is NEVER rendered as a converted equivalent of the other currency, and
 * EGP and USD prices are never shown in the same view. The Egypt tier is a third
 * of the international price; publishing that side by side to the higher-paying
 * market costs money for no benefit. Enforced by a CI gate in Phase 4.
 */
export const CURRENCY_ISOLATION_REQUIRED = true;

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  EGP: "ج.م",
  USD: "$",
};
