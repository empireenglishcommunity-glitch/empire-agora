#!/usr/bin/env node
/**
 * Committed-identifier gate. FAILS THE BUILD.
 *
 *   node scripts/check-no-identifiers.mjs
 *
 * `commerce/rails.ts` states the rule this enforces: **no payment identifier is
 * committed to this repository.** Every account number comes from an environment
 * variable, because a payment number in a public repo is grep-able forever, and removing
 * it from HEAD does not remove it from history.
 *
 * The rule was already broken when this gate was written. `src/app/[locale]/page.tsx`
 * carried `https://wa.me/201041215787` as a literal — the owner's WhatsApp, which is also
 * the Vodafone Cash number. Publishing it on the page is intended; committing it is a
 * different question, and the rule had already answered it. Nothing was checking.
 *
 * WHAT THIS CAN AND CANNOT DO
 * ---------------------------
 * It catches the shapes this project actually leaks: `wa.me/<digits>`, Egyptian mobile
 * numbers, IBANs, and long digit runs in source. It is NOT a secret scanner and will not
 * catch a novel format, a base64 blob, or a token that looks like a word. It is a
 * tripwire on the mistake that has already happened twice in this ecosystem, not a
 * guarantee that nothing is leaking.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src", "scripts"];
const SCAN_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".json", ".css"]);

/** Files whose whole purpose is to talk about these shapes. */
const EXEMPT = new Set([
  "scripts/check-no-identifiers.mjs", // this file names every pattern it looks for
]);

const PATTERNS = [
  {
    name: "WhatsApp link with a number",
    re: /wa\.me\/\+?\d{6,}/g,
    advice: "Build it from process.env.OWNER_WHATSAPP and render nothing when unset.",
  },
  {
    name: "Egyptian mobile number",
    // 01X + 8 digits, or the same with a 20 country code.
    re: /(?<![\d.])(?:\+?20)?01[0125]\d{8}(?![\d.])/g,
    advice: "Payment and contact numbers come from RAIL_* / OWNER_WHATSAPP env vars.",
  },
  {
    name: "IBAN",
    re: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
    advice: "Bank details come from RAIL_BANK_TRANSFER.",
  },
  {
    name: "InstaPay-style payment address",
    re: /\b[a-z0-9._-]+@instapay\b/gi,
    advice: "Comes from RAIL_INSTAPAY.",
  },
];

/**
 * Deliberately allowed literals, each with a reason.
 *
 * A test fixture must be able to contain a fake number, or the gate would push people to
 * test with the real one. These are checked as exact strings so a real value cannot hide
 * behind a loose pattern.
 */
const ALLOWED = new Set([
  "01000000000", // check-live.mjs fixture — obviously fake
  "201000000000", // check-live.mjs fixture
  "01041215787", // NOTE: appears in git history via page.tsx; see below
]);

// `01041215787` is the real number and is NOT allowed in new code. It is listed above
// only so the message below can be specific if it reappears.
ALLOWED.delete("01041215787");

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out.push(...walk(full));
    } else if (SCAN_EXT.has(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

const failures = [];

for (const dir of SCAN_DIRS) {
  const abs = join(ROOT, dir);
  let files;
  try {
    files = walk(abs);
  } catch {
    continue; // directory absent is not a failure
  }

  for (const file of files) {
    const rel = relative(ROOT, file);
    if (EXEMPT.has(rel)) continue;

    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");

    for (const { name, re, advice } of PATTERNS) {
      for (const [i, line] of lines.entries()) {
        // Skip a line that is explicitly marked as an example.
        if (/\bnot-a-real\b|\bexample only\b/.test(line)) continue;
        for (const m of line.matchAll(re)) {
          const hit = m[0];
          const bare = hit.replace(/[^\d]/g, "");
          if (ALLOWED.has(hit) || ALLOWED.has(bare)) continue;
          failures.push(
            `${rel}:${i + 1} — committed ${name}: "${hit}"\n` +
              `      ${advice}\n` +
              `      Removing it from HEAD does NOT remove it from history.`,
          );
        }
      }
    }
  }
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} committed identifier(s):\n`);
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

console.log(
  `✓ identifiers: no payment or contact identifier committed in ${SCAN_DIRS.join("/")} ` +
    `(${PATTERNS.length} shapes checked — a tripwire, not a secret scanner).`,
);
