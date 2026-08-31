#!/usr/bin/env node
/**
 * Performance budget against the real build. FAILS THE BUILD.
 *
 * WHY A BUDGET AND NOT A LIGHTHOUSE SCORE
 * ---------------------------------------
 * The audience is overwhelmingly on phones, frequently on constrained Egyptian
 * mobile data. What costs them money and patience is **bytes on the wire for the
 * first view**, which is measurable deterministically here. A Lighthouse score
 * needs a browser, varies run to run, and would make the gate flaky — so this
 * measures transfer size, and LCP is verified by hand against real screenshots.
 *
 * WHAT IT COUNTS, AND WHY THAT MATTERS
 * ------------------------------------
 * Only what a first view of `/ar` actually downloads:
 *   · the prerendered HTML
 *   · the CSS and JS the page references
 *   · **only the fonts the page PRELOADS**
 *
 * That last point is the difference between a useful gate and a misleading one.
 * `next/font` emits a file per weight per subset — 7 files, 135 KB on disk here —
 * but `/ar` preloads 3 of them (75 KB). Counting all 7 overstates the real cost by
 * 80% and would have driven a design change to fix a number nobody experiences.
 *
 * Budgets are split by ownership so a regression is attributable: the framework
 * baseline is fixed by the stack, our CSS and HTML are ours to keep small.
 *
 * Spec: requirements.md R11.2, R11.3.
 */

import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const APP = join(ROOT, ".next", "server", "app");
const NEXT_DIR = join(ROOT, ".next");
const ENTRY = join(APP, "ar.html");

/**
 * Budgets in KB. Each figure was MEASURED and then given headroom, not guessed.
 * Raising one requires editing this comment to say why.
 */
const BUDGET = {
  /**
   * 200 KB. Measured 190 KB, of which ~156 KB is the Next 16 / React 19
   * app-router baseline — the cost of the framework, not of this page, which has
   * no interactivity yet. The stack is not negotiable here: Phase 6 needs a real
   * server endpoint for orders.
   *
   * The headroom is deliberately thin (10 KB) so the NEXT thing added is a
   * decision rather than a drift. If this becomes the binding constraint, the
   * lever is a static export for the marketing routes with no hydration — not
   * shaving kilobytes off components.
   */
  totalFirstView: 200,

  /**
   * 15 KB. Measured 6 KB. Tailwind v4 emits only what is used, so a jump here
   * means either a lot of new UI or an unpurged import.
   */
  css: 15,

  /** 10 KB. Measured 3 KB. A marketing page's HTML should stay small. */
  html: 10,

  /**
   * 85 KB preloaded. Measured 75 KB across three files: Cairo's Arabic and Latin
   * coverage for body text, plus Reem Kufi Arabic for display.
   *
   * Arabic webfonts are simply larger than Latin ones — a full Arabic face carries
   * four contextual forms per letter. 85 KB is honest for an Arabic-first page with
   * a display face, and all three load with `display: swap`, so they cost bytes but
   * never block first paint.
   *
   * Already banked: Cinzel was dropped (~30 KB) and Reem Kufi's unused Latin subset
   * removed (~10 KB). The next reduction available is dropping a Cairo weight.
   */
  preloadedFonts: 85,
};

if (!existsSync(ENTRY)) {
  console.error(
    `✗ ${relative(ROOT, ENTRY)} not found. Run "npm run build" first — this gate\n` +
      `  measures the real build, not an estimate.`,
  );
  process.exit(1);
}

const kb = (bytes) => bytes / 1024;
const gz = (buf) => gzipSync(buf).length;
const fmt = (n) => n.toFixed(1).padStart(7);

const htmlBuf = readFileSync(ENTRY);
const html = htmlBuf.toString("utf8");

const htmlBytes = gz(htmlBuf);
let cssBytes = 0;
let jsBytes = 0;
const assets = [];
let missing = 0;

// Deduplicated: a chunk commonly appears twice, once as a preload `href` and once
// as a script `src`. The browser fetches it once, so counting it twice inflates the
// figure — the same over-counting mistake the font accounting above exists to avoid.
const seenRefs = new Set();

