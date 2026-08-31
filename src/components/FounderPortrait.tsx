/**
 * The founder portrait.
 *
 * WHY A PLAIN <picture> AND NOT next/image
 * ----------------------------------------
 * `next/image` needs `sharp` to optimise at runtime in production. Adding a native
 * image pipeline — and its memory — to a container capped at 384 MB, in order to
 * resize exactly ONE static portrait that never changes, is a bad trade.
 *
 * So the derivatives are generated once at authoring time from
 * `assets/founder/founder-seated.HEIC` and committed: AVIF 7.5 KB, WebP 9.7 KB,
 * JPEG 20.6 KB. The browser picks the best format it supports; the JPEG is the
 * floor. No runtime dependency, nothing to optimise on request, and the bytes are
 * known rather than hoped for.
 *
 * The crop was chosen by generating candidates and looking at them: the head sits at
 * 28% of the frame height, which is standard portrait framing. Anchoring near the
 * top of the source — the obvious first guess — left a third of the frame as empty
 * concrete wall, and cropping tighter without moving the anchor pushed the face to
 * the bottom edge.
 *
 * ONE photo, not four. Four suit portraits on a sales page reads as a personal
 * brand; one reads as accountability. The fuller founder story lives on
 * `empire-crown`, which this section links to.
 *
 * Intrinsic size is exactly 2× the CSS box (360×520 for a 180×260 frame), so it is
 * crisp on a phone without paying for pixels nobody sees. `width`/`height` are set
 * so the browser reserves the space and the section never shifts as it loads.
 */

export function FounderPortrait({ alt }: { alt: string }) {
  return (
    <picture>
      <source srcSet="/founder/founder.avif" type="image/avif" />
      <source srcSet="/founder/founder.webp" type="image/webp" />
      <img
        src="/founder/founder.jpg"
        alt={alt}
        width={360}
        height={520}
        loading="lazy"
        decoding="async"
        className="h-[260px] w-[180px] rounded-sm border border-(--color-gold)/30 object-cover"
      />
    </picture>
  );
}
