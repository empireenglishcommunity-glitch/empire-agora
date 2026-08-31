import type { Currency, Tier, Term } from "@/commerce/pricing";
import { sessionsPerWeek, smallestGroup } from "@/commerce/pricing";
import { Price, AnnualPerMonth } from "./Price";
import { Ltr } from "./Ltr";
import { Badge, Button, Card, Divider } from "./ui";

/**
 * One plan.
 *
 * Takes the resolved currency as a prop and renders only that one — the currency
 * isolation rule lives here as much as anywhere, because a card that reached for
 * both would be the easiest way to break it (see check-currency-isolation).
 */
export function TierCard({
  tier,
  currency,
  term,
  emphasis,
  labels,
}: {
  tier: Tier;
  currency: Currency;
  term: Term;
  emphasis: boolean;
  labels: {
    perMonth: string;
    annualEquivalent: string;
    mostChosen: string;
    cta: string;
    features: Record<string, string>;
    seatsLeft: string;
  };
}) {
  const sessions = sessionsPerWeek(tier);
  const group = smallestGroup(tier);

  return (
    <Card emphasis={emphasis} className="flex flex-col">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="font-(family-name:--font-display-ar) text-2xl text-(--color-parchment)">
          {tier.nameAr}
        </h3>
        {emphasis ? <Badge>{labels.mostChosen}</Badge> : null}
      </div>

      <p className="text-4xl leading-none text-(--color-gold)">
        <Price tier={tier.id} currency={currency} term={term} />
      </p>

      {term === "annual" ? (
        <p className="mt-2 text-sm text-(--color-text-muted)">
          {/* The annual price restated per month. An honest comparison against the
              monthly price — never a discount off an invented "was" price. */}
          {labels.annualEquivalent.split("{price}")[0]}
          <AnnualPerMonth tier={tier.id} currency={currency} />
          {labels.annualEquivalent.split("{price}")[1]}
        </p>
      ) : (
        <p className="mt-2 text-sm text-(--color-text-muted)">{labels.perMonth}</p>
      )}

      <Divider className="my-5" />

      <ul className="flex-1 space-y-2.5 text-sm">
        <Feature label={labels.features.practice} on />
        <Feature label={labels.features.community} on />

        {sessions === 0 ? (
          <Feature label={labels.features.noLive} on={false} />
        ) : (
          <>
            <Feature label={labels.features.weekly} on />
            {tier.groups.length > 1 ? (
              <Feature label={labels.features.smallGroup} on />
            ) : null}
          </>
        )}

        {tier.oneToOnePerMonth > 0 ? (
          <li className="flex items-baseline justify-between gap-3">
            <span className="text-(--color-parchment)">{labels.features.oneToOne}</span>
            <Ltr className="text-(--color-gold)">{tier.oneToOnePerMonth}</Ltr>
          </li>
        ) : null}

        {group !== null ? (
          <li className="flex items-baseline justify-between gap-3">
            <span className="text-(--color-text-muted)">{labels.features.seatCap}</span>
            <Ltr className="text-(--color-text-muted)">{group}</Ltr>
          </li>
        ) : null}
      </ul>

      {/* A real cap, so it can be stated. Fabricated scarcity is forbidden — this
          number comes from the tier definition, not from a marketing decision. */}
      {tier.totalSeatCap !== null ? (
        <p className="mt-4 text-xs text-(--color-bronze)">
          {labels.seatsLeft} — <Ltr>{tier.totalSeatCap}</Ltr>
        </p>
      ) : null}

      <Button className="mt-6 w-full">{labels.cta}</Button>
    </Card>
  );
}

/**
 * Feature markers are SVG, not characters.
 *
 * `✓` (U+2713) has no glyph in Cairo or Reem Kufi, so it rendered as a missing-glyph
 * box — tofu — in the plans list, on the most commercially important section of the
 * page. Caught by looking at a 360px screenshot; nothing in the type system, the
 * bidi gate or the budget can see a missing glyph.
 *
 * The general rule this encodes: on an Arabic-first page, never rely on a decorative
 * Unicode symbol being present in the loaded face. Arabic webfonts carry the Arabic
 * block and Latin, not the dingbats. Draw it instead.
 */
function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="mt-1.5 h-3 w-3 shrink-0 text-(--color-gold)"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8.5 L6.2 12 L13 4.5" />
    </svg>
  );
}

function DashIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="mt-1.5 h-3 w-3 shrink-0 text-(--color-bronze-dim)"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M3 8 H13" />
    </svg>
  );
}

function Feature({ label, on }: { label: string; on: boolean }) {
  return (
    <li className="flex items-start gap-2.5">
      {on ? <CheckIcon /> : <DashIcon />}
      <span className={on ? "text-(--color-parchment)" : "text-(--color-text-muted)"}>
        {label}
      </span>
    </li>
  );
}
