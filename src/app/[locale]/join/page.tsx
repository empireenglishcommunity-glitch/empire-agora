import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { isLocale, type Locale } from "@/i18n/config";
import { getCheckout } from "@/i18n/checkout";
import { resolveCurrency } from "@/lib/currency";
import {
  promotedTiers,
  purchasableTiers,
  type TierId,
  type Term,
} from "@/commerce/pricing";
import { railsFor, railAccount } from "@/commerce/rails";
import { Price } from "@/components/Price";
import { Ltr } from "@/components/Ltr";
import { Button, Card, Display, Divider, Eyebrow, Lead, Section } from "@/components/ui";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The order form.
 *
 * A single plain `<form method="post">`, so checkout works with JavaScript disabled.
 * No payment details appear anywhere on this page — they are revealed only on the
 * confirmation page, after an order exists (requirements R5.7).
 *
 * WHICH TIERS APPEAR, AND WHY IT IS NOT `purchasableTiers`
 * -------------------------------------------------------
 * This listed every purchasable tier, which quietly broke the one pricing rule the CI
 * gate exists to protect. `vip` is `unlisted` in EGP because Egyptian 1:1 earns about
 * $23/teaching-hour against about $45 for Egyptian group — it is worse for the business
 * than the tier it upgrades from. "Unlisted" was implemented as "still in the array",
 * so an Egyptian opening `/join` was shown VIP at 50,000 LE as the fourth of four
 * options. **Rendering something in the default radio group IS advertising it.**
 *
 * Caught by rendering the page at 360px and reading it, not by any gate — the gate
 * asserts the *price relationship*, and the price was right. Where the tier was
 * offered is a different property.
 *
 * So: promoted tiers by default, plus the requested tier if someone arrived with an
 * explicit `?tier=` link to an unlisted one. Buyable by link, never advertised.
 */
