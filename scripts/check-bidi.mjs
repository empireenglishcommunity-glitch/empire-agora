#!/usr/bin/env node
/**
 * Bidi gate for Arabic copy. FAILS THE BUILD.
 *
 * Ported from empire-nexus/bots/discord-learning-bot/scripts/bidi_check.py,
 * whose own docstring notes that CI wiring was "not yet done". This is the first
 * automated bidi gate anywhere in the ecosystem — the bot's checker and
 * EEC-MATERIAL's Puppeteer render probe are both run by hand.
 *
 * WHAT IT CATCHES
 * ---------------
 * An Arabic line containing TWO OR MORE separate embedded Latin runs. Every
 * renderer applies the Unicode Bidirectional Algorithm, so such a line forces the
 * eye to jump between RTL and LTR runs in an order that does not match the typed
 * order, and the closing punctuation lands at the wrong end. This is a documented
 * property of bidirectional text, not a bug in any one renderer.
 *
 *   BAD:  ادفع بـ InstaPay أو Vodafone Cash            ← two Latin islands
 *   GOOD: ادفع بـ InstaPay                              ← one island per line
 *         أو Vodafone Cash
 *   GOOD: <Ltr>InstaPay</Ltr> wrapped in the component layer
 *
 * A marketing page is the worst case for this: every price, every product noun
 * (Discord, VIP, Darb, InstaPay, PayPal) is a Latin island inside Arabic prose.
 *
 * Spec: requirements.md R10.4, R10.6, R10.7.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// A run of Latin-script characters treated as one island. Same character class
// as the Python original so the two checkers agree.
const LTR_ISLAND = /[A-Za-z0-9#!_<>-]+/g;

const ARABIC_CHAR =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

/**
 * Placeholders are NOT islands. `{price}` is substituted at render time by the
 * <Price> component, which emits its own <Ltr> isolation — so counting it here
 * would report a problem the component layer already solves, and would push
 * authors toward worse copy to satisfy a false positive.
 */
const PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/g;

function countLtrIslands(line) {
  const islands = line.replace(PLACEHOLDER, " ").match(LTR_ISLAND) ?? [];
  // Ignore islands too short to disorient — a bare digit like the "3" in
  // "المستوى 3" is normal. Mirrors the Python implementation.
  return islands.filter((i) => i.length >= 2 || i === "#" || i === "!").length;
}

function findIssues(text) {
  const issues = [];
  for (const line of String(text).split("\n")) {
    if (!ARABIC_CHAR.test(line)) continue; // pure-Latin lines cannot be bidi issues
    const n = countLtrIslands(line);
    if (n >= 2) {
      const islands = line.replace(PLACEHOLDER, " ").match(LTR_ISLAND) ?? [];
      issues.push({
        line: line.trim(),
        count: n,
        islands: islands.filter((i) => i.length >= 2 || i === "#" || i === "!"),
      });
    }
  }
  return issues;
}

/** Walk a parsed JSON dictionary, yielding [dottedKeyPath, stringValue]. */
function* walk(node, path = []) {
  if (typeof node === "string") {
    yield [path.join("."), node];
  } else if (Array.isArray(node)) {
    for (const [i, v] of node.entries()) yield* walk(v, [...path, `[${i}]`]);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) yield* walk(v, [...path, k]);
  }
}

const CONTENT_DIR = join(process.cwd(), "src", "content");

if (!existsSync(CONTENT_DIR)) {
  console.log("✓ bidi: no src/content yet — nothing to check.");
  process.exit(0);
}

// Arabic-bearing dictionaries only. en.json is LTR by definition.
const files = readdirSync(CONTENT_DIR).filter((f) => /^ar.*\.json$/.test(f));

if (files.length === 0) {
  console.log("✓ bidi: no Arabic content files yet — nothing to check.");
  process.exit(0);
}

let total = 0;
let checked = 0;

for (const file of files) {
  const raw = readFileSync(join(CONTENT_DIR, file), "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`✗ ${file} is not valid JSON: ${err.message}`);
    process.exit(1);
  }

  for (const [keyPath, value] of walk(parsed)) {
    checked++;
    const issues = findIssues(value);
    if (issues.length === 0) continue;
    for (const issue of issues) {
      total++;
      console.error(`\n✗ ${file} → ${keyPath}`);
      console.error(`    ${issue.line}`);
      console.error(
        `    ${issue.count} Latin islands: ${issue.islands.map((i) => `"${i}"`).join(", ")}`,
      );
    }
  }
}

if (total > 0) {
  console.error(
    `\n✗ ${total} bidi issue(s) across ${files.length} file(s).\n\n` +
      `  Fix by doing ONE of:\n` +
      `    · split the line so each carries at most one Latin token\n` +
      `    · move the Latin tokens into a table row or a list, one per row\n` +
      `    · replace a hard-coded price with the {price} placeholder so <Price>\n` +
      `      renders it inside <Ltr>\n\n` +
      `  Do not "fix" this by deleting the Arabic. The rule exists because such a\n` +
      `  line genuinely reorders on screen and its punctuation lands at the wrong\n` +
      `  end — it reads as a typo to a native reader.\n`,
  );
  process.exit(1);
}

console.log(
  `✓ bidi: ${checked} string(s) across ${files.length} file(s), ` +
    `0 lines with 2+ embedded Latin islands.`,
);
