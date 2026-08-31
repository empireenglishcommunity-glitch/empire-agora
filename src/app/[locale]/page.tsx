import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { socialCard } from "@/lib/metadata";
import { getDictionary } from "@/i18n/dictionaries";
import { resolveCurrency } from "@/lib/currency";
import { promotedTiers, ASSESSMENT, type Term } from "@/commerce/pricing";
import { totalWeeks } from "@/curriculum/cefr";
import { Crest } from "@/components/Crest";
import { FounderPortrait } from "@/components/FounderPortrait";
import { Ltr } from "@/components/Ltr";
import { Amount } from "@/components/Price";
import { TierCard } from "@/components/TierCard";
import { CurrencySwitch } from "@/components/CurrencySwitch";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Container,
  Display,
  Divider,
  Eyebrow,
  Lead,
  Section,
} from "@/components/ui";

// External surfaces. Kept here rather than in copy so a URL change is one edit.
const PLACEMENT_URL = "https://practice.empireenglish.online/placement/";
const PRACTICE_URL = "https://practice.empireenglish.online";
const ASSESSMENT_URL = "https://assessment.empireenglish.online";
const FOUNDER_URL = "https://mahmoud-ashr.empireenglish.online";
/**
 * The human fallback, from the environment — never a literal.
 *
 * This was a hardcoded `wa.me/<number>` link, and the number was also the Vodafone Cash
 * account. `commerce/rails.ts` keeps every payment identifier out of this repository on
 * purpose ("a payment number in a public repo is grep-able forever"), and a literal here
 * quietly undid that for the one number that matters most. Publishing it on the page is
 * intended; committing it is a different question, and the rule already had an answer.
 *
 * `scripts/check-no-identifiers.mjs` now enforces it — and its first catch was an earlier
 * draft of THIS COMMENT, which quoted the number while explaining why not to. A comment in
 * a public repo is exactly as grep-able as code.
 *
 * Returns null when unset, and the caller renders nothing rather than a dead link.
 */
function whatsappUrl(): string | null {
  const digits = process.env.OWNER_WHATSAPP?.replace(/[^\d]/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale as Locale);
  return {
    title: t.meta.title,
    description: t.meta.description,
    // Spread, never a bare `openGraph` literal: that would replace the layout's and
    // drop the share image. See src/lib/metadata.ts.
    ...socialCard(locale as Locale, { title: t.meta.title, description: t.meta.description }),
  };
}

