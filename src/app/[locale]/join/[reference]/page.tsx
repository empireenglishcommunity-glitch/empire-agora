import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getCheckout } from "@/i18n/checkout";
import { findByReference, amountForDisplay } from "@/commerce/orders";
import { isReferenceCode } from "@/commerce/reference";
import { RAILS, railAccount } from "@/commerce/rails";
import { getTier } from "@/commerce/pricing";
import { Amount } from "@/components/Price";
import { Ltr } from "@/components/Ltr";
import {
  ButtonLink,
  Button,
  Card,
  Display,
  Divider,
  Eyebrow,
  Lead,
  Section,
} from "@/components/ui";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The ledger is read on every request and there is no `/data` volume at build time,
 * so this route must never be prerendered.
 */
export const dynamic = "force-dynamic";

/**
 * Order confirmation — and the ONLY page that shows payment details.
 *
 * WHAT IS DELIBERATELY NOT ON THIS PAGE: the buyer's name, contact number, or email.
 *
 * A reference code is four characters from a 31-character alphabet, and its month,
 * tier and currency segments are guessable, so the code is a WEAK secret — roughly
 * 900k combinations. That is fine for what this page does show: the amount owed and
 * the owner's payment accounts, which are handed to every buyer anyway. It would not
 * be fine for a name and a phone number, so those are not rendered. A buyer does not
 * need to be shown their own name back.
 *
 * The alternative — an HMAC token in the URL — was considered and not taken, because
 * it means a buyer who closes the tab cannot get back to the payment instructions at
 * all. That trade is worth revisiting only if this page ever needs to show PII.
 *
 * Spec: requirements.md R5.7, R12.2.
 */
