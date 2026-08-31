import type { Metadata } from "next";
import { Cairo, Reem_Kufi } from "next/font/google";
import { notFound } from "next/navigation";
import { locales, localeDir, isLocale, type Locale } from "@/i18n/config";
import "../globals.css";

// Arabic + Latin body. Already the ecosystem's face, so the site, the portal and
// the bot's embeds agree visually. Both subsets are genuinely needed: Arabic prose
// with embedded Latin product names is the whole page.
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
  weight: ["400", "600", "700"],
});

// Arabic display. Geometric Kufi — monumental rather than devotional, which is why
// Amiri and Aref Ruqaa were rejected.
//
// `arabic` subset ONLY: this face is used for Arabic headings, and any Latin in a
// heading is either isolated inside <Ltr> (which inherits the body face) or part of
// the crest SVG. Loading its Latin glyphs was paying for a fallback we never use.
const reemKufi = Reem_Kufi({
  subsets: ["arabic"],
  variable: "--font-reem-kufi",
  display: "swap",
  weight: ["400", "700"],
});

// NOTE: Cinzel (the engraved Latin display face on assessment.empireenglish.online)
// is deliberately NOT loaded. It measured ~30 KB to serve one wordmark and some
// 12px tracked labels, on a page whose display type is Arabic. The engraved Latin
// feel now comes from the crest SVG — vector, zero font cost, and it renders
// identically everywhere instead of depending on a webfont arriving. Latin labels
// use Cairo with wide tracking, which at eyebrow size is visually equivalent.

export const metadata: Metadata = {
  metadataBase: new URL("https://empireenglish.online"),
  title: {
    default: "Empire English Community",
    template: "%s · Empire English Community",
  },
  // No claim here that the style guide forbids: no "native", no "fluent in N days".
  description:
    "نظام تدريب إنجليزي للناطقين بالعربية — تدريب يومي، جلسات مباشرة، ومستوى محدد بدقة.",
  openGraph: {
    type: "website",
    siteName: "Empire English Community",
  },
  robots: { index: true, follow: true },
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const typed = locale as Locale;

  return (
    <html
      lang={typed}
      dir={localeDir[typed]}
      className={`${cairo.variable} ${reemKufi.variable}`}
    >
      <body className="atmosphere min-h-screen antialiased">{children}</body>
    </html>
  );
}
