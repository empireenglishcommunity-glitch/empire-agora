#!/usr/bin/env node
/**
 * Live-page gates: bidi, currency isolation, and the performance budget.
 * FAILS THE BUILD.
 *
 * WHY THIS REPLACED THREE BUILD-OUTPUT GATES
 * ------------------------------------------
 * The sales page is **dynamic by necessity**: it must read a cookie and a geo
 * header to decide which currency a visitor sees (requirements R1.1/R1.2). So Next
 * server-renders it on demand and there is no prerendered `ar.html` to inspect —
 * the earlier gates were reading build artefacts that no longer exist for the one
 * route that matters.
 *
 * Rather than contort the page to stay static, this boots the real server and
 * fetches the real routes. That is strictly better verification: it tests the bytes
 * a browser receives, in every currency state, including the geo-header path that
 * no build artefact could ever exercise.
 *
 * It also matters that this checks BOTH currency states. A currency bug is
 * invisible when you only ever look at one.
 *
 * Spec: requirements.md R1.3, R10.2, R10.4, R10.7, R11.2.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const PORT = Number(process.env.CHECK_PORT ?? 3987);
const BASE = `http://127.0.0.1:${PORT}`;

const ARABIC_CHAR =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LTR_ISLAND = /[A-Za-z0-9#!_<>-]+/g;
const ISOLATED = "\u27E6ISO\u27E7";

/**
 * Budgets in KB, split BY OWNERSHIP so a regression is attributable.
 *
 * Each figure was measured and then given thin headroom. Raising one means editing
 * this comment to say why.
 *
 *   js    185 — the Next 16 / React 19 app-router baseline on a page with no
 *               interactivity. Pinned separately so framework growth is visible
 *               rather than hidden inside a total. Not negotiable here: Phase 6
 *               needs a real server endpoint for orders.
 *   css    15 — measured 6.8. Tailwind emits only what is used, so a jump means
 *               a lot of new UI or an unpurged import.
 *   html   22 — measured 14.9 for the full fourteen-section page. This is the
 *               number that grows as content grows, which is legitimate; the
 *               budget exists so it grows deliberately.
 *   fonts  85 — measured 75 across three files: Cairo's Arabic and Latin coverage
 *               plus Reem Kufi Arabic. Arabic faces are simply larger — a full
 *               Arabic face carries four contextual forms per letter.
 *   total 285 — measured 277.4. A backstop on the aggregate, not an independent
 *               limit: it must stay consistent with the categories above (which sum
 *               to 307 at their individual ceilings). An earlier value of 220 was
 *               set before fonts were counted into the total and therefore
 *               contradicted its own components — the kind of incoherent budget that
 *               trains people to raise numbers instead of reading them.
 */
const BUDGET = { js: 185, css: 15, html: 22, fonts: 85, total: 285 };

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

