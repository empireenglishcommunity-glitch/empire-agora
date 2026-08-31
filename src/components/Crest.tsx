/**
 * The empire crest — inline SVG.
 *
 * Inline rather than an image file on purpose: it is the hero's first mark, so it
 * must not cost a network round trip or contribute to LCP. It also inherits
 * `currentColor`, so it needs no variant per background.
 *
 * Decorative by default (`aria-hidden`), because the wordmark beside it already
 * carries the name. Pass a `title` only where the crest stands alone.
 */

export function Crest({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}

      {/* Outer ring */}
      <circle cx="32" cy="32" r="29" opacity="0.55" />
      {/* Inner hairline ring */}
      <circle cx="32" cy="32" r="24.5" opacity="0.3" />

      {/* Crown */}
      <path d="M22 24.5 L25.5 18 L28.8 22.5 L32 15.5 L35.2 22.5 L38.5 18 L42 24.5 Z" />
      <circle cx="32" cy="13" r="1.5" fill="currentColor" stroke="none" />

      {/* Laurel, left */}
      <path d="M20 30 C18 35 19 41 23 45" opacity="0.75" />
      <path d="M20.4 33 C22.4 33 23.6 34.2 24 36" opacity="0.6" />
      <path d="M21 37.5 C23 37.5 24.3 38.7 24.8 40.5" opacity="0.6" />
      {/* Laurel, right */}
      <path d="M44 30 C46 35 45 41 41 45" opacity="0.75" />
      <path d="M43.6 33 C41.6 33 40.4 34.2 40 36" opacity="0.6" />
      <path d="M43 37.5 C41 37.5 39.7 38.7 39.2 40.5" opacity="0.6" />

      {/* E monogram */}
      <path d="M28 30 H37 M28 30 V42 M28 36 H35 M28 42 H37" strokeWidth="1.6" />
    </svg>
  );
}