export default async function Home({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale as Locale);

  const sp = await searchParams;
  const currencyParam = typeof sp.c === "string" ? sp.c : undefined;
  const currency = await resolveCurrency(currencyParam);

  // Annual is the default view. Churn is the enemy on a monthly product, and every
  // annual sold removes eleven renewal decisions. Presenting it first is the single
  // cheapest retention mechanism available.
  const term: Term = sp.term === "monthly" ? "monthly" : "annual";

  const tiers = promotedTiers(currency);
  const whatsapp = whatsappUrl();
  const cheapest = tiers[0];

  return (
    <>
      <main>
        {/* ── Hero ─────────────────────────────────────────────
            No entry gate, no ambient audio, and the LCP element is text.
            An interstitial between a visitor and the offer is where the session
            ends on Egyptian mobile data. */}
        <Section className="pt-14 pb-10 sm:pt-20">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Crest className="h-11 w-11 shrink-0 text-(--color-gold)" />
              <span className="text-xs tracking-[0.25em] text-(--color-text-muted)">
                {t.hero.eyebrow}
              </span>
            </div>
            <CurrencySwitch
              currency={currency}
              labels={{ egypt: t.currency.egypt, intl: t.currency.intl }}
              returnTo={`/${locale}`}
            />
          </div>

          <Display as="h1" className="mt-10 max-w-3xl">
            {t.hero.title}
          </Display>

          <Lead className="mt-6 max-w-2xl">{t.hero.subtitle}</Lead>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href={PLACEMENT_URL}>{t.hero.ctaPrimary}</ButtonLink>
            <ButtonLink href="#plans" variant="secondary">
              {t.hero.ctaSecondary}
            </ButtonLink>
          </div>

          <p className="mt-5 max-w-xl text-sm text-(--color-text-muted)">
            {t.hero.reassure}
          </p>
        </Section>

        <Divider />

        {/* ── The problem ── */}
        <Section>
          <Eyebrow>{t.problem.eyebrow}</Eyebrow>
          <Display as="h2">{t.problem.title}</Display>
          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {t.problem.points.map((p) => (
              <Card key={p.title}>
                <h3 className="mb-2 text-lg text-(--color-parchment)">{p.title}</h3>
                <p className="text-sm leading-relaxed text-(--color-text-muted)">{p.body}</p>
              </Card>
            ))}
          </div>
        </Section>

        <Divider />

        {/* ── The system ───────────────────────────────────────
            The retention-critical section. It reframes the product honestly:
            reps happen asynchronously and without limit, and the live hour is
            correction and accountability. Sold any other way, a buyer expects
            personal attention in a group of twenty and leaves in month two. */}
        <Section id="how">
          <Eyebrow>{t.system.eyebrow}</Eyebrow>
          <Display as="h2">{t.system.title}</Display>
          <Lead className="mt-5 max-w-2xl">{t.system.intro}</Lead>

          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            {t.system.layers.map((layer) => (
              <Card key={layer.title}>
                <Badge className="mb-4">{layer.tag}</Badge>
                <h3 className="mb-2 text-lg text-(--color-parchment)">{layer.title}</h3>
                <p className="text-sm leading-relaxed text-(--color-text-muted)">
                  {layer.body}
                </p>
              </Card>
            ))}
          </div>

          {/* Stated plainly rather than buried. A page that hides the group size
              converts better and retains worse. */}
          <Card className="mt-6 border-(--color-gold)/35">
            <h3 className="mb-2 text-lg text-(--color-gold)">{t.system.honest.title}</h3>
            <p className="text-sm leading-relaxed text-(--color-text-muted)">
              {t.system.honest.body}
            </p>
          </Card>
        </Section>

        <Divider />

        {/* ── Placement: the real front door ── */}
        <Section>
          <Eyebrow>{t.placement.eyebrow}</Eyebrow>
          <Display as="h2">{t.placement.title}</Display>
          <Lead className="mt-5 max-w-2xl">{t.placement.body}</Lead>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href={PLACEMENT_URL}>{t.placement.cta}</ButtonLink>
          </div>
          <p className="mt-5 max-w-xl text-sm text-(--color-text-muted)">
            {t.placement.note}
          </p>
        </Section>

        <Divider />

        {/* ── What you get ── */}
        <Section>
          <Eyebrow>{t.includes.eyebrow}</Eyebrow>
          <Display as="h2">{t.includes.title}</Display>

          <div className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {t.includes.items.map((item) => (
              <div key={item.title} className="border-s-2 border-(--color-gold)/30 ps-4">
                <h3 className="text-base text-(--color-parchment)">{item.title}</h3>
                <p className="mt-1 text-sm text-(--color-text-muted)">{item.body}</p>
              </div>
            ))}
          </div>

          <Card className="mt-10">
            <h3 className="mb-2 text-lg text-(--color-gold)">{t.includes.levelsTitle}</h3>
            <p className="text-sm leading-relaxed text-(--color-text-muted)">
              {/* Derived from the level data, not typed into copy — so it cannot
                  drift from what the bot actually teaches. */}
              {t.includes.levelsBody.split("{weeks}")[0]}
              <Ltr className="text-(--color-parchment)">{totalWeeks()}</Ltr>
              {t.includes.levelsBody.split("{weeks}")[1]}
            </p>
            <p className="mt-3 text-xs text-(--color-bronze)">{t.includes.certHonesty}</p>
          </Card>
        </Section>

        <Divider />

        {/* ── Plans ── */}
        <Section id="plans">
          <Eyebrow>{t.plans.eyebrow}</Eyebrow>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <Display as="h2">{t.plans.title}</Display>
            <div className="flex items-center gap-2 text-sm">
              <TermLink active={term === "annual"} href="?term=annual" currency={currency}>
                {t.plans.annualToggle}
              </TermLink>
              <span className="text-(--color-bronze-dim)">·</span>
              <TermLink active={term === "monthly"} href="?term=monthly" currency={currency}>
                {t.plans.monthlyToggle}
              </TermLink>
              {term === "annual" ? (
                <Badge className="ms-2">{t.plans.annualHint}</Badge>
              ) : null}
            </div>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {tiers.map((tier) => (
              <TierCard
                key={tier.id}
                tier={tier}
                currency={currency}
                term={term}
                locale={locale}
                emphasis={tier.id === "tarkeez"}
                labels={{
                  perMonth: t.plans.perMonth,
                  annualEquivalent: t.plans.annualEquivalent,
                  mostChosen: t.plans.mostChosen,
                  cta: t.plans.cta,
                  features: t.plans.features,
                  seatsLeft: t.plans.seatsLeft,
                }}
              />
            ))}
          </div>

          <p className="mt-8 text-sm text-(--color-text-muted)">
            {t.plans.assessmentNote.split("{price}")[0]}
            <Amount value={ASSESSMENT.price[currency]} currency={currency} />
            {t.plans.assessmentNote.split("{price}")[1]}
          </p>

          {currency === "EGP" ? (
            <p className="mt-3 text-xs text-(--color-bronze)">{t.plans.residencyNote}</p>
          ) : null}
        </Section>

        <Divider />

        {/* ── How joining works ── */}
        <Section>
          <Eyebrow>{t.how.eyebrow}</Eyebrow>
          <Display as="h2">{t.how.title}</Display>
          <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {t.how.steps.map((step) => (
              <li key={step.title}>
                <Card className="h-full">
                  <span className="font-(family-name:--font-display-ar) text-3xl text-(--color-gold)/70">
                    {step.n}
                  </span>
                  <h3 className="mt-3 text-base text-(--color-parchment)">{step.title}</h3>
                  <p className="mt-1.5 text-sm text-(--color-text-muted)">{step.body}</p>
                </Card>
              </li>
            ))}
          </ol>
          {/* The manual verification delay, disclosed up front. A buyer who is
              warned waits; a buyer who is surprised asks for a refund. */}
          <p className="mt-6 max-w-2xl text-sm text-(--color-text-muted)">
            {t.how.manualNote}
          </p>
        </Section>

        <Divider />

        {/* ── Founder ──────────────────────────────────────────
            One photo, and the full story lives on its own property. Four suit
            portraits on a sales page reads as a personal brand; one reads as
            accountability. */}
        <Section>
          <Eyebrow>{t.founder.eyebrow}</Eyebrow>
          <div className="grid items-center gap-8 sm:grid-cols-[200px_1fr]">
            <FounderPortrait alt={t.founder.portraitAlt} />
            <div>
              <Display as="h3">{t.founder.title}</Display>
              <p className="mt-4 max-w-xl leading-relaxed text-(--color-text-muted)">
                {t.founder.body}
              </p>
              <ButtonLink href={FOUNDER_URL} variant="secondary" className="mt-6">
                {t.founder.cta}
              </ButtonLink>
            </div>
          </div>
        </Section>

        <Divider />

        {/* ── Guarantee ── */}
        <Section>
          <Eyebrow>{t.guarantee.eyebrow}</Eyebrow>
          <Card emphasis>
            <Display as="h3">{t.guarantee.title}</Display>
            <p className="mt-4 max-w-2xl leading-relaxed text-(--color-text-muted)">
              {t.guarantee.body}
            </p>
            <p className="mt-5 text-sm text-(--color-gold)">{t.guarantee.conditionsTitle}</p>
            <p className="mt-1 text-sm text-(--color-text-muted)">{t.guarantee.conditions}</p>
          </Card>
        </Section>

        <Divider />

        {/* ── FAQ ── */}
        <Section id="faq">
          <Eyebrow>{t.faq.eyebrow}</Eyebrow>
          <Display as="h2">{t.faq.title}</Display>
          <div className="mt-10 divide-y divide-(--color-gold)/15">
            {t.faq.items.map((item) => (
              <details key={item.q} className="group py-5">
                <summary className="cursor-pointer list-none text-base text-(--color-parchment) marker:content-none">
                  {item.q}
                </summary>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-(--color-text-muted)">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </Section>

        <Divider />

        {/* ── Final CTA ── */}
        <Section>
          <Eyebrow>{t.finalCta.eyebrow}</Eyebrow>
          <Display as="h2">{t.finalCta.title}</Display>
          <Lead className="mt-5 max-w-xl">{t.finalCta.body}</Lead>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href={PLACEMENT_URL}>{t.finalCta.cta}</ButtonLink>
            {whatsapp ? (
              <ButtonLink href={whatsapp} variant="secondary">
                {t.finalCta.or}
              </ButtonLink>
            ) : null}
          </div>
        </Section>

        {/* ── Footer ── */}
        <footer className="border-t border-(--color-gold)/15 py-12">
          <Container>
            <div className="flex flex-wrap items-start justify-between gap-8">
              <div className="flex items-center gap-3">
                <Crest className="h-10 w-10 text-(--color-gold)/70" />
                <p className="max-w-xs text-sm text-(--color-text-muted)">
                  {t.footer.tagline}
                </p>
              </div>
              <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-(--color-text-muted)">
                <a href={PRACTICE_URL} className="hover:text-(--color-parchment)">
                  {t.footer.practice}
                </a>
                <a href={ASSESSMENT_URL} className="hover:text-(--color-parchment)">
                  {t.footer.assessment}
                </a>
                <a href={`/${locale}/terms`} className="hover:text-(--color-parchment)">
                  {t.footer.terms}
                </a>
                <a href={`/${locale}/privacy`} className="hover:text-(--color-parchment)">
                  {t.footer.privacy}
                </a>
              </nav>
            </div>
            <p className="mt-10 text-xs text-(--color-bronze-dim)">{t.footer.honesty}</p>
          </Container>
        </footer>
      </main>

      {/* ── Sticky mobile CTA ────────────────────────────────
          Mobile only. The audience is overwhelmingly on phones, and by the time
          someone has scrolled past the plans the hero's button is long gone. */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-(--color-gold)/25 bg-(--color-obsidian)/95 backdrop-blur-sm sm:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="text-xs text-(--color-text-muted)">
            {t.sticky.from}{" "}
            <span className="text-(--color-gold)">
              <Amount
                value={cheapest.price[currency]!.monthly}
                currency={currency}
              />
            </span>
          </div>
          {/* Points at checkout, not back at the free level test. Someone who has
              scrolled past the plans has already had the free offer twice. */}
          <ButtonLink href={`/${locale}/join?c=${currency}`} className="px-5 py-2.5 text-xs">
            {t.sticky.cta}
          </ButtonLink>
        </div>
      </div>
      {/* Clears the sticky bar so the footer is never trapped underneath it. */}
      <div className="h-16 sm:hidden" aria-hidden />
    </>
  );
}

/** Term selector. A link, not a control, so it works without JavaScript. */
function TermLink({
  active,
  href,
  currency,
  children,
}: {
  active: boolean;
  href: string;
  currency: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={`${href}&c=${currency}`}
      className={
        active
          ? "text-(--color-gold) underline decoration-(--color-gold)/50 underline-offset-4"
          : "text-(--color-text-muted) hover:text-(--color-parchment)"
      }
      rel="nofollow"
    >
      {children}
    </a>
  );
}
