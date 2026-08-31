#!/usr/bin/env node
/**
 * Environment-wiring gate. FAILS THE BUILD.
 *
 *   node scripts/check-env-wiring.mjs
 *
 * Every `process.env.X` the application reads must be BOTH:
 *
 *   1. passed into the container by `docker-compose.yml`, and
 *   2. documented in `.env.example`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `OWNER_WHATSAPP` was added to the code and to `.env.example` and **not** to
 * `docker-compose.yml`. Docker does not pass a host variable into a container unless it is
 * listed, so in production the variable would simply have been absent — and the code is
 * written to degrade quietly when it is (it renders no button rather than a dead link).
 * The result would have been a silently missing "message us" fallback on the sales page
 * and on every order confirmation, with **no error in any log**, discovered whenever a
 * stuck buyer eventually complained through some other channel.
 *
 * That is the whole shape of the bug this gate exists for: a variable that is read, is
 * documented, is set on the host, and never reaches the process. Nothing else in the
 * pipeline can see it — the code compiles, the container starts, the page renders 200.
 *
 * It was found by reading `docker-compose.yml` on deployment day, which is later than it
 * should have been found and earlier than a customer finding it.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();

/**
 * Variables the platform provides, or that are build-time only. Each is listed with a
 * reason so this does not become a dumping ground for anything inconvenient.
 */
const NOT_REQUIRED = new Map([
  ["NODE_ENV", "set by Next/Docker, never by us"],
  ["PORT", "set in the Dockerfile"],
  ["HOSTNAME", "set in the Dockerfile"],
  ["NEXT_TELEMETRY_DISABLED", "build-time, already in the Dockerfile and compose"],
  ["ORDERS_DB", "test-only override; production uses DATA_DIR"],
  ["CHECK_PORT", "test-only, used by check-live.mjs"],
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      walk(full, out);
    } else if ([".ts", ".tsx"].includes(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip comments before scanning.
 *
 * Same shape as `check-logical-properties.mjs`, and needed for the same reason: the first
 * run of this gate flagged `X` as an undeclared variable because `lib/admin.ts` explains the
 * fail-closed rule with the phrase `token === process.env.X`. A gate that reports the
 * documentation of a rule as a violation of it teaches people to delete comments.
 */
function stripComments(line) {
  const trimmed = line.trim();
  if (trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*")) {
    return "";
  }
  return line.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/, " ");
}

// Collect every variable the app reads, with the file that reads it.
const readBy = new Map();
for (const file of walk(join(ROOT, "src"))) {
  const text = readFileSync(file, "utf8").split("\n").map(stripComments).join("\n");
  for (const m of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
    const name = m[1];
    if (!readBy.has(name)) readBy.set(name, new Set());
    readBy.get(name).add(relative(ROOT, file));
  }
  // The indirect form: rails.ts reads `process.env[def.envVar]`, so the names live in the
  // RAILS table rather than in the expression. Pick them up from the declarations.
  for (const m of text.matchAll(/envVar:\s*"([A-Z][A-Z0-9_]*)"/g)) {
    const name = m[1];
    if (!readBy.has(name)) readBy.set(name, new Set());
    readBy.get(name).add(relative(ROOT, file));
  }
}

const compose = existsSync(join(ROOT, "docker-compose.yml"))
  ? readFileSync(join(ROOT, "docker-compose.yml"), "utf8")
  : "";
const example = existsSync(join(ROOT, ".env.example"))
  ? readFileSync(join(ROOT, ".env.example"), "utf8")
  : "";

if (!compose) {
  console.error("✗ no docker-compose.yml — cannot verify environment wiring");
  process.exit(1);
}

const failures = [];

for (const [name, files] of [...readBy].sort()) {
  if (NOT_REQUIRED.has(name)) continue;
  const where = [...files].join(", ");

  // Must appear on the service's `environment:` list, in either compose form.
  const inCompose =
    new RegExp(`^\\s*-\\s*${name}\\s*=`, "m").test(compose) ||
    new RegExp(`^\\s*${name}\\s*:`, "m").test(compose);

  if (!inCompose) {
    failures.push(
      `${name} is read by ${where} but is NOT in docker-compose.yml.\n` +
        `      Docker will not pass it into the container, so the app sees it as unset —\n` +
        `      silently, with no error in any log. Add:  - ${name}=\${${name}:-}`,
    );
  }

  if (!new RegExp(`^\\s*#?\\s*${name}=`, "m").test(example)) {
    failures.push(
      `${name} is read by ${where} but is not documented in .env.example.\n` +
        `      An operator filling in .env has no way to know it exists.`,
    );
  }
}

// And the reverse: something wired in but read nowhere is dead config that misleads.
for (const m of compose.matchAll(/^\s*-\s*([A-Z][A-Z0-9_]*)=/gm)) {
  const name = m[1];
  if (NOT_REQUIRED.has(name) || readBy.has(name)) continue;
  failures.push(
    `${name} is passed into the container by docker-compose.yml but nothing in src/ reads it.\n` +
      `      Either it is dead config, or the code that should read it is missing.`,
  );
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} environment-wiring problem(s):\n`);
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

const checked = [...readBy.keys()].filter((n) => !NOT_REQUIRED.has(n));
console.log(
  `✓ env wiring: ${checked.length} variable(s) read by the app are all passed in by ` +
    `docker-compose.yml and documented in .env.example.`,
);
