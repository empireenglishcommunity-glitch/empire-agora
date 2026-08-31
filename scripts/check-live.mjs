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
import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = process.cwd();
const PORT = Number(process.env.CHECK_PORT ?? 3987);
const BASE = `http://127.0.0.1:${PORT}`;

/**
 * The server under test gets a THROWAWAY ledger and fake credentials.
 *
 * It must never inherit a real `DATA_DIR`: this gate creates orders, and pointing it at
 * production data would write test rows into the money ledger. The rails are given
 * obviously-fake values because the gate asserts those exact strings are ABSENT from the
 * public form markup — a real number here would make that assertion untrustworthy.
 */
const DATA_DIR = mkdtempSync(join(tmpdir(), "agora-live-"));
const FAKE = {
  RAIL_VODAFONE_CASH: "01000000000-FAKE-VC",
  RAIL_INSTAPAY: "fake-instapay@test.invalid",
  RAIL_PAYPAL: "fake-paypal@test.invalid",
  ADMIN_TOKEN: "live-check-token-0123456789abcdef",
  OWNER_WHATSAPP: "201000000000",
};

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

/**
 * Closing tags that end a line of text.
 *
 * `legend` and `fieldset` were missing, which made this checker report a bidi failure that
 * did not exist: a `<legend>` is a block-level element and forms its own bidi paragraph, so
 * merging it into the following label's text invented a line containing both. This is a
 * correctness fix to the checker, not a loosening to make something pass — the real markup
 * defect it found alongside it (two inline `<span>`s each containing "18") was fixed in the
 * markup, not here.
 */
