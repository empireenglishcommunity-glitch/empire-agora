import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, locales, type Locale } from "@/i18n/config";
import { getLegal } from "@/i18n/legal";
import { LegalPage } from "@/components/LegalPage";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const legal = getLegal(locale as Locale);
  return { title: legal.privacy.title, description: legal.privacy.intro };
}

export default async function Privacy({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const legal = getLegal(locale as Locale);

  return (
    <LegalPage
      title={legal.privacy.title}
      intro={legal.privacy.intro}
      updated={legal.updated}
      updatedLabel={legal.reviewNotice}
      highlightTitle={legal.privacy.highlightTitle}
      highlights={legal.privacy.highlights}
      sections={legal.privacy.sections}
    />
  );
}
