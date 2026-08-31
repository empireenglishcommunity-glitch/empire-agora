import { otherCurrency } from "@/lib/currency";
import type { Currency } from "@/commerce/pricing";

/**
 * The one control that changes currency.
 *
 * A plain link, not a toggle, and deliberately not a "switcher" showing both
 * prices: the visitor sees one currency and can move to the other, but the two
 * are never on screen together (R1.3).
 *
 * It is phrased as where the visitor PAYS FROM rather than where they live,
 * because the payment rail is what actually determines the tier — Vodafone Cash
 * and InstaPay require an Egyptian phone or bank, so they gate themselves (R1.5).
 */
export function CurrencySwitch({
  currency,
  labels,
  returnTo,
  className,
}: {
  currency: Currency;
  /** Both phrasings; the component picks the one describing the DESTINATION. */
  labels: { egypt: string; intl: string };
  /** Locale-prefixed path to come back to, e.g. "/ar". Validated server-side. */
  returnTo: string;
  className?: string;
}) {
  const target = otherCurrency(currency);

  /**
   * The label describes where you would switch TO, as a full sentence.
   *
   * An earlier version showed the currency code of the destination next to a
   * generic "change payment method". On a page rendering EGP prices that read
   * "change payment method — USD", which a visitor can reasonably parse as *"this
   * page is in USD"* — the exact opposite of the truth. A bare code next to a
   * generic verb is ambiguous about direction; a sentence is not.
   */
  const label = target === "EGP" ? labels.egypt : labels.intl;

  // Goes through the API route so the choice is REMEMBERED, not just applied to
  // this one render. A bare `?c=` link would be forgotten on the next navigation.
  const href = `/api/currency?to=${target}&next=${encodeURIComponent(returnTo)}`;

  return (
    <a
      href={href}
      className={`inline-flex items-center text-xs text-(--color-text-muted) underline decoration-(--color-gold)/30 underline-offset-4 transition-colors hover:text-(--color-parchment) ${className ?? ""}`}
      rel="nofollow"
    >
      {label}
    </a>
  );
}