const BLOCK_CLOSE =
  /<\/(p|div|li|ul|ol|h1|h2|h3|h4|h5|h6|td|th|tr|section|article|header|footer|main|nav|figcaption|dt|dd|blockquote|button|a|label|legend|fieldset|option|summary|details)>/gi;

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
  {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...FAKE, DATA_DIR, ORDERS_DB: join(DATA_DIR, "orders.db") },
  },
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
    // The checkout form. It renders prices, so it gets the same currency-isolation
    // scrutiny as the sales page — a buyer who reaches this page having been quoted one
    // currency must not be charged in the other.
    { label: "/ar/join", path: "/ar/join", locale: "ar", expectPrices: true },
    { label: "/ar/join?c=EGP", path: "/ar/join?c=EGP", locale: "ar", expectPrices: true, expectCurrency: "EGP" },
    { label: "/ar/join?c=USD", path: "/ar/join?c=USD", locale: "ar", expectPrices: true, expectCurrency: "USD" },
    { label: "/ar/join (geo: EG)", path: "/ar/join", locale: "ar", headers: { "cf-ipcountry": "EG" }, expectPrices: true, expectCurrency: "EGP" },
    { label: "/en/join", path: "/en/join", locale: "en", expectPrices: true },
    // The queue, unauthenticated. Must be the sign-in form, never the orders.
    { label: "/ar/admin/orders", path: "/ar/admin/orders", locale: "ar" },
    { label: "/en/admin/orders", path: "/en/admin/orders", locale: "en" },
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

  // -------------------------------------------------------------------------
  // Checkout, end to end, over real HTTP
  // -------------------------------------------------------------------------
  /**
   * Everything below drives the actual money path through the actual server: create an
   * order with a form POST, follow the redirect, read the confirmation page, then try to
   * reach the owner's endpoints without a session.
   *
   * This is the only place any of it is exercised as a whole. The unit gates prove the
   * ledger and the receipt store behave; they cannot prove that a form field name matches
   * what the route reads, or that a redirect goes where the page expects. Those are
   * exactly the defects this project keeps shipping — the assessment app returned a
   * constant 18/30 to every student for weeks because a page sent `transcription` where
   * the route read `transcript`.
   */
  console.log(`\nCheckout flow (real POSTs against the running server)\n`);

  const post = (path, body, headers = {}) =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      body: new URLSearchParams(body),
      headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
      redirect: "manual",
    });

  // ── 1. The form must not leak payment details ──
  // A payment number on a public page is an impersonation vector: a third party
  // screenshots the page with their own number substituted and collects real payments.
  {
    const html = await (await fetch(`${BASE}/ar/join?c=EGP`)).text();
    for (const [name, value] of Object.entries(FAKE)) {
      if (name === "ADMIN_TOKEN" || !value) continue;
      if (html.includes(value)) {
        fail(
          `/ar/join leaked ${name} ("${value}") into public markup. Payment details must ` +
            `appear only after an order exists (R5.7).`,
        );
      }
    }
    console.log(`  form leaks no payment identifier            ✓`);
  }

  // ── 1a. The share card must exist and actually resolve ──
  /**
   * A committed PNG referenced from metadata has two independent ways to be wrong: the
   * tag can be missing, or the tag can point at a file that is not there. Both produce
   * the same symptom — a WhatsApp share with no picture — and neither shows up anywhere
   * in a build log. WhatsApp is the primary sharing channel for this audience, so a
   * silently broken unfurl is a real cost.
   */
  for (const locale of ["ar", "en"]) {
    const html = await (await fetch(`${BASE}/${locale}`)).text();
    const src = html.match(/<meta property="og:image"[^>]*content="([^"]+)"/)?.[1];
    if (!src) {
      fail(`/${locale}: no og:image — a shared link shows no picture`);
      continue;
    }
    if (!/<meta name="twitter:card" content="summary_large_image"/.test(html)) {
      fail(`/${locale}: twitter:card is not summary_large_image, so the card is cropped square`);
    }
    // Dimensions let a client reserve space instead of reflowing or skipping the image.
    for (const dim of ["og:image:width", "og:image:height"]) {
      if (!html.includes(`property="${dim}"`)) fail(`/${locale}: og:image is missing ${dim}`);
    }
    const res = await fetch(src.startsWith("http") ? src.replace(/^https?:\/\/[^/]+/, BASE) : `${BASE}${src}`);
    if (res.status !== 200) {
      fail(`/${locale}: og:image "${src}" returned ${res.status} — the tag points at nothing`);
    } else {
      const bytes = Buffer.from(await res.arrayBuffer());
      // PNG signature, so a 200 serving an HTML error page is not mistaken for success.
      if (!(bytes[0] === 0x89 && bytes.subarray(1, 4).toString("ascii") === "PNG")) {
        fail(`/${locale}: og:image "${src}" is not a PNG`);
      }
      if (bytes.length > 400 * 1024) {
        fail(`/${locale}: og:image is ${(bytes.length / 1024).toFixed(0)} KB — too heavy to unfurl reliably`);
      }
      console.log(`  og:image /${locale} → ${src} (${(bytes.length / 1024).toFixed(0)} KB) ✓`);
    }
  }

  // ── 1b. An UNLISTED tier must not be advertised, but must stay buyable by link ──
  /**
   * `vip` is `unlisted` in EGP because Egyptian 1:1 earns about $23/teaching-hour
   * against about $45 for Egyptian group — worse than the tier it upgrades from. The
   * price gate asserts that relationship; it cannot see WHERE a tier is offered, and
   * "unlisted" was originally implemented as "still in the array", so the EGP form
   * listed VIP as the fourth of four options. Found by rendering the page and reading
   * it. Both halves are asserted here, because either one alone is satisfiable by doing
   * nothing: hiding it everywhere, or showing it everywhere.
   */
  {
    const plain = await (await fetch(`${BASE}/ar/join?c=EGP`)).text();
    const plans = plain.split("</fieldset>")[0]; // the plan radio group only
    if (/value="vip"/.test(plans)) {
      fail(
        `/ar/join?c=EGP advertises the "vip" tier, which is unlisted in EGP. Rendering a ` +
          `tier in the default radio group IS advertising it — route Egyptians to tarkeez.`,
      );
    }
    for (const promoted of ["darb", "asas", "tarkeez"]) {
      if (!new RegExp(`value="${promoted}"`).test(plans)) {
        fail(`/ar/join?c=EGP is missing the promoted tier "${promoted}"`);
      }
    }
    // Unavailable, not merely unlisted: it must be absent even with an explicit link.
    if (/value="nukhba"/.test(await (await fetch(`${BASE}/ar/join?c=EGP&tier=nukhba`)).text())) {
      fail(`/ar/join?c=EGP&tier=nukhba offered a tier that is UNAVAILABLE in EGP`);
    }

    /**
     * Every plan card must offer a REAL LINK to checkout.
     *
     * The CTA used to be `<Button>` — a bare `<button>` with no handler, outside any
     * form. It rendered perfectly and did nothing at all, on the primary action of the
     * pricing section. No gate could see it: the markup is valid, the copy is right, and
     * a screenshot cannot show that a button is inert. So the link is asserted here, per
     * tier, including that it carries the currency forward — otherwise /join re-guesses
     * and can quote a different price than the card the visitor clicked.
     */
    const sales = await (await fetch(`${BASE}/ar?c=EGP`)).text();
    for (const tier of ["darb", "asas", "tarkeez"]) {
      const link = new RegExp(`href="/ar/join\\?tier=${tier}&(?:amp;)?c=EGP`);
      if (!link.test(sales)) {
        fail(
          `/ar?c=EGP: the "${tier}" plan card has no checkout link carrying c=EGP. ` +
            `An inert CTA on the pricing section is invisible to every other check.`,
        );
      }
    }
    console.log(`  every plan card links to checkout            ✓`);

    const byLink = await (await fetch(`${BASE}/ar/join?c=EGP&tier=vip`)).text();
    if (!/value="vip"/.test(byLink)) {
      fail(
        `/ar/join?c=EGP&tier=vip did not offer the unlisted tier. It is unadvertised, ` +
          `not forbidden — a direct link must still be able to buy it.`,
      );
    }
    console.log(`  unlisted tier: hidden by default, buyable by link ✓`);
  }

  // ── 1c. THE 18+ AFFIRMATION IS ENFORCED AT THE DOOR ──
  /**
   * Membership is adults-only because a student's recordings are published to a shared
   * community channel and sent to third-party speech services — both of which would need a
   * parental-consent position for a minor, and neither of which this service can obtain.
   *
   * Both halves are asserted, because either alone is satisfiable by doing nothing: a form
   * that always refuses passes the refusal test, and a form with no checkbox at all passes
   * the acceptance test.
   */
  {
    const form = await (await fetch(`${BASE}/ar/join?c=EGP`)).text();
    if (!/name="ageConfirmed"/.test(form)) {
      fail(`/ar/join has no 18+ affirmation checkbox — the policy is not being asked for`);
    }
    if (!/name="ageConfirmed"[^>]*required|required[^>]*name="ageConfirmed"/.test(form)) {
      fail(`/ar/join's 18+ checkbox is not \`required\` — a buyer can skip it in the browser`);
    }

    // An unchecked box submits NOTHING, so the field is simply absent — the server must
    // test for presence, not for a falsy value.
    const without = await post("/api/orders/submit", {
      locale: "ar", currency: "EGP", tier: "asas", term: "monthly",
      rail: "vodafone_cash", name: "قاصر", contact: "+201000000002",
      idempotencyKey: `live-check-noage-${Date.now()}`,
    });
    const loc = without.headers.get("location") ?? "";
    if (!loc.includes("e=age")) {
      fail(
        `submitting the order form WITHOUT the 18+ affirmation was not refused ` +
          `(redirected to "${loc}"). No membership may exist without it.`,
      );
    }

    // The JSON endpoint is a second door to the same room.
    const json = await fetch(`${BASE}/api/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `live-json-noage-${Date.now()}` },
      body: JSON.stringify({
        locale: "ar", currency: "EGP", tier: "asas", term: "monthly",
        rail: "vodafone_cash", name: "قاصر", contact: "+201000000003",
      }),
    });
    if (json.status !== 400) {
      fail(`POST /api/orders without ageConfirmed returned ${json.status}, expected 400`);
    }

    // And it must be stated in the terms, not only enforced in code.
    for (const locale of ["ar", "en"]) {
      const terms = await (await fetch(`${BASE}/${locale}/terms`)).text();
      if (!/18/.test(terms)) {
        fail(`/${locale}/terms does not state the 18+ requirement — enforced but not disclosed`);
      }
    }
    console.log(`  18+ affirmation required, both endpoints    ✓`);
  }

  // ── 1d. EVERY REDIRECT MUST BE RELATIVE ──
  /**
   * The highest-consequence assertion in this file, added after the bug it describes was
   * found on the real box and not by any gate here.
   *
   * `NextResponse.redirect(new URL(path, req.nextUrl.origin))` is the documented pattern and
   * it emitted `https://0.0.0.0:3000/ar/join/EEC-...` in the container, because
   * `nextUrl.origin` resolves from the address the server is BOUND to and the Dockerfile sets
   * `HOSTNAME=0.0.0.0`. Correct `Host` / `X-Forwarded-*` headers made no difference.
   *
   * A browser cannot follow that. Buyers would have created orders that stored correctly and
   * then landed on an error instead of the page with their reference code and payment
   * details — while the server logged a successful 303.
   *
   * This gate could not see it before because the test client reaches the app at the address
   * it is bound to, so the origin happened to be right. Asserting the Location is RELATIVE
   * removes the dependency on where the test runs from.
   */
  {
    const cases = [
      ["order submit (error path)", () => post("/api/orders/submit", { locale: "ar" })],
      ["admin sign-in (denied)", () => post("/api/admin/session", { locale: "ar", token: "nope" })],
      ["currency switch", () => fetch(`${BASE}/api/currency?to=EGP&next=/ar`, { redirect: "manual" })],
      [
        "receipt upload (no file)",
        () => fetch(`${BASE}/api/orders/EEC-2609-ASEG-7K3Q/proof`, { method: "POST", body: new FormData(), redirect: "manual" }),
      ],
    ];

    for (const [label, run] of cases) {
      const res = await run();
      const loc = res.headers.get("location");
      if (!loc) continue; // a 404/400 with no redirect is fine for these probes
      if (!loc.startsWith("/")) {
        fail(
          `${label}: Location is "${loc}" — it must be a ROOT-RELATIVE path.
` +
            `      An absolute URL here is built from the bound address, which behind a proxy
` +
            `      is 0.0.0.0:3000 and unfollowable by any browser. Use seeOther() from
` +
            `      src/lib/redirect.ts.`,
        );
      }
      if (/0\.0\.0\.0|127\.0\.0\.1|localhost/.test(loc)) {
        fail(`${label}: Location "${loc}" leaks an internal address`);
      }
    }
    console.log(`  every redirect Location is relative           ✓`);
  }

  // ── 2. Create an order ──
  let reference = null;
  {
    const res = await post("/api/orders/submit", {
      locale: "ar",
      currency: "EGP",
      tier: "asas",
      term: "monthly",
      rail: "vodafone_cash",
      name: "طالب الاختبار",
      contact: "+201000000000",
      ageConfirmed: "yes",
      idempotencyKey: `live-check-${Date.now()}`,
    });

    if (res.status !== 303) {
      fail(`POST /api/orders/submit returned ${res.status}, expected a 303 redirect`);
    }
    const location = res.headers.get("location") ?? "";
    const m = location.match(/\/ar\/join\/(EEC-[A-Z0-9-]+)$/);
    if (!m) {
      fail(`order submit redirected to "${location}" — expected /ar/join/<reference>`);
    } else {
      reference = m[1];
      console.log(`  order created → ${reference}          ✓`);
    }
  }

  // ── 3. The confirmation page reveals payment details, and no buyer PII ──
  if (reference) {
    const res = await fetch(`${BASE}/ar/join/${reference}`);
    const html = await res.text();
    const page = { label: `/ar/join/${reference}`, locale: "ar", html, expectCurrency: "EGP", expectPrices: true };

    if (res.status !== 200) fail(`${page.label}: HTTP ${res.status}`);
    checkDirection(page, fail);
    checkBidi(page, fail);
    checkCurrencyIsolation(page, fail);

    if (!html.includes(reference)) {
      fail(`${page.label}: the reference code is not on the page the buyer must copy it from`);
    }
    if (!html.includes(FAKE.RAIL_VODAFONE_CASH)) {
      fail(
        `${page.label}: the payment account is MISSING. The buyer has an order and no way ` +
          `to pay it — silent, and only discovered by a customer who never pays.`,
      );
    }
    // PII is deliberately absent: a reference code is a weak secret (~900k combinations
    // with guessable month/tier/currency segments), so it must not gate a name or phone.
    if (html.includes("طالب الاختبار") || html.includes("+201000000000")) {
      fail(
        `${page.label}: renders buyer PII. The reference code is guessable enough that it ` +
          `must not be the only thing protecting a name and a phone number.`,
      );
    }
    console.log(`  confirmation page: code + account, no PII   ✓`);
  }

  // ── 4. Idempotency over real HTTP ──
  if (reference) {
    const key = `live-check-idem-${Date.now()}`;
    const body = {
      locale: "ar", currency: "EGP", tier: "asas", term: "monthly",
      rail: "vodafone_cash", name: "مكرر", contact: "+201000000001",
      ageConfirmed: "yes", idempotencyKey: key,
    };
    const a = await post("/api/orders/submit", body);
    const b = await post("/api/orders/submit", body);
    const refA = (a.headers.get("location") ?? "").split("/").pop();
    const refB = (b.headers.get("location") ?? "").split("/").pop();
    if (!refA || refA !== refB) {
      fail(
        `a double-submitted form produced two different orders (${refA} vs ${refB}). ` +
          `One intent must never become two charges.`,
      );
    } else {
      console.log(`  double submit → one order                   ✓`);
    }
  }

  // ── 5. A rail that does not belong to the currency is refused ──
  {
    const res = await post("/api/orders/submit", {
      locale: "ar", currency: "USD", tier: "asas", term: "monthly",
      rail: "vodafone_cash", // Egypt-only: it is also the geo gate
      name: "x", contact: "y", ageConfirmed: "yes",
      idempotencyKey: `live-check-mismatch-${Date.now()}`,
    });
    const loc = res.headers.get("location") ?? "";
    if (!loc.includes("e=rail")) {
      fail(`paying USD over an Egypt-only rail must be refused; redirected to "${loc}"`);
    } else {
      console.log(`  USD over an Egypt-only rail refused        ✓`);
    }
  }

  // ── 6. THE OWNER'S ENDPOINTS MUST BE SHUT ──
  // The highest-consequence assertion here. These serve names, phone numbers and
  // payment receipts.
  {
    const signInForm = await (await fetch(`${BASE}/ar/admin/orders`)).text();
    if (!/name="token"/.test(signInForm)) {
      fail(
        `/ar/admin/orders did not render a sign-in form for an unauthenticated visitor. ` +
          `If it rendered the queue instead, the guard is inverted.`,
      );
    }
    if (reference && signInForm.includes(reference)) {
      fail(`/ar/admin/orders LEAKED order ${reference} to an unauthenticated visitor`);
    }

    const shut = [
      ["POST", `/api/admin/orders/${reference ?? "EEC-2609-ASEG-7K3Q"}`],
      ["GET", `/api/admin/proof/${reference ?? "EEC-2609-ASEG-7K3Q"}-0123456789abcdef.jpg`],
    ];
    for (const [method, path] of shut) {
      const res =
        method === "POST"
          ? await post(path, { action: "verify", locale: "ar" })
          : await fetch(`${BASE}${path}`, { redirect: "manual" });
      if (res.status !== 404) {
        fail(`${method} ${path} returned ${res.status} without a session — must be 404`);
      }
    }
    console.log(`  admin routes shut without a session        ✓`);
  }

  // ── 7. And OPEN with one, so the refusals above are not vacuous ──
  {
    const login = await post("/api/admin/session", { locale: "ar", token: FAKE.ADMIN_TOKEN });
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    if (!cookie.startsWith("eec_admin=")) {
      fail(`signing in with the correct token set no session cookie (got "${cookie}")`);
    } else {
      const html = await (await fetch(`${BASE}/ar/admin/orders`, { headers: { cookie } })).text();
      if (reference && !html.includes(reference)) {
        fail(
          `the authenticated queue does not list order ${reference}. The guard refuses ` +
            `everyone, including the owner — which passes every "must be shut" check above.`,
        );
      }
      if (/name="token"/.test(html)) {
        fail(`the authenticated queue still rendered the sign-in form — the session is not being read`);
      }
      const page = { label: "/ar/admin/orders (authed)", locale: "ar", html };
      checkDirection(page, fail);
      checkBidi(page, fail);
      console.log(`  authenticated queue lists the order        ✓`);
    }

    const wrong = await post("/api/admin/session", { locale: "ar", token: "wrong-token-wrong-token" });
    if (!(wrong.headers.get("location") ?? "").includes("e=denied")) {
      fail(`signing in with a wrong token did not report denial`);
    }
    // A cookie carrying a wrong value must not be honoured either.
    const forged = await fetch(`${BASE}/ar/admin/orders`, { headers: { cookie: "eec_admin=not-the-token" } });
    if (!/name="token"/.test(await forged.text())) {
      fail(`a FORGED session cookie was accepted — the cookie value is not being verified`);
    }
    console.log(`  wrong token and forged cookie refused      ✓`);
  }

  if (failures.length) {
    console.error(`\n✗ ${failures.length} failure(s):\n`);
    for (const f of failures) console.error(`  • ${f}\n`);
    exitCode = 1;
  } else {
    console.log(`\n✓ live gates: direction, bidi, currency isolation and budget all pass.\n`);
  }
} finally {
  server.kill("SIGTERM");
  rmSync(DATA_DIR, { recursive: true, force: true });
}

process.exit(exitCode);