async function waitForServer(timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/ar`, { redirect: "manual" });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const BLOCK_CLOSE =
  /<\/(p|div|li|ul|ol|h1|h2|h3|h4|h5|h6|td|th|tr|section|article|header|footer|main|nav|figcaption|dt|dd|blockquote|button|a|label|option|summary|details)>/gi;

function textLines(html) {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Correctly isolated runs are not defects — exclude them from the count so the
    // gate flags UN-isolated Latin rather than the presence of Latin.
    .replace(/<bdi\b[^>]*>[\s\S]*?<\/bdi>/gi, ` ${ISOLATED} `)
    .replace(BLOCK_CLOSE, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

  return s.split("\n").map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim());
}

function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

function countIslands(line) {
  const islands = line.split(ISOLATED).join(" ").match(LTR_ISLAND) ?? [];
  return islands.filter((i) => i.length >= 2 || i === "#" || i === "!");
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function checkDirection(page, fail) {
  const tag = page.html.match(/<html[^>]*>/i)?.[0] ?? "";
  const expected = page.locale === "ar" ? "rtl" : "ltr";
  if (!new RegExp(`dir="${expected}"`).test(tag)) {
    fail(`${page.label}: expected dir="${expected}" on <html>`);
  }
  if (!new RegExp(`lang="${page.locale}"`).test(tag)) {
    fail(`${page.label}: expected lang="${page.locale}" on <html>`);
  }
}

function checkBidi(page, fail) {
  let lines = 0;
  for (const line of textLines(page.html)) {
    if (!line || !ARABIC_CHAR.test(line)) continue;
    lines++;
    const islands = countIslands(line);
    if (islands.length >= 2) {
      fail(
        `${page.label}: ${islands.length} un-isolated Latin islands in one Arabic line\n` +
          `      "${line.slice(0, 120)}"\n` +
          `      ${islands.slice(0, 6).map((i) => `"${i}"`).join(", ")}\n` +
          `      → wrap each in <Ltr>, or split the line`,
      );
    }
  }
  return lines;
}

function checkCurrencyIsolation(page, fail) {
  const text = visibleText(page.html);
  const egp = text.match(/\d[\d,]*\s*ج\.م/g) ?? [];
  const usd = text.match(/\$\s?\d[\d,]*/g) ?? [];

  if (page.exemptFromCurrencyIsolation) return { egp: egp.length, usd: usd.length };

  if (egp.length > 0 && usd.length > 0) {
    fail(
      `${page.label}: renders BOTH currencies (EGP ${egp.slice(0, 2).join(", ")} and ` +
        `USD ${usd.slice(0, 2).join(", ")}).\n` +
        `      The Egypt tier is about a third of the international price; showing both\n` +
        `      gives the higher-paying market a reason to feel overcharged.`,
    );
  }

  // A pricing page that shows NO price is a different failure, and a silent one.
  if (page.expectPrices && egp.length === 0 && usd.length === 0) {
    fail(`${page.label}: expected prices but found none — the pricing source may not be reaching the page`);
  }

  // And it must be the currency we asked for.
  if (page.expectCurrency === "EGP" && egp.length === 0) {
    fail(`${page.label}: requested EGP but no EGP price rendered`);
  }
  if (page.expectCurrency === "USD" && usd.length === 0) {
    fail(`${page.label}: requested USD but no USD price rendered`);
  }

  return { egp: egp.length, usd: usd.length };
}

async function checkPerf(page, fail) {
  const htmlBytes = gzipSync(Buffer.from(page.html)).length;
  let cssBytes = 0;
  let jsBytes = 0;
  const seen = new Set();

  for (const m of page.html.matchAll(/(?:href|src)="(\/_next\/[^"]+\.(css|js))"/g)) {
    const [, ref, kind] = m;
    if (seen.has(ref)) continue; // fetched once by the browser; counting twice inflates
    seen.add(ref);
    const path = join(ROOT, ".next", ref.replace(/^\/_next\//, ""));
    if (!existsSync(path)) continue;
    const size = gzipSync(readFileSync(path)).length;
    if (kind === "css") cssBytes += size;
    else jsBytes += size;
  }

  /**
   * Count EVERY font the page references, not only the preloaded ones.
   *
   * An earlier version counted preloads only. On this dynamic route Next emits no
   * `rel="preload" as="font"` at all — the faces still arrive, referenced from the
   * inlined CSS — so that version reported 0.0 KB for 75 KB of real transfer. It was
   * accurate about preloading and wrong about cost.
   *
   * Preload status is reported separately, because its absence is its own finding:
   * without it the fonts are discovered only after CSS parses, which means a visible
   * swap on the hero text — and the hero text is the LCP element.
   */
  let fontBytes = 0;
  const fontRefs = new Set();
  for (const m of page.html.matchAll(/\/_next\/static\/media\/[A-Za-z0-9._-]+\.woff2?/g)) {
    fontRefs.add(m[0]);
  }
  for (const ref of fontRefs) {
    const path = join(ROOT, ".next", ref.replace(/^\/_next\//, ""));
    if (existsSync(path)) fontBytes += statSync(path).size; // woff2 is already compressed
  }
  const preloadedCount = [
    ...page.html.matchAll(/rel="preload"[^>]*?as="font"/g),
  ].length;

  const kb = (b) => b / 1024;
  const total = htmlBytes + cssBytes + jsBytes + fontBytes;

  console.log(
    `    JS ${kb(jsBytes).toFixed(1)} · CSS ${kb(cssBytes).toFixed(1)} · ` +
      `HTML ${kb(htmlBytes).toFixed(1)} · fonts ${kb(fontBytes).toFixed(1)} ` +
      `(${fontRefs.size} refs, ${preloadedCount} preloaded) · TOTAL ${kb(total).toFixed(1)} KB`,
  );

  if (fontRefs.size > 0 && preloadedCount === 0) {
    console.log(
      `    ⚠ fonts are referenced but NOT preloaded on this route. Dynamic rendering\n` +
        `      drops next/font's preload links, so the faces are discovered only after\n` +
        `      CSS parses — a visible swap on the hero text, which is the LCP element.\n` +
        `      Not failing the build: the bytes are budgeted and \`display: swap\` keeps\n` +
        `      text readable throughout. Worth fixing when hosting is settled.`,
    );
  }

  const over = (actual, budget, label, advice) => {
    if (kb(actual) > budget) {
      fail(
        `${page.label}: ${label} is ${kb(actual).toFixed(1)} KB, over the ${budget} KB ` +
          `budget by ${(kb(actual) - budget).toFixed(1)} KB. ${advice}`,
      );
    }
  };

  over(jsBytes, BUDGET.js, "JS",
    "This is framework baseline — if it grew, something pulled a client component in. The lever is a static export for marketing routes with no hydration.");
  over(cssBytes, BUDGET.css, "CSS",
    "Tailwind emits only what is used; check for an unpurged import.");
  over(htmlBytes, BUDGET.html, "HTML",
    "Content growth is legitimate, but raise this deliberately — long prose may belong in a lazily-loaded section.");
  over(fontBytes, BUDGET.fonts, "fonts",
    "Drop a Cairo weight before raising this.");
  over(total, BUDGET.total, "first view total",
    "Check which category grew above before raising the total.");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

