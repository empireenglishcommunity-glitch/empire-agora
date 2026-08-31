/**
 * Isolates an embedded Latin (LTR) run inside Arabic (RTL) text.
 *
 * WHY EVERY LATIN TOKEN MUST GO THROUGH THIS
 * ------------------------------------------
 * An Arabic line carrying two or more separate Latin runs reorders on screen
 * under the Unicode Bidirectional Algorithm: the eye jumps between runs in an
 * order that does not match the typed order, and the line's closing punctuation
 * lands at the wrong end, reading as a typo to a native reader. `scripts/check-bidi.mjs`
 * fails the build on that pattern in the copy dictionaries; this component is how
 * the component layer stays clean.
 *
 * `<bdi>` is the correct element rather than a styled `<span>`: it carries the
 * isolation semantics natively, so it works even where the stylesheet has not
 * loaded.
 *
 * Use for: prices, currency symbols, product nouns (Discord, VIP, Darb,
 * InstaPay, PayPal), CEFR codes (A1–C2), order reference codes, URLs, numerals
 * standing alone in Arabic prose.
 *
 * Spec: requirements.md R10.4.
 */

import type { ReactNode } from "react";

export function Ltr({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <bdi dir="ltr" className={className}>
      {children}
    </bdi>
  );
}
