import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { Ltr } from "@/components/Ltr";
import { Price, AnnualPerMonth, Amount } from "@/components/Price";
import { Crest } from "@/components/Crest";
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
  Row,
  Section,
} from "@/components/ui";
import { promotedTiers, ASSESSMENT, type Currency } from "@/commerce/pricing";

/**
 * Design-system reference.
 *
 * Exists so the primitives can be SEEN — at 360px, in RTL, with real Arabic and
 * real prices — rather than reasoned about. It is the surface the Phase 2
 * verification screenshots are taken from, and the fastest way to spot a
 * mirrored margin or a broken bidi run.
 *
 * noindex: useful internally, not a page for buyers.
 */
export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

/** A count, where zero means "not included" rather than "none of them". */
function Count({ n }: { n: number }) {
  if (n === 0) return <span className="text-(--color-text-muted)">—</span>;
  return <Ltr>{n}</Ltr>;
}

export default async function DesignSystem({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  // Both currencies appear on THIS page only. It is a noindex internal reference,
  // not a buyer-facing surface, so the currency-isolation rule (R1.3) does not
  // apply here — and the isolation gate skips this route by name for that reason.
  const currencies: Currency[] = ["EGP", "USD"];

  return (
    <main>
      <Section>
        <Eyebrow>Design system</Eyebrow>
        <Display as="h1">نظام التصميم</Display>
        <Lead className="mt-5 max-w-xl">
          مرجع داخلي للمكوّنات. الهدف إننا نشوف الشكل الحقيقي على الموبايل قبل ما
          نبني الصفحة نفسها.
        </Lead>
      </Section>

      <Divider />

      {/* ---- Crest + wordmark ---- */}
      <Section>
        <Eyebrow>Crest</Eyebrow>
        <div className="flex flex-wrap items-center gap-8">
          <Crest className="h-24 w-24 text-(--color-gold)" title="Empire English Community" />
          <Crest className="h-14 w-14 text-(--color-bronze)" />
          <Crest className="h-8 w-8 text-(--color-text-muted)" />
        </div>
      </Section>

      <Divider />

      {/* ---- Type ---- */}
      <Section>
        <Eyebrow>Typography</Eyebrow>
        <div className="space-y-8">
          <div>
            <p className="mb-2 text-xs text-(--color-text-muted)">
              <Ltr>h1 · Arabic display · Reem Kufi</Ltr>
            </p>
            <Display as="h1">اتكلم إنجليزي بثقة</Display>
          </div>
          <div>
            <p className="mb-2 text-xs text-(--color-text-muted)">
              <Ltr>h1 · Latin display · Cinzel</Ltr>
            </p>
            <Display as="h1" lang="en">
              Empire English
            </Display>
          </div>
          <div>
            <p className="mb-2 text-xs text-(--color-text-muted)">
              <Ltr>h2 / h3</Ltr>
            </p>
            <Display as="h2">الباقات والأسعار</Display>
            <Display as="h3" className="mt-3">
              إزاي النظام بيشتغل
            </Display>
          </div>
          <div>
            <p className="mb-2 text-xs text-(--color-text-muted)">
              <Ltr>Lead + body</Ltr>
            </p>
            <Lead className="max-w-xl">
              التدريب اليومي بيحصل على المنصة، والجلسة المباشرة للتصحيح والمتابعة.
            </Lead>
            <p className="mt-3 max-w-xl">
              نص عادي للمقارنة. الأرقام والكلمات اللاتينية بتتغلّف كلها بمكوّن
              العزل.
            </p>
          </div>
        </div>
      </Section>

      <Divider />

      {/* ---- Bidi: the cases that actually break ---- */}
      <Section>
        <Eyebrow>Bidi — the hard cases</Eyebrow>
        <Lead className="mb-6 max-w-xl">
          كل رمز لاتيني لازم يكون داخل مكوّن العزل. الأمثلة دي بالذات هي اللي
          بتتكسر.
        </Lead>
        <div className="space-y-3">
          <Row
            label="اسم المنتج داخل جملة عربية"
            value={
              <>
                <Ltr>Discord</Ltr>
              </>
            }
          />
          <Row
            label="طريقة الدفع الأولى"
            value={<Ltr>InstaPay</Ltr>}
          />
          <Row
            label="طريقة الدفع التانية"
            value={<Ltr>Vodafone Cash</Ltr>}
          />
          <Row label="المستوى" value={<Ltr>B1</Ltr>} />
          <Row
            label="كود الطلب"
            value={<Ltr>EEC-2609-ASEG-7K3Q</Ltr>}
          />
          <Row
            label="سعر بالجنيه"
            value={<Price tier="asas" currency="EGP" term="monthly" />}
          />
          <Row
            label="سعر بالدولار"
            value={<Price tier="asas" currency="USD" term="monthly" />}
          />
        </div>
        <p className="mt-6 text-sm text-(--color-text-muted)">
          لاحظ إن كل سطر فيه رمز لاتيني واحد بس. السطر اللي فيه اتنين أو أكتر
          بيترتب غلط على الشاشة، وعلامة الترقيم بتروح للناحية الغلط.
        </p>
      </Section>

      <Divider />

      {/* ---- Actions ---- */}
      <Section>
        <Eyebrow>Actions</Eyebrow>
        <div className="flex flex-wrap items-center gap-4">
          <Button>ابدأ اختبار المستوى</Button>
          <Button variant="secondary">اعرف الأسعار</Button>
          <Button variant="quiet">أسئلة شائعة</Button>
          <Button disabled>غير متاح</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <ButtonLink href="#">
            <Ltr>Link as button</Ltr>
          </ButtonLink>
          <Badge>١٢ مقعد</Badge>
          <Badge>
            <Ltr>VIP</Ltr>
          </Badge>
        </div>
      </Section>

      <Divider />

      {/* ---- Cards with real prices, both currencies ---- */}
      {currencies.map((currency) => (
        <Section key={currency}>
          <Eyebrow>{`Tier cards · ${currency}`}</Eyebrow>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {promotedTiers(currency).map((tier) => (
              <Card key={tier.id} emphasis={tier.id === "tarkeez"}>
                <div className="mb-4 flex items-baseline justify-between gap-3">
                  <h3 className="font-(family-name:--font-display-ar) text-xl text-(--color-parchment)">
                    {tier.nameAr}
                  </h3>
                  {tier.totalSeatCap ? <Badge>{tier.totalSeatCap}</Badge> : null}
                </div>
                <p className="mb-1 text-3xl text-(--color-gold)">
                  <Price tier={tier.id} currency={currency} term="monthly" />
                </p>
                <p className="text-sm text-(--color-text-muted)">
                  أو <AnnualPerMonth tier={tier.id} currency={currency} /> شهريًا
                  على السنة
                </p>
                <Divider className="my-4" />
{/* A zero renders as an em dash, never "0". "0 جلسات أسبوعية" reads as a
    missing value or a bug; "—" reads as "this tier does not include that",
    which is the actual meaning for دَرْب. */}
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between gap-3">
                    <span className="text-(--color-text-muted)">جلسات أسبوعية</span>
                    <Count n={tier.groups.reduce((n, g) => n + g.sessionsPerWeek, 0)} />
                  </li>
                  <li className="flex justify-between gap-3">
                    <span className="text-(--color-text-muted)">جلسات فردية شهريًا</span>
                    <Count n={tier.oneToOnePerMonth} />
                  </li>
                </ul>
                <Button className="mt-6 w-full">اشترك</Button>
              </Card>
            ))}
          </div>
          <p className="mt-6 text-sm text-(--color-text-muted)">
            رسوم التقييم:{" "}
            <Amount value={ASSESSMENT.price[currency]} currency={currency} /> —
            تُخصم بالكامل من أول اشتراك.
          </p>
        </Section>
      ))}

      <Divider />

      <Container>
        <p className="py-10 text-xs text-(--color-text-muted)">
          <Ltr>noindex · internal reference · Phase 2</Ltr>
        </p>
      </Container>
    </main>
  );
}
