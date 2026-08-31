import type { Metadata } from "next";
import { Cairo, Cinzel, Reem_Kufi } from "next/font/google";
import { notFound } from "next/navigation";
import { locales, localeDir, isLocale, type Locale } from "@/i18n/config";
import "../globals.css";

// Arabic + Latin body. Already the ecosystem's face, so the site, the portal and
// the bot's embeds agree visually.
const cairo = Cairo({
  subsets: ["arabic", "latin"],
  variable: "--font-cairo",
  display: "swap",
});

// Arabic display. Geometric Kufi — monumental rather than devotional.
const reemKufi = Reem_Kufi({
  subsets: ["arabic", "latin"],
  variable: "--font-reem-kufi",
  display: "swap",
  weight: ["400", "600", "700"],
});

// Latin display caps, matching assessment.empireenglish.online.
const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
  weight: ["400", "600", "700"],
});

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
      className={`${cairo.variable} ${reemKufi.variable} ${cinzel.variable}`}
    >
      <body className="atmosphere min-h-screen antialiased">{children}</body>
    </html>
  );
}
