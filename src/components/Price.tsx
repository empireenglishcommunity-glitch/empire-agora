/**
 * The ONLY component allowed to render a price.
 *
 * Pulls from src/commerce/pricing.ts and wraps its output in <Ltr>, which means
 * a price can never be the cause of a bidi failure and can never drift from the
 * single source of truth. A CI gate rejects literal prices in components.
 *
 * Spec: requirements.md R2.1, R2.5, R10.4, R10.5.
 */

import {
  priceFor,
  annualPerMonth,
  type Currency,
  type TierId,
  type Term,
} from "@/commerce/pricing";
import { CURRENCY_SYMBOL } from "@/commerce/fx";
import { Ltr } from "./Ltr";

/**
 * Western digits deliberately (500, not ٥٠٠). Prices are scanned rather than
 * read, Western digits scan faster for this audience, and they stay consistent
 * with the numerals used across the bot and the practice site.
 */
function formatAmount(amount: number, currency: Currency): string {
  const rounded =
    Number.isInteger(amount) ? amount : Math.round(amount * 100) / 100;
  const digits = rounded.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
  });
  return currency === "USD"
    ? `${CURRENCY_SYMBOL.USD}${digits}`
    : `${digits} ${CURRENCY_SYMBOL.EGP}`;
}

export function Price({
  tier,
  currency,
  term,
  className,
}: {
  tier: TierId;
  currency: Currency;
  term: Term;
  className?: string;
}) {
  return (
    <Ltr className={className}>{formatAmount(priceFor(tier, currency, term), currency)}</Ltr>
  );
}

/**
 * An annual plan expressed per month — for honest side-by-side comparison with
 * the monthly price. Never presented as a discount off an invented "was" price.
 */
export function AnnualPerMonth({
  tier,
  currency,
  className,
}: {
  tier: TierId;
  currency: Currency;
  className?: string;
}) {
  return (
    <Ltr className={className}>
      {formatAmount(annualPerMonth(tier, currency), currency)}
    </Ltr>
  );
}

/** A bare amount, for the assessment fee and other non-tier prices. */
export function Amount({
  value,
  currency,
  className,
}: {
  value: number;
  currency: Currency;
  className?: string;
}) {
  return <Ltr className={className}>{formatAmount(value, currency)}</Ltr>;
}
