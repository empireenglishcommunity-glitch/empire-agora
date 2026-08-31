import type { Locale } from "./config";
import ar from "@/content/ar.json";
import en from "@/content/en.json";

/**
 * All copy lives in JSON dictionaries, never inline in components.
 *
 * Two reasons beyond the usual i18n one: `scripts/check-bidi.mjs` can only gate
 * Arabic copy that lives in a file it can parse, and prices must stay out of copy
 * entirely (they arrive via <Price> from pricing.ts, using a {price} placeholder
 * where a sentence needs one).
 */
export type Dictionary = typeof ar;

const dictionaries: Record<Locale, Dictionary> = {
  ar,
  en: en as Dictionary,
};

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
