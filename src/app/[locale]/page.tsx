import { getDictionary } from "@/i18n/dictionaries";
import { isLocale, type Locale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { Ltr } from "@/components/Ltr";
import { Price } from "@/components/Price";
import { promotedTiers } from "@/commerce/pricing";

/**
 * Phase 0/1 placeholder.
 *
 * Deliberately minimal: it proves the RTL shell, the font pipeline, the copy
 * dictionary and the pricing source all work end to end, without pretending to be
 * the sales page. The real page is Phase 3 and needs copy, proof assets and the
 * founder photos before it is worth building.
 */
export default async function Home({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale as Locale);

  // Currency resolution is Phase 4 (CF-IPCountry + override). Hardcoded here
  // only so the shell renders; never ship a page that assumes a currency.
  const currency = "EGP" as const;

  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <p className="mb-4 text-sm tracking-[0.3em] text-(--color-bronze-muted) uppercase">
        <Ltr>Empire English Community</Ltr>
      </p>

      <h1 className="text-gold-gradient font-(family-name:--font-display-ar) text-4xl leading-tight sm:text-5xl">
        {t.shell.title}
      </h1>

      <p className="mt-6 text-lg text-(--color-bronze-muted)">{t.shell.body}</p>

      <hr className="rule-gold my-12" />

      <h2 className="font-(family-name:--font-display-ar) mb-6 text-2xl text-(--color-gold)">
        {t.shell.tiersHeading}
      </h2>

      <ul className="space-y-3">
        {promotedTiers(currency).map((tier) => (
          <li
            key={tier.id}
            className="flex items-baseline justify-between border-b border-(--color-gold)/20 pb-3"
          >
            <span className="font-(family-name:--font-display-ar) text-xl">
              {tier.nameAr}
            </span>
            <span className="text-(--color-parchment)">
              <Price tier={tier.id} currency={currency} term="monthly" />
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-12 text-sm text-(--color-bronze-muted)">{t.shell.status}</p>
    </main>
  );
}