for (const m of html.matchAll(/(?:href|src)="(\/_next\/[^"]+\.(css|js))"/g)) {
  const [, ref, kind] = m;
  if (seenRefs.has(ref)) continue;
  seenRefs.add(ref);
  const path = join(NEXT_DIR, ref.replace(/^\/_next\//, ""));
  if (!existsSync(path)) {
    missing++;
    continue;
  }
  const size = gz(readFileSync(path));
  if (kind === "css") cssBytes += size;
  else jsBytes += size;
  assets.push({ what: ref.replace(/^\/_next\/static\//, ""), bytes: size, kind });
}

// Fonts: only what this page PRELOADS is a first-view cost. woff2 is already
// compressed, so on-disk size is the transfer size.
let fontBytes = 0;
const preloadedFonts = [];
for (const m of html.matchAll(/rel="preload"[^>]*?href="(\/_next\/static\/media\/[^"]+)"/g)) {
  const path = join(NEXT_DIR, m[1].replace(/^\/_next\//, ""));
  if (!existsSync(path)) continue;
  const size = statSync(path).size;
  fontBytes += size;
  preloadedFonts.push({ what: m[1].split("/").pop(), bytes: size });
}

// For context only — never counted against the budget.
let fontsOnDisk = 0;
const mediaDir = join(NEXT_DIR, "static", "media");
if (existsSync(mediaDir)) {
  for (const f of readdirSync(mediaDir)) {
    if (/\.(woff2?|ttf|otf)$/.test(f)) fontsOnDisk += statSync(join(mediaDir, f)).size;
  }
}

const total = htmlBytes + cssBytes + jsBytes;

// ---------------------------------------------------------------------------
console.log(`\nPerformance budget — first view of /ar (gzipped; fonts already compressed)\n`);

assets.sort((a, b) => b.bytes - a.bytes);
for (const a of assets.slice(0, 10)) {
  console.log(`  ${fmt(kb(a.bytes))} KB  ${a.what}`);
}
if (assets.length > 10) console.log(`          …      ${assets.length - 10} more`);
console.log(`  ${fmt(kb(htmlBytes))} KB  ar.html`);

console.log(`\n  ${"-".repeat(52)}`);
console.log(`  ${fmt(kb(jsBytes))} KB  JS      (framework baseline dominates)`);
console.log(`  ${fmt(kb(cssBytes))} KB  CSS     (budget ${BUDGET.css})`);
console.log(`  ${fmt(kb(htmlBytes))} KB  HTML    (budget ${BUDGET.html})`);
console.log(`  ${fmt(kb(total))} KB  TOTAL   (budget ${BUDGET.totalFirstView})`);
console.log(
  `  ${fmt(kb(fontBytes))} KB  FONTS   (budget ${BUDGET.preloadedFonts}) — ` +
    `${preloadedFonts.length} preloaded of ${kb(fontsOnDisk).toFixed(0)} KB on disk`,
);
if (missing) console.log(`\n  note: ${missing} referenced asset(s) not found on disk`);

const failures = [];
const check = (actual, budget, label, advice) => {
  if (kb(actual) > budget) {
    failures.push(
      `${label} is ${kb(actual).toFixed(1)} KB, over the ${budget} KB budget by ` +
        `${(kb(actual) - budget).toFixed(1)} KB. ${advice}`,
    );
  }
};

check(total, BUDGET.totalFirstView, "first view total",
  "If this is framework growth, the lever is a static export for marketing routes with no hydration.");
check(cssBytes, BUDGET.css, "CSS",
  "Tailwind emits only what is used, so check for an unpurged import before raising this.");
check(htmlBytes, BUDGET.html, "HTML",
  "Large prerendered HTML usually means content that belongs in a lazy section.");
check(fontBytes, BUDGET.preloadedFonts, "preloaded fonts",
  "Drop a Cairo weight before raising this. Do NOT count non-preloaded files — no first view downloads them.");

if (failures.length) {
  console.error(`\n✗ performance budget exceeded:\n`);
  for (const f of failures) console.error(`  • ${f}\n`);
  console.error(
    `  Raise a budget only by editing the BUDGET comment to say why. The constraint\n` +
      `  is a real person on Egyptian mobile data, not an arbitrary number.\n`,
  );
  process.exit(1);
}

console.log(`\n✓ performance budget: within limits.\n`);
