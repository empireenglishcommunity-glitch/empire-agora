#!/usr/bin/env node
/**
 * Schema-migration gate, run as a SEPARATE PROCESS by check-orders.mjs.
 *
 *   npx tsx scripts/check-orders-migration.mjs
 *
 * WHY A SEPARATE PROCESS
 * ----------------------
 * `orders.ts` resolves `DATA_DIR` and `ORDERS_DB` once, at module load, into `const`s.
 * That is correct for production — the environment is set before the server starts and
 * never changes — so a test cannot repoint the database by mutating `process.env` after
 * importing the module. The choice was between loosening the module to suit the test and
 * running the test in a process where the environment is already right. **Weakening
 * production code to make it testable is the wrong trade**, so this runs in its own
 * process with the env pre-set.
 *
 * WHAT IS UNDER TEST
 * ------------------
 * The schema is `CREATE TABLE IF NOT EXISTS`, which does nothing once the table exists.
 * A column added to that statement therefore reaches a FRESH database and silently misses
 * the live one — surfacing as `SQLITE_ERROR: no such column` on the next insert, which is
 * to say **at checkout, to a paying customer.**
 *
 * Every other assertion in check-orders.mjs runs against a database that script just
 * created, so they all pass whether or not migration works. This is the only check that
 * can tell the difference: it builds a database with the OLD schema on purpose.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dir = mkdtempSync(join(tmpdir(), "agora-migrate-"));
const dbFile = join(dir, "orders.db");

// The schema exactly as it shipped BEFORE `age_confirmed_at` existed. Written out in full
// rather than derived, because the point is to reproduce a database this code did not make.
const LEGACY_SCHEMA = `
  CREATE TABLE orders (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    reference_code    TEXT    NOT NULL UNIQUE,
    idempotency_key   TEXT    NOT NULL UNIQUE,
    created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
    locale            TEXT    NOT NULL,
    currency          TEXT    NOT NULL,
    tier              TEXT    NOT NULL,
    term              TEXT    NOT NULL,
    amount_minor      INTEGER NOT NULL,
    rail              TEXT    NOT NULL,
    name              TEXT    NOT NULL,
    contact           TEXT    NOT NULL,
    email             TEXT,
    country           TEXT,
    discord           TEXT,
    status            TEXT    NOT NULL DEFAULT 'created',
    proof_key         TEXT,
    proof_uploaded_at TEXT,
    verified_at       TEXT,
    verified_by       TEXT,
    period_start      TEXT,
    period_end        TEXT,
    source            TEXT,
    referrer          TEXT,
    notes             TEXT
  )
`;

const raw = new DatabaseSync(dbFile);
raw.exec(LEGACY_SCHEMA);
// A row that predates the policy. Migration must neither lose it nor invent an
// affirmation for it.
raw
  .prepare(
    `INSERT INTO orders (reference_code, idempotency_key, locale, currency, tier, term,
       amount_minor, rail, name, contact)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
  )
  .run("EEC-2601-ASEG-LEGA", "legacy-key", "ar", "EGP", "asas", "annual", 500000, "instapay", "Legacy Buyer", "+2010000");
raw.close();

// Set BEFORE the import, which is the whole reason this is a separate process.
process.env.DATA_DIR = dir;
process.env.ORDERS_DB = dbFile;

const { createOrder, findByReference, __resetConnectionForTests } = await import(
  "../src/commerce/orders.ts"
);

const failures = [];
const ok = (cond, m) => { if (!cond) failures.push(m); };

// Opening through the module is what triggers migration.
const legacy = findByReference("EEC-2601-ASEG-LEGA");
ok(legacy !== null, "migration lost a pre-existing row");
ok(
  legacy?.ageConfirmedAt === null,
  "a pre-existing row must read back with ageConfirmedAt NULL — migration must never " +
    "backfill an affirmation nobody actually made",
);

// The assertion that a missing migration fails on: without the ALTER, this insert throws
// `no such column: age_confirmed_at`.
let created = null;
try {
  created = createOrder({
    locale: "ar",
    currency: "EGP",
    tier: "asas",
    term: "annual",
    rail: "instapay",
    name: "Post Migration",
    contact: "+201000000000",
    ageConfirmed: true,
    idempotencyKey: "post-migration-key",
  }).order;
} catch (err) {
  failures.push(
    `after opening a PRE-EXISTING database, creating an order FAILED: ${err.message}\n` +
      `      This is the exact production failure: the live ledger keeps the old shape ` +
      `while a fresh one gets the new column, and the first symptom is a customer's ` +
      `checkout 500ing.`,
  );
}
ok(created?.ageConfirmedAt != null, "a post-migration order must record the affirmation");

// Reconnecting must be a no-op, not a second ALTER (which SQLite would reject).
__resetConnectionForTests();
let reread = null;
try {
  reread = findByReference(created?.referenceCode ?? "");
} catch (err) {
  failures.push(`reopening a migrated database threw — migration is not idempotent: ${err.message}`);
}
ok(reread?.ageConfirmedAt != null, "migration must be idempotent across reconnects");

rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n✗ ${failures.length} migration failure(s):\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error("");
  process.exit(1);
}
console.log(
  "✓ migration: a pre-existing database gains the new column, keeps its rows, " +
    "backfills nothing, and stays writable and idempotent.",
);
