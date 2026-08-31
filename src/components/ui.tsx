/**
 * UI primitives in the obsidian + antique gold language.
 *
 * Derived from assessment.empireenglish.online (measured, not described) and
 * bound by the style guide: "premium, uncluttered, academy not influencer",
 * "restraint + dignity, never gaudy".
 *
 * TWO RULES EVERY COMPONENT HERE OBEYS
 * ------------------------------------
 * 1. **Logical properties only.** `ms-*`/`me-*`/`ps-*`/`pe-*`/`start-*`/`end-*`,
 *    never `ml-*`/`mr-*`/`left-*`/`right-*`. The page is RTL by default and
 *    physical directions silently mirror wrong. `npm run check:logical` fails the
 *    build on a physical-direction utility.
 * 2. **No raw colours.** Semantic tokens from globals.css only, so a retheme is
 *    one file.
 *
 * Spec: requirements.md R9.4, R10.3.
 */

import type { ReactNode, ComponentPropsWithoutRef } from "react";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mx-auto w-full max-w-5xl px-5 sm:px-8", className)}>
      {children}
    </div>
  );
}

export function Section({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx("py-16 sm:py-24", className)}>
      <Container>{children}</Container>
    </section>
  );
}

/**
 * The small tracked label above a section heading, between two hairline rules.
 * The source site's most recognisable structural motif.
 */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex items-center gap-4">
      <span className="h-px w-8 shrink-0 bg-(--color-gold)/30" />
      <span className="font-(family-name:--font-display-latin) text-xs tracking-[0.35em] text-(--color-gold) uppercase">
        {children}
      </span>
      <span className="h-px grow bg-(--color-gold)/15" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * Display heading with the gold gradient fill.
 *
 * `lang` matters: Arabic display uses Reem Kufi, Latin uses Cinzel. They are not
 * interchangeable — Cinzel has no Arabic glyphs at all, so a mislabelled heading
 * silently falls back and loses the whole typographic intent.
 */
export function Display({
  children,
  as: Tag = "h2",
  lang = "ar",
  className,
}: {
  children: ReactNode;
  as?: "h1" | "h2" | "h3";
  lang?: "ar" | "en";
  className?: string;
}) {
  const face =
    lang === "ar"
      ? "font-(family-name:--font-display-ar)"
      : "font-(family-name:--font-display-latin) tracking-wide uppercase";
  const size =
    Tag === "h1"
      ? "text-4xl sm:text-6xl leading-[1.15]"
      : Tag === "h2"
        ? "text-3xl sm:text-4xl leading-tight"
        : "text-xl sm:text-2xl leading-snug";
  return (
    <Tag className={cx("text-gold-gradient", face, size, className)}>{children}</Tag>
  );
}

export function Lead({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p className={cx("text-lg leading-relaxed text-(--color-text-muted)", className)}>
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "quiet";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-sm px-6 py-3 text-sm " +
  "font-semibold tracking-wide transition-all duration-200 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-gold) " +
  "disabled:pointer-events-none disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // Gold gradient fill with a soft outer glow — the source site's primary action.
  // Dark ink on gold, because gold-on-dark text at button size fails contrast.
  primary:
    "bg-linear-to-b from-(--color-gold-bright) to-(--color-gold) text-(--color-obsidian) " +
    "shadow-[0_0_24px_-6px_var(--color-gold)] hover:shadow-[0_0_32px_-4px_var(--color-gold)] " +
    "hover:brightness-110",
  secondary:
    "border border-(--color-gold)/50 text-(--color-gold) hover:border-(--color-gold) " +
    "hover:bg-(--color-gold)/10",
  quiet: "text-(--color-text-muted) hover:text-(--color-parchment) px-2",
};

export function Button({
  children,
  variant = "primary",
  className,
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
} & ComponentPropsWithoutRef<"button">) {
  return (
    <button className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...rest}>
      {children}
    </button>
  );
}

/** Same visual language as Button, for real navigation. */
export function ButtonLink({
  children,
  variant = "primary",
  className,
  ...rest
}: {
  children: ReactNode;
  variant?: ButtonVariant;
} & ComponentPropsWithoutRef<"a">) {
  return (
    <a className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...rest}>
      {children}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  children,
  className,
  emphasis = false,
}: {
  children: ReactNode;
  className?: string;
  /** For the most-chosen tier. Real emphasis, not a fake "popular" badge. */
  emphasis?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-sm border p-6 backdrop-blur-[1px] transition-colors",
        emphasis
          ? "border-(--color-gold)/50 bg-(--color-midnight) shadow-[0_0_40px_-24px_var(--color-gold)]"
          : "border-(--color-gold)/20 bg-(--color-surface) hover:border-(--color-gold)/35",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border border-(--color-gold)/40",
        "bg-(--color-gold)/10 px-3 py-1 text-xs tracking-wide text-(--color-gold)",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Divider({ className }: { className?: string }) {
  return (
    <hr
      className={cx(
        "border-0 h-px bg-linear-to-r from-transparent via-(--color-gold)/25 to-transparent",
        className,
      )}
    />
  );
}

/**
 * A definition row: label at the start, value at the end.
 *
 * Uses `justify-between` rather than any physical alignment, so it mirrors
 * correctly in both directions with no direction-specific code.
 */
export function Row({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex items-baseline justify-between gap-4 border-b border-(--color-gold)/15 py-3",
        className,
      )}
    >
      <span className="text-(--color-text-muted)">{label}</span>
      <span className="text-(--color-parchment)">{value}</span>
    </div>
  );
}
