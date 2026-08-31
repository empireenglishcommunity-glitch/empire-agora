import { Container, Display, Divider, Eyebrow, Lead, Section } from "./ui";

/**
 * Shared layout for the terms and privacy pages.
 *
 * These read as prose rather than as a wall of numbered clauses on purpose. The
 * audience is buying in their second language, and a document nobody can read is
 * not a disclosure — it is a place to hide things. The obligations here are the
 * real ones; the plain wording is what makes them binding in practice.
 *
 * Deliberately static: no cookie, no geo, nothing currency-dependent, so these
 * prerender and cost nothing to serve.
 */

export interface LegalSection {
  heading: string;
  paras: string[];
}

export function LegalPage({
  title,
  intro,
  updated,
  updatedLabel,
  highlightTitle,
  highlights,
  sections,
}: {
  title: string;
  intro: string;
  updated: string;
  updatedLabel: string;
  /** Present on the privacy page: the things a reader must not miss. */
  highlightTitle?: string;
  highlights?: string[];
  sections: LegalSection[];
}) {
  return (
    <main>
      <Section className="pt-14 pb-8">
        <Eyebrow>{updatedLabel}</Eyebrow>
        <Display as="h1">{title}</Display>
        <Lead className="mt-6 max-w-2xl">{intro}</Lead>
        <p className="mt-4 text-xs text-(--color-bronze)">{updated}</p>
      </Section>

      <Divider />

      {/* The consequential disclosures go ABOVE the body, not buried in section six.
          On this site that means: recordings are published to a shared channel, and
          voice data reaches third-party services. A reader who stops after the first
          screen should still have seen both. */}
      {highlights && highlights.length > 0 ? (
        <Section className="py-10">
          <div className="rounded-sm border border-(--color-gold)/40 bg-(--color-midnight) p-6">
            <h2 className="mb-4 text-lg text-(--color-gold)">{highlightTitle}</h2>
            <ul className="space-y-3">
              {highlights.map((h) => (
                <li key={h} className="border-s-2 border-(--color-gold)/40 ps-4 leading-relaxed">
                  {h}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      ) : null}

      <Section className="pt-4">
        <div className="max-w-2xl space-y-10">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="mb-3 text-xl text-(--color-parchment)">{section.heading}</h2>
              <div className="space-y-2.5">
                {section.paras.map((p) => (
                  <p key={p} className="leading-relaxed text-(--color-text-muted)">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Section>

      <footer className="border-t border-(--color-gold)/15 py-10">
        <Container>
          <a href="../" className="text-sm text-(--color-gold) hover:underline">
            &larr;
          </a>
        </Container>
      </footer>
    </main>
  );
}
