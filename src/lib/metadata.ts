import type { Metadata } from "next";
import type { Locale } from "@/i18n/config";

/**
 * Shared OpenGraph / Twitter card construction.
 *
 * THE TRAP THIS EXISTS TO REMOVE
 * ------------------------------
 * Next merges metadata field by field, and `openGraph` is ONE field. A page that returns
 * `openGraph: { title, description }` therefore **replaces** the layout's entire
 * `openGraph` object — silently dropping `images`, `type`, `siteName` and `locale`.
 *
 * That is exactly what happened here. The layout declared the share image, the sales page
 * set an `openGraph` title, and the result was a site with no `og:image` at all. Nothing
 * reported it: the build passed, the tag was simply absent, and the only symptom is that a
 * WhatsApp share shows no picture — on the primary sharing channel for this audience.
 * `twitter:image` survived, which made it look like the metadata was fine.
 *
 * A comment saying "remember to re-add images" would be forgotten by the second page. So
 * instead there is one function that cannot produce an incomplete card, and pages call it
 * rather than assembling the object themselves.
 */

const OG_IMAGE_ALT: Record<Locale, string> = {
  ar: "إمبراطورية الإنجليزية",
  en: "Empire English Community",
};

/** The committed share card. Rendered from `/[locale]/og-card` — see that file. */
export function shareImage(locale: Locale) {
  return {
    url: `/og/og-${locale}.png`,
    width: 1200,
    height: 630,
    alt: OG_IMAGE_ALT[locale],
  };
}

/**
 * A complete social card. Always carries the image, whatever the caller passes.
 *
 * Spread into a page's `generateMetadata` return value:
 *
 *   return { title, description, ...socialCard(locale, { title, description }) };
 */
export function socialCard(
  locale: Locale,
  { title, description }: { title: string; description: string },
): Pick<Metadata, "openGraph" | "twitter"> {
  const image = shareImage(locale);
  return {
    openGraph: {
      type: "website",
      title,
      description,
      locale: locale === "ar" ? "ar_EG" : "en_US",
      siteName: OG_IMAGE_ALT[locale],
      images: [image],
    },
    // `summary_large_image` so the card is not cropped to a square thumbnail. Also read
    // by Telegram, which the herald bot posts through.
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image.url],
    },
  };
}
