import type { Locale } from "./config";
import ar from "@/content/ar.legal.json";
import en from "@/content/en.legal.json";

/**
 * Legal copy, kept in its own dictionary rather than in the main one.
 *
 * Two reasons. It is long and would swamp the marketing copy; and it changes for
 * different reasons and on a different cadence — a price change should never sit in
 * the same diff as a data-retention change.
 *
 * The `ar.legal.json` filename matters: the bidi gate globs `^ar.*\.json$`, so this
 * file is covered by it. Legal prose is where mixed-direction text is most likely to
 * creep in, because it names payment rails and services.
 */
export type LegalDictionary = typeof ar;

const dictionaries: Record<Locale, LegalDictionary> = {
  ar,
  en: en as LegalDictionary,
};

export function getLegal(locale: Locale): LegalDictionary {
  return dictionaries[locale];
}