export default async function OrderConfirmation({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; reference: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const { locale, reference } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getCheckout(locale as Locale);
  const c = dict.confirm;

  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  // Shape-check before touching the ledger, so a junk path never reaches a query.
  const order = isReferenceCode(reference) ? findByReference(reference) : null;

  if (!order) {
    return (
      <main>
        <Section className="pt-14">
          <Display as="h1">{c.notFoundTitle}</Display>
          <Lead className="mt-5 max-w-xl">{c.notFoundBody}</Lead>
          <div className="mt-8">
            <ButtonLink href={`/${locale}/join`}>{c.startOver}</ButtonLink>
          </div>
        </Section>
      </main>
    );
  }

  const tier = getTier(order.tier);
  const railDef = RAILS.find((r) => r.id === order.rail);
  const railLabel =
    (railDef && (dict.join.rails as Record<string, string>)[railDef.labelKey]) ?? order.rail;
  const account = railAccount(order.rail);

  const error = one("e");
  const justUploaded = one("uploaded") === "1";

  /**
   * The human fallback. Rendered only when it is configured — a "message us" button
   * that goes nowhere is worse than no button, because the buyer has money in limbo
   * and now believes they have contacted someone.
   */
  const whatsapp = process.env.OWNER_WHATSAPP?.replace(/[^\d]/g, "");
  const whatsappHref = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(order.referenceCode)}`
    : null;

  const awaitingPayment = order.status === "created" || order.status === "proof_submitted";

  return (
    <main>
      <Section className="pt-14 pb-8">
        <Eyebrow>{c.eyebrow}</Eyebrow>
        <Display as="h1">{c.title}</Display>
        <Lead className="mt-5 max-w-xl">{c.intro}</Lead>
      </Section>

      <Divider />

      <Section className="pt-8 pb-16">
        <div className="max-w-xl space-y-8">
          {error ? (
            <Card className="border-(--color-bronze)">
              <p className="text-(--color-parchment)">
                {(c.errors as Record<string, string>)[error] ?? c.errors.generic}
              </p>
            </Card>
          ) : null}

          {justUploaded ? (
            <Card className="border-(--color-gold)">
              <p className="text-(--color-parchment)">{c.proofDone}</p>
            </Card>
          ) : null}

          {/* ── Reference code ───────────────────────────────────────────────── */}
          <Card>
            <h2 className="mb-3 text-sm tracking-wide text-(--color-text-muted)">
              {c.referenceLegend}
            </h2>
            {/* The one string the buyer must copy by hand. Big, isolated, selectable. */}
            <p className="text-2xl leading-relaxed break-all text-(--color-gold) select-all">
              <Ltr>{order.referenceCode}</Ltr>
            </p>
            <p className="mt-3 text-sm text-(--color-text-muted)">{c.referenceNote}</p>
          </Card>

          {/* ── Summary ──────────────────────────────────────────────────────── */}
          <Card>
            <h2 className="mb-4 text-sm tracking-wide text-(--color-text-muted)">
              {c.summaryLegend}
            </h2>
            <dl className="space-y-3">
              <FactRow label={c.planLabel}>
                <span className="font-(family-name:--font-display-ar)">{tier.nameAr}</span>
              </FactRow>
              <FactRow label={c.termLabel}>
                {order.term === "annual" ? dict.join.termAnnual : dict.join.termMonthly}
              </FactRow>
              <FactRow label={c.amountLabel}>
                <span className="text-(--color-gold)">
                  {/* From the ledger, not recomputed from pricing.ts: the buyer owes
                      what was recorded when they ordered, even if a price changes. */}
                  <Amount value={amountForDisplay(order)} currency={order.currency} />
                </span>
              </FactRow>
              <FactRow label={c.railLabel}>
                <Ltr>{railLabel}</Ltr>
              </FactRow>
              <FactRow label={c.statusLegend}>{c.status[order.status]}</FactRow>
            </dl>
          </Card>

          {/* ── Payment details ──────────────────────────────────────────────── */}
          {awaitingPayment ? (
            account ? (
              <Card>
                <h2 className="mb-4 text-sm tracking-wide text-(--color-text-muted)">
                  {c.payLegend}
                </h2>
                <p className="mb-1.5 text-sm text-(--color-text-muted)">{c.accountLabel}</p>
                <p className="text-lg leading-relaxed break-all text-(--color-parchment) select-all">
                  <Ltr>{account}</Ltr>
                </p>
                <p className="mt-5 text-(--color-parchment)">
                  {(c.railSteps as Record<string, string>)[railDef?.labelKey ?? ""] ?? ""}
                </p>
                {/*
                 * The amount note is PER RAIL, because "transfer exactly the amount shown"
                 * is not true for every rail and a buyer who cannot comply with an
                 * instruction stops trusting the rest of the page.
                 *
                 *   · bank transfer — the account is AED and the order is in USD, so the
                 *     bank converts and the arriving amount WILL differ. Telling them to
                 *     send an exact dollar figure into an AED account is an instruction
                 *     that cannot be followed.
                 *   · crypto — USDT is 1:1 with the dollar so the figure holds, but network
                 *     fees are the sender's and can arrive short.
                 *   · everything else — exact, and a difference genuinely does hold the order.
                 */}
                <p className="mt-4 text-sm text-(--color-text-muted)">
                  {order.rail === "bank_transfer"
                    ? c.amountConverted
                    : order.rail === "crypto"
                      ? c.amountStable
                      : c.amountExact}
                </p>
              </Card>
            ) : (
              // Configured when the order was taken, unset now. Say so rather than
              // showing an empty account line the buyer would try to pay.
              <Card className="border-(--color-bronze)">
                <p className="text-(--color-parchment)">{c.railUnavailable}</p>
              </Card>
            )
          ) : null}

          {/* ── Proof upload ─────────────────────────────────────────────────── */}
          {awaitingPayment ? (
            <Card>
              <h2 className="mb-3 text-sm tracking-wide text-(--color-text-muted)">
                {c.proofLegend}
              </h2>
              <p className="mb-5 text-(--color-parchment)">{c.proofIntro}</p>
              <form
                method="post"
                action={`/api/orders/${order.referenceCode}/proof`}
                encType="multipart/form-data"
                className="space-y-4"
              >
                <input type="hidden" name="locale" value={locale} />
                <label className="block">
                  <span className="mb-1.5 block text-sm text-(--color-parchment)">
                    {c.proofField}
                  </span>
                  {/* `accept` opens the camera roll straight away on a phone. It is a
                      hint only — the real check is the magic-byte test on the server. */}
                  <input
                    type="file"
                    name="proof"
                    accept="image/*"
                    required
                    className="w-full rounded-sm border border-(--color-gold)/25 bg-(--color-surface) px-4 py-3 text-start text-sm text-(--color-parchment) file:me-4 file:rounded-sm file:border-0 file:bg-(--color-gold)/15 file:px-3 file:py-1.5 file:text-(--color-gold)"
                  />
                </label>
                <Button type="submit" className="w-full sm:w-auto">
                  {c.proofSubmit}
                </Button>
              </form>
              <p className="mt-4 text-sm text-(--color-text-muted)">{c.proofNote}</p>
              {order.proofKey ? (
                <p className="mt-2 text-sm text-(--color-text-muted)">{c.proofReplace}</p>
              ) : null}
            </Card>
          ) : null}

          <p className="text-sm text-(--color-text-muted)">{c.manualNote}</p>

          {/* ── Human fallback ───────────────────────────────────────────────── */}
          <Card>
            <h2 className="mb-3 text-sm tracking-wide text-(--color-text-muted)">
              {c.helpLegend}
            </h2>
            <p className="text-(--color-parchment)">{c.helpNote}</p>
            {whatsappHref ? (
              <div className="mt-5">
                <ButtonLink
                  href={whatsappHref}
                  variant="secondary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {c.whatsappCta}
                </ButtonLink>
              </div>
            ) : null}
          </Card>
        </div>
      </Section>
    </main>
  );
}

/** One label/value pair. `<dt>`/`<dd>` because this is genuinely a description list. */
function FactRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-(--color-gold)/10 pb-3 last:border-0 last:pb-0">
      <dt className="text-sm text-(--color-text-muted)">{label}</dt>
      <dd className="text-end text-(--color-parchment)">{children}</dd>
    </div>
  );
}
