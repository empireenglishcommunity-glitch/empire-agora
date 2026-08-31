#!/usr/bin/env node
/**
 * Fails the build on physical-direction CSS. FAILS THE BUILD.
 *
 * WHY
 * ---
 * This site is RTL by default. `ml-4` means "margin on the LEFT" regardless of
 * direction, so in Arabic it puts the gap on the wrong side — and it does so
 * *quietly*, because the page still renders and every test still passes. The
 * logical equivalent `ms-4` means "margin at the START", which is the right side
 * in RTL and the left in LTR.
 *
 * This is the single most common way an RTL layout rots: one `pl-6` added in a
 * hurry, never noticed by an author reading English.
 *
 * Spec: requirements.md R10.3.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["src"];
const EXTS = new Set([".tsx", ".ts", ".css", ".jsx", ".js"]);

/**
 * Physical Tailwind utilities and their logical replacements.
 * Word-boundary matched, and allowed to carry a variant prefix (`sm:`, `hover:`).
 */
const REPLACEMENTS = [
  [/\bml-/, "ms-"],
  [/\bmr-/, "me-"],
  [/\bpl-/, "ps-"],
  [/\bpr-/, "pe-"],
  [/\bleft-/, "start-"],
  [/\bright-/, "end-"],
  [/\bborder-l\b/, "border-s"],
  [/\bborder-r\b/, "border-e"],
  [/\bborder-l-/, "border-s-"],
  [/\bborder-r-/, "border-e-"],
  [/\brounded-l\b/, "rounded-s"],
  [/\brounded-r\b/, "rounded-e"],
  [/\btext-left\b/, "text-start"],
  [/\btext-right\b/, "text-end"],
  [/\bscroll-ml-/, "scroll-ms-"],
  [/\bscroll-mr-/, "scroll-me-"],
  [/\bfloat-left\b/, "float-start"],
  [/\bfloat-right\b/, "float-end"],
];

/** Raw CSS properties that have logical equivalents. */
const CSS_PROPS = [
  [/(^|[;{\s])margin-left\s*:/, "margin-inline-start"],
  [/(^|[;{\s])margin-right\s*:/, "margin-inline-end"],
  [/(^|[;{\s])padding-left\s*:/, "padding-inline-start"],
  [/(^|[;{\s])padding-right\s*:/, "padding-inline-end"],
  [/(^|[;{\s])border-left\s*:/, "border-inline-start"],
  [/(^|[;{\s])border-right\s*:/, "border-inline-end"],
  [/(^|[;{\s])text-align\s*:\s*(left|right)/, "text-align: start / end"],
];

/**
 * Lines carrying this marker are exempt. Real exemptions exist — a decorative
 * gradient direction, or a deliberately physical transform — but each must be
 * argued for in the comment, not waved through silently.
 */
const EXEMPT = "rtl-ok";

/**
 * Strip comments before matching.
 *
 * Without this the checker flags the very doc comment that documents the rule —
 * and worse, it would push authors to stop writing `ml-*` in explanations, making
 * the codebase harder to understand in order to satisfy a linter. A comment is
 * not a style.
 */
function stripComments(line) {
  const trimmed = line.trim();
  // Whole-line comments: JSDoc continuation, //, /* ... */
  if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
    return "";
  }
  // Trailing or inline comments on a line that also has code.
  return line.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/, " ");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (EXTS.has(extname(entry))) out.push(full);
  }
  return out;
}

const problems = [];

for (const dir of SCAN_DIRS) {
  let files;
  try {
    files = walk(join(ROOT, dir));
  } catch {
    continue;
  }

  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((rawLine, i) => {
      if (rawLine.includes(EXEMPT)) return;
      const line = stripComments(rawLine);
      if (!line.trim()) return;

      for (const [pattern, fix] of REPLACEMENTS) {
        if (pattern.test(line)) {
          const found = line.match(new RegExp(pattern.source + "[\\w./\\[\\]-]*"));
          problems.push({
            file: relative(ROOT, file),
            line: i + 1,
            found: found ? found[0] : pattern.source,
            fix,
            text: rawLine.trim(),
          });
        }
      }

      if (extname(file) === ".css") {
        for (const [pattern, fix] of CSS_PROPS) {
          if (pattern.test(line)) {
            problems.push({
              file: relative(ROOT, file),
              line: i + 1,
              found: pattern.source.replace(/[()^$\\[\]|?*+]/g, "").replace(/\s+/g, " ").trim(),
              fix,
              text: rawLine.trim(),
            });
          }
        }
      }
    });
  }
}

if (problems.length) {
  console.error(
    `✗ ${problems.length} physical-direction style(s) found. This page is RTL by ` +
      `default, so these mirror to the wrong side silently:\n`,
  );
  for (const p of problems) {
    console.error(`  ${p.file}:${p.line}`);
    console.error(`    ${p.text.slice(0, 100)}`);
    console.error(`    → replace "${p.found}" with "${p.fix}"\n`);
  }
  console.error(
    `  If a physical direction is genuinely correct (a decorative gradient, a\n` +
      `  deliberate transform), add a "${EXEMPT}" comment on that line explaining why.\n`,
  );
  process.exit(1);
}

console.log("✓ logical properties: no physical-direction styles found.");