if (!existsSync(join(ROOT, ".next"))) {
  console.error(`✗ No .next build found. Run "npm run build" first.`);
  process.exit(1);
}

const server = spawn(
  process.execPath,
  [join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)],
  { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
);

let exitCode = 0;
const failures = [];
const fail = (m) => failures.push(m);

try {
  if (!(await waitForServer())) {
    console.error("✗ Server did not become ready in time.");
    process.exit(1);
  }

  /**
   * Every currency state, including the geo-header path. `?c=` and the header are
   * different code paths and a bug can live in either.
   */
  const targets = [
    { label: "/ar (default, no signal)", path: "/ar", locale: "ar", expectPrices: true },
    { label: "/ar?c=EGP", path: "/ar?c=EGP", locale: "ar", expectPrices: true, expectCurrency: "EGP" },
    { label: "/ar?c=USD", path: "/ar?c=USD", locale: "ar", expectPrices: true, expectCurrency: "USD" },
    { label: "/ar (geo: EG)", path: "/ar", locale: "ar", headers: { "cf-ipcountry": "EG" }, expectPrices: true, expectCurrency: "EGP" },
    { label: "/ar (geo: SA)", path: "/ar", locale: "ar", headers: { "cf-ipcountry": "SA" }, expectPrices: true, expectCurrency: "USD" },
    { label: "/ar?term=monthly", path: "/ar?term=monthly&c=EGP", locale: "ar", expectPrices: true, expectCurrency: "EGP" },
    { label: "/en", path: "/en", locale: "en", expectPrices: true },
    // Legal pages carry no prices, but they are buyer-facing Arabic prose naming
    // payment rails and third-party services — which is exactly where mixed-direction
    // text creeps in. They get the same direction and bidi scrutiny as the offer.
    { label: "/ar/terms", path: "/ar/terms", locale: "ar" },
    { label: "/ar/privacy", path: "/ar/privacy", locale: "ar" },
    { label: "/en/terms", path: "/en/terms", locale: "en" },
    { label: "/en/privacy", path: "/en/privacy", locale: "en" },
    {
      label: "/ar/design",
      path: "/ar/design",
      locale: "ar",
      exemptFromCurrencyIsolation: true, // developer reference, noindex, shows both by design
    },
  ];

  console.log(`\nLive page gates (server on :${PORT})\n`);

  let arabicLines = 0;
  let first = true;

  for (const t of targets) {
    const res = await fetch(`${BASE}${t.path}`, { headers: t.headers ?? {} });
    const html = await res.text();
    const page = { ...t, html };

    if (res.status !== 200) {
      fail(`${t.label}: HTTP ${res.status}`);
      continue;
    }

    checkDirection(page, fail);
    arabicLines += checkBidi(page, fail);
    const counts = checkCurrencyIsolation(page, fail);

    console.log(
      `  ${t.label.padEnd(26)} 200  EGP:${String(counts.egp).padStart(2)}  USD:${String(counts.usd).padStart(2)}`,
    );

    // Budget the entry page only; the others share the same assets.
    if (first) {
      await checkPerf(page, fail);
      first = false;
    }
  }

  console.log(`\n  ${arabicLines} Arabic lines checked for bidi across ${targets.length} responses.`);

  if (failures.length) {
    console.error(`\n✗ ${failures.length} failure(s):\n`);
    for (const f of failures) console.error(`  • ${f}\n`);
    exitCode = 1;
  } else {
    console.log(`\n✓ live gates: direction, bidi, currency isolation and budget all pass.\n`);
  }
} finally {
  server.kill("SIGTERM");
}

process.exit(exitCode);
