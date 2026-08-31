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
  return { title: legal.terms.title, description: legal.terms.intro };
}

export default async function Terms({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const legal = getLegal(locale as Locale);

  return (
    <LegalPage
      title={legal.terms.title}
      intro={legal.terms.intro}
      updated={legal.updated}
      updatedLabel={legal.reviewNotice}
      sections={legal.terms.sections}
    />
  );
}
