import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { Crest } from "@/components/Crest";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * The OpenGraph card, rendered as a page so a REAL BROWSER can shape it.
 *
 * WHY NOT `ImageResponse` / satori, which is the obvious answer
 * ------------------------------------------------------------
 * satori cannot read next/font's WOFF2, and its Arabic support does not do contextual
 * shaping — Arabic letters take one of four forms depending on their neighbours, and a
 * renderer that ignores that produces text an Arabic reader sees as broken. That is
 * already why the empire-oracle rank cards were made Latin-only.
 *
 * A share card for an Arabic sales page cannot be Latin-only. WhatsApp is the primary
 * sharing channel for this audience, and a link with no picture, or with mangled Arabic,
 * is worse than the status quo.
 *
 * So the card is a normal page at exactly 1200×630, screenshotted once by the headless
 * browser already used to review this site, and the PNG is committed. The browser does
 * correct shaping with the real fonts, the image costs nothing at request time, and the
 * source is reviewable markup rather than an opaque binary.
 *
 * REGENERATE (after any change to this file, the crest, or the tokens):
 *
 *   npm run build && cp -r public .next/standalone/public \
 *     && cp -r .next/static .next/standalone/.next/static
 *   (cd .next/standalone && node server.js &)
 *   agent-browser --session og set viewport 1200 630
 *   agent-browser --session og open http://127.0.0.1:3000/ar/og-card
 *   agent-browser --session og screenshot $PWD/public/og/og-ar.png
 *   agent-browser --session og open http://127.0.0.1:3000/en/og-card
 *   agent-browser --session og screenshot $PWD/public/og/og-en.png
 *
 * The route is `noindex` and follows the precedent of `/[locale]/design`: a build-time
 * reference surface that is harmless to leave reachable.
 */
export default async function OgCard({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed = locale as Locale;
  const t = getDictionary(typed);

  const brand = typed === "ar" ? "إمبراطورية الإنجليزية" : "Empire English Community";

  return (
    // Fixed pixel box, not a responsive layout: this exists to be captured at exactly
    // 1200×630, the size every platform crops from.
    <div
      style={{ width: 1200, height: 630 }}
      className="relative flex flex-col justify-between overflow-hidden bg-(--color-obsidian) p-16"
    >
      {/* The same gold wash the hero uses, so a shared link looks like the page it opens. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 70% 0%, color-mix(in srgb, #c9a84c 14%, transparent), transparent 60%)",
        }}
      />

      <div className="relative flex items-center gap-6">
        <Crest className="h-24 w-24 text-(--color-gold)" />
        <span className="font-(family-name:--font-display-ar) text-4xl text-(--color-gold)">
          {brand}
        </span>
      </div>

      {/*
       * Sized for the LONGER of the two locales, not the prettier one.
       *
       * At 68px the Arabic headline looked excellent and the English one ran to three
       * lines, pushed the subtitle to three more, and collapsed `justify-between` so the
       * domain sat jammed against the subtitle with no bottom margin. Only rendering both
       * showed it: the Arabic card alone would have shipped looking finished.
       *
       * The subtitle is clamped rather than trusted to be short, because it is authored
       * copy that will be edited by someone who is not looking at this card.
       */}
      <div className="relative max-w-[960px]">
        {/* The real headline from the real dictionary — never a second copy of it. */}
        <h1 className="font-(family-name:--font-display-ar) text-[56px] leading-[1.18] text-(--color-parchment)">
          {t.hero.title}
        </h1>
        <p className="mt-5 line-clamp-2 text-2xl leading-relaxed text-(--color-text-muted)">
          {t.hero.subtitle}
        </p>
      </div>

      <div className="relative flex items-center justify-between">
        <span className="text-2xl tracking-wide text-(--color-gold)">empireenglish.online</span>
        {/*
         * Deliberately NOT carrying a price, and not carrying the
         * "CEFR-aligned, not certified" disclaimer either.
         *
         * No price, because a share card outlives any price and is the one surface that
         * cannot know which currency the person opening it should be shown — putting one
         * here would breach currency isolation by construction.
         *
         * No disclaimer, because the card makes no proficiency claim to qualify. The
         * honest-positioning rule exists to stop an unearned claim, not to require fine
         * print on every surface; printing it here answers a question nobody asked and
         * spends the one line a reader actually scans.
         */}
      </div>
    </div>
  );
}
