import type { Locale } from "./config";
import ar from "@/content/ar.checkout.json";
import en from "@/content/en.checkout.json";

/**
 * Checkout copy — the order form, the confirmation page, and the owner's queue.
 *
 * Its own dictionary for the same reason the legal copy has one: it changes for
 * different reasons and on a different cadence than the marketing copy. A reworded
 * payment instruction should not appear in the same diff as a headline.
 *
 * The `ar.checkout.json` filename is load-bearing — the bidi gate globs
 * `^ar.*\.json$`. Payment copy is the single worst place in this app for mixed
 * direction, because every rail is a Latin brand name sitting inside Arabic prose,
 * and one sentence naming two rails is already a bidi failure.
 *
 * So the Arabic copy never names more than one rail per line, and mostly names none:
 * the instructions say "the wallet app" and "the number above" and let the RADIO
 * LABEL carry the Latin brand, where it stands alone and matches what the buyer sees
 * in their own app. Account numbers and amounts never appear in copy at all — they
 * are rendered from the ledger inside <Ltr>.
 */
export type CheckoutDictionary = typeof ar;

const dictionaries: Record<Locale, CheckoutDictionary> = {
  ar,
  en: en as CheckoutDictionary,
};

export function getCheckout(locale: Locale): CheckoutDictionary {
  return dictionaries[locale];
}
