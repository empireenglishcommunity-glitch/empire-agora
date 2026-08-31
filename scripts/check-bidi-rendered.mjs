#!/usr/bin/env node
/**
 * Bidi gate against the RENDERED BUILD OUTPUT. FAILS THE BUILD.
 *
 * WHY THIS EXISTS ALONGSIDE check-bidi.mjs
 * ----------------------------------------
 * `check-bidi.mjs` validates the copy dictionaries. It cannot see what
 * *composition* produces. This is a clean `ar.json` and a broken page:
 *
 *     ar.json:  { "pay": "ادفع بـ" }
 *     JSX:      <p>{t.pay} InstaPay أو Vodafone Cash</p>
 *
 * Two Latin islands in one Arabic line, assembled in the component, invisible to
 * a dictionary check. This script reads the prerendered HTML and applies the rule
 * where it actually matters: to the text a human will read.
 *
 * THE PRECISE RULE
 * ----------------
 * Content inside `<bdi>` is *already isolated* and is therefore excluded from the
 * count. So this does not flag "an Arabic line containing Latin" — it flags **an
 * Arabic line containing Latin that was not isolated**, which is exactly the
 * defect. That makes the gate teach the fix rather than merely forbid the symptom.
 *
 * Also asserts the direction invariants: `ar` pages are `dir="rtl"`, `en` pages
 * are `dir="ltr"`.
 *
 * Spec: requirements.md R10.2, R10.4, R10.6, R10.7.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";

const ROOT = process.cwd();
const BUILD_DIR = join(ROOT, ".next", "server", "app");

const ARABIC_CHAR =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LTR_ISLAND = /[A-Za-z0-9#!_<>-]+/g;

/** Placeholder standing in for correctly isolated content. */
const ISOLATED = "\u27E6ISO\u27E7";

const BLOCK_CLOSE =
  /<\/(p|div|li|ul|ol|h1|h2|h3|h4|h5|h6|td|th|tr|section|article|header|footer|main|nav|figcaption|dt|dd|blockquote|button|a|label|option)>/gi;

function extractLines(html) {
  let s = html;

  // Non-content first.
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");

  // Correctly isolated runs are not defects — remove them from consideration.
  s = s.replace(/<bdi\b[^>]*>[\s\S]*?<\/bdi>/gi, ` ${ISOLATED} `);

  // Preserve block boundaries so islands are counted per visual line.
  s = s.replace(BLOCK_CLOSE, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");

  // Remaining tags carry attributes full of Latin; drop them entirely.
  s = s.replace(/<[^>]+>/g, " ");

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

function countIslands(line) {
  const withoutIsolated = line.split(ISOLATED).join(" ");
  const islands = withoutIsolated.match(LTR_ISLAND) ?? [];
  return islands.filter((i) => i.length >= 2 || i === "#" || i === "!");
}

function walkHtml(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkHtml(full, out);
    else if (entry.endsWith(".html")) out.push(full);
  }
  return out;
}

if (!existsSync(BUILD_DIR)) {
  console.error(
    `✗ ${relative(ROOT, BUILD_DIR)} not found. Run "npm run build" before this check —\n` +
      `  it deliberately inspects rendered output, not source.`,
  );
  process.exit(1);
}

const files = walkHtml(BUILD_DIR);
if (files.length === 0) {
  console.error("✗ No prerendered HTML found. Did the build produce static pages?");
  process.exit(1);
}

let issues = 0;
let linesChecked = 0;
const dirProblems = [];

for (const file of files) {
  const html = readFileSync(file, "utf8");
  const name = basename(file, ".html");

  // Direction invariants.
  const htmlTag = html.match(/<html[^>]*>/i)?.[0] ?? "";
  if (/^ar\b/.test(name) || name === "ar") {
    if (!/dir="rtl"/.test(htmlTag)) {
      dirProblems.push(`${name}.html is an Arabic page but has no dir="rtl"`);
    }
    if (!/lang="ar"/.test(htmlTag)) {
      dirProblems.push(`${name}.html has no lang="ar"`);
    }
  }
  if (name === "en" || /^en\b/.test(name)) {
    if (!/dir="ltr"/.test(htmlTag)) {
      dirProblems.push(`${name}.html is an English page but has no dir="ltr"`);
    }
  }

  for (const line of extractLines(html)) {
    if (!line || !ARABIC_CHAR.test(line)) continue;
    linesChecked++;
    const islands = countIslands(line);
    if (islands.length >= 2) {
      issues++;
      console.error(`\n✗ ${relative(ROOT, file)}`);
      console.error(`    ${line.slice(0, 140)}`);
      console.error(
        `    ${islands.length} un-isolated Latin islands: ${islands
          .slice(0, 6)
          .map((i) => `"${i}"`)
          .join(", ")}`,
      );
    }
  }
}

for (const p of dirProblems) console.error(`\n✗ ${p}`);

if (issues > 0 || dirProblems.length > 0) {
  console.error(
    `\n✗ rendered bidi: ${issues} line(s) with 2+ un-isolated Latin islands` +
      `${dirProblems.length ? `, ${dirProblems.length} direction problem(s)` : ""}.\n\n` +
      `  Wrap each Latin token in <Ltr> (which renders <bdi dir="ltr">), or split the\n` +
      `  line so it carries at most one. Content already inside <bdi> is excluded from\n` +
      `  this count — so the fix is always to isolate, never to delete the Arabic.\n`,
  );
  process.exit(1);
}

console.log(
  `✓ rendered bidi: ${linesChecked} Arabic line(s) across ${files.length} page(s), ` +
    `0 un-isolated multi-island lines, direction attributes correct.`,
);