export default async function Join({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const j = getCheckout(locale as Locale).join;

  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const currency = await resolveCurrency(one("c"));

  const requestedTier = one("tier") as TierId | undefined;
  const buyable = purchasableTiers(currency);
  const requested = buyable.find((x) => x.id === requestedTier);

  // Promoted, plus the one unlisted tier the visitor explicitly asked for.
  const tiers = requested && !promotedTiers(currency).some((x) => x.id === requested.id)
    ? [...promotedTiers(currency), requested]
    : promotedTiers(currency);

  const selectedTier =
    requested?.id ?? tiers.find((x) => x.id === "asas")?.id ?? tiers[0].id;

  const selectedTerm: Term = one("term") === "monthly" ? "monthly" : "annual";
  const termLabel = selectedTerm === "annual" ? j.perYear : j.perMonth;

  // Only rails that are actually configured. An unconfigured rail would create an
  // order the buyer cannot pay, so it is not offered at all.
  const rails = railsFor(currency).filter((r) => railAccount(r.id) !== null);

  const error = one("e");

  /**
   * One idempotency key per render. The browser's own "resubmit this form?" prompt and
   * a double-tapped button both reuse it, so a slow connection cannot produce two
   * orders for one intent.
   */
  const idempotencyKey = randomUUID();

  return (
    <main>
      <Section className="pt-14 pb-8">
        <Eyebrow>{j.eyebrow}</Eyebrow>
        <Display as="h1">{j.title}</Display>
        <Lead className="mt-5 max-w-xl">{j.intro}</Lead>
      </Section>

      <Divider />

      <Section className="pt-8">
        {error ? (
          <Card className="mb-8 border-(--color-bronze)">
            <p className="text-(--color-parchment)">
              {(j.errors as Record<string, string>)[error] ?? j.errors.generic}
            </p>
          </Card>
        ) : null}

        {rails.length === 0 ? (
          // Every rail unconfigured. Say so plainly instead of showing a form that
          // cannot succeed.
          <Card className="border-(--color-bronze)">
            <p className="text-(--color-parchment)">{j.errors.rail_unavailable}</p>
          </Card>
        ) : (
          <form method="post" action="/api/orders/submit" className="max-w-xl space-y-8">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="currency" value={currency} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

            {/* ── Plan ── */}
            <fieldset className="space-y-3">
              <legend className="mb-3 text-lg text-(--color-gold)">{j.planLegend}</legend>
              {tiers.map((tier) => (
                <label
                  key={tier.id}
                  className="flex cursor-pointer items-center justify-between gap-4 rounded-sm border border-(--color-gold)/20 p-4 hover:border-(--color-gold)/40"
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="tier"
                      value={tier.id}
                      defaultChecked={tier.id === selectedTier}
                      required
                      className="accent-(--color-gold)"
                    />
                    {/*
                     * `nameAr` in BOTH locales, matching <TierCard> on the sales page.
                     * `nameEn` exists in pricing.ts and is deliberately not used here:
                     * a buyer who compared "الأساس" on the sales page could not match it
                     * to "Basic" on the order form, and a mismatch mid-checkout is worse
                     * than an untranslated proper noun. The tier names are product names.
                     */}
                    <span className="font-(family-name:--font-display-ar) text-lg">
                      {tier.nameAr}
                    </span>
                  </span>
                  {/*
                   * The period label is not decoration: without it an Egyptian reads
                   * "5,000 ج.م" against the "500 ج.م" the sales page quoted and sees a
                   * bait-and-switch, because this form defaults to the annual term.
                   *
                   * These are real BLOCK elements, not `<span class="block">`. On /en the
                   * Arabic tier name and an English "per year" would otherwise share one
                   * text line — Arabic plus two Latin runs, which is a bidi failure the
                   * live gate caught the moment the label was added. Separate blocks each
                   * resolve their own base direction, so nothing can reorder across them.
                   */}
                  <div className="text-end">
                    <div className="text-(--color-gold)">
                      <Price tier={tier.id} currency={currency} term={selectedTerm} />
                    </div>
                    <div className="text-xs text-(--color-text-muted)">{termLabel}</div>
                  </div>
                </label>
              ))}
              {/* Shown only when an unlisted tier was reached by direct link, so the
                  buyer understands why they are seeing an option nobody advertises. */}
              {requested && !promotedTiers(currency).some((x) => x.id === requested.id) ? (
                <p className="pt-1 text-xs text-(--color-text-muted)">{j.unlistedNote}</p>
              ) : null}
            </fieldset>

            {/* ── Term ── */}
            <fieldset className="space-y-3">
              <legend className="mb-3 text-lg text-(--color-gold)">{j.termLegend}</legend>
              <div className="flex gap-3">
                {(["annual", "monthly"] as Term[]).map((term) => (
                  <label
                    key={term}
                    className="flex flex-1 cursor-pointer items-center gap-3 rounded-sm border border-(--color-gold)/20 p-4 hover:border-(--color-gold)/40"
                  >
                    <input
                      type="radio"
                      name="term"
                      value={term}
                      defaultChecked={term === selectedTerm}
                      required
                      className="accent-(--color-gold)"
                    />
                    <span>{term === "annual" ? j.termAnnual : j.termMonthly}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* ── Rail ── */}
            <fieldset className="space-y-3">
              <legend className="mb-3 text-lg text-(--color-gold)">{j.railLegend}</legend>
              <p className="mb-3 text-sm text-(--color-text-muted)">{j.railNote}</p>
              {rails.map((rail, i) => (
                <label
                  key={rail.id}
                  className="flex cursor-pointer items-center gap-3 rounded-sm border border-(--color-gold)/20 p-4 hover:border-(--color-gold)/40"
                >
                  <input
                    type="radio"
                    name="rail"
                    value={rail.id}
                    defaultChecked={i === 0}
                    required
                    className="accent-(--color-gold)"
                  />
                  <Ltr>{(j.rails as Record<string, string>)[rail.labelKey] ?? rail.id}</Ltr>
                </label>
              ))}
            </fieldset>

            {/* ── Identity ── */}
            <fieldset className="space-y-4">
              <legend className="mb-3 text-lg text-(--color-gold)">{j.aboutLegend}</legend>
              <Field name="name" label={j.fields.name} required maxLength={120} />
              <Field
                name="contact"
                label={j.fields.contact}
                hint={j.fields.contactHint}
                required
                maxLength={80}
                inputMode="tel"
              />
              <Field name="email" label={j.fields.email} type="email" maxLength={160} />
              <Field name="discord" label={j.fields.discord} maxLength={80} />
            </fieldset>

            <div>
              <Button type="submit" className="w-full sm:w-auto">
                {j.submit}
              </Button>
              <p className="mt-4 text-sm text-(--color-text-muted)">{j.afterSubmit}</p>
            </div>
          </form>
        )}
      </Section>
    </main>
  );
}

function Field({
  name,
  label,
  hint,
  required,
  type = "text",
  maxLength,
  inputMode,
}: {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  type?: string;
  maxLength?: number;
  inputMode?: "tel" | "email" | "text";
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-(--color-parchment)">
        {label}
        {required ? <span className="text-(--color-gold)"> *</span> : null}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        maxLength={maxLength}
        inputMode={inputMode}
        // `text-start` not `text-left`: this form is RTL and a physical direction
        // would put Latin input on the wrong side.
        className="w-full rounded-sm border border-(--color-gold)/25 bg-(--color-surface) px-4 py-3 text-start text-(--color-parchment) outline-none focus:border-(--color-gold)"
      />
      {hint ? <span className="mt-1 block text-xs text-(--color-text-muted)">{hint}</span> : null}
    </label>
  );
}
