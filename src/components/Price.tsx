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
function formatDigits(amount: number): string {
  const rounded = Number.isInteger(amount) ? amount : Math.round(amount * 100) / 100;
  return rounded.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
  });
}

/**
 * Renders an amount with its currency, isolating exactly as much as it should.
 *
 * WHY THIS IS NOT ONE `<Ltr>` AROUND THE WHOLE STRING
 * ---------------------------------------------------
 * It was, and it was wrong — caught by looking at a 360px screenshot, not by any
 * automated gate.
 *
 * `<bdi dir="ltr">500 ج.م</bdi>` forces an LTR base direction over a group whose
 * currency mark is Arabic. The numeral then lands to the LEFT of the currency,
 * which is mirrored from Arabic convention (logical order is amount-then-currency,
 * so in RTL the amount belongs on the right). The text was legible, which is
 * exactly why a checker could not see it: nothing was reversed or broken, the group
 * was simply laid out backwards.
 *
 * So: isolate only what needs isolating.
 *   · USD — `$` and the digits are both LTR-safe, so one isolate is correct and
 *     keeps `$30` from ever being split.
 *   · EGP — isolate the DIGITS only, and let `ج.م` sit in the surrounding
 *     direction. The group then orders correctly in Arabic, and the digits still
 *     cannot be reordered.
 *
 * The wider lesson, recorded here because it will recur: `<bdi>` prevents
 * *garbling*. It does not make a mixed-direction group *idiomatic*. Only reading
 * the rendered page does that.
 */
function Amount_({
  amount,
  currency,
  className,
}: {
  amount: number;
  currency: Currency;
  className?: string;
}) {
  const digits = formatDigits(amount);

  if (currency === "USD") {
    return <Ltr className={className}>{`${CURRENCY_SYMBOL.USD}${digits}`}</Ltr>;
  }

  return (
    <span className={className}>
      <Ltr>{digits}</Ltr> {CURRENCY_SYMBOL.EGP}
    </span>
  );
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
    <Amount_ amount={priceFor(tier, currency, term)} currency={currency} className={className} />
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
    <Amount_ amount={annualPerMonth(tier, currency)} currency={currency} className={className} />
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
  return <Amount_ amount={value} currency={currency} className={className} />;
}
