// Locale config. Mirrors EEC-MATERIAL/web/src/i18n/config.ts so both properties
// agree on routing while this repo replaces the root domain.
//
// Arabic is the DEFAULT and CANONICAL conversion path — not a translation. The
// buyer is an Arab who wants to learn English; selling to them in English creates
// anxiety and filters out beginners, who are the largest winnable segment.

export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ar";

export const localeDir: Record<Locale, "rtl" | "ltr"> = {
  ar: "rtl",
  en: "ltr",
};

export const localeLabel: Record<Locale, string> = {
  ar: "العربية",
  en: "English",
};

/**
 * Arabic register differs by market, and the currency split gives us this free.
 *
 * Egyptian colloquial for the EGP path (per the style guide §1, whose audience is
 * Egyptian). Lighter MSA for the USD path, because heavy Egyptian idiom reads as
 * foreign to a Gulf buyer. This is a narrow, documented extension of the guide —
 * to be written into the guide itself, not applied behind its back.
 */
export type ArabicRegister = "egyptian" | "msa";

export function registerForCurrency(currency: "EGP" | "USD"): ArabicRegister {
  return currency === "EGP" ? "egyptian" : "msa";
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}
