#!/usr/bin/env node
/**
 * Order ledger gate. FAILS THE BUILD.
 *
 * This is the money path, so it is tested against a REAL SQLite file — not a mock,
 * not in-memory. Durability that has only been tested in memory has not been tested.
 *
 *   npx tsx scripts/check-orders.mjs
 *
 * Spec: requirements.md R5.2, R5.3, R5.4, R6.1.
 */

import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "agora-orders-"));
process.env.DATA_DIR = dir;
process.env.ORDERS_DB = join(dir, "orders.db");

const {
  createOrder,
  findByReference,
  findByIdempotencyKey,
  attachProof,
  markVerified,
  setStatus,
  listOrders,
  countByStatus,
  amountForDisplay,
  durabilitySettings,
  OrderError,
  __resetConnectionForTests,
} = await import("../src/commerce/orders.ts");
const { isReferenceCode, buildReferenceCode } = await import("../src/commerce/reference.ts");
const { priceFor } = await import("../src/commerce/pricing.ts");

const failures = [];
const fail = (m) => failures.push(m);
const ok = (cond, m) => { if (!cond) fail(m); };

const base = {
  locale: "ar",
  currency: "EGP",
  tier: "asas",
  term: "annual",
  rail: "instapay",
  name: "Test Buyer",
  contact: "+201000000000",
  // Every fixture affirms 18+. `createOrder` refuses without it, and there is a
  // dedicated test below proving that refusal — so this must not be the thing that
  // silently makes the refusal untestable.
  ageConfirmed: true,
};

let n = 0;
const key = () => `test-key-${++n}`;

// ── 1. A created order is durable and readable back ──
{
  const { order, reused } = createOrder({ ...base, idempotencyKey: key() });
  ok(!reused, "a first create must not report reuse");
  ok(order.id > 0, "order should have an id");
  ok(order.status === "created", `status should be created, got ${order.status}`);
  ok(isReferenceCode(order.referenceCode), `reference code malformed: ${order.referenceCode}`);
  ok(findByReference(order.referenceCode) !== null, "order must be readable by reference");
  ok(existsSync(process.env.ORDERS_DB), "the database file must actually exist on disk");
}

// ── 2. The AMOUNT comes from pricing.ts, never from the caller ──
{
  const { order } = createOrder({ ...base, tier: "asas", currency: "EGP", term: "annual", idempotencyKey: key() });
  const expected = priceFor("asas", "EGP", "annual");
  ok(
    amountForDisplay(order) === expected,
    `amount should be ${expected} from pricing.ts, got ${amountForDisplay(order)}`,
  );
  ok(Number.isInteger(order.amountMinor), "amountMinor must be an integer (money is never a float)");
  ok(order.amountMinor === expected * 100, "amountMinor must be minor units");

  // A caller trying to dictate the price must be ignored entirely.
  const { order: sneaky } = createOrder({
    ...base,
    idempotencyKey: key(),
    amountMinor: 1,
    amount: 1,
    price: 1,
  });
  ok(
    amountForDisplay(sneaky) === expected,
    "a caller-supplied amount must be ignored — the server prices the order",
  );
}

// ── 3. IDEMPOTENCY: the same key never creates a second order ──
{
  const k = key();
  const first = createOrder({ ...base, idempotencyKey: k });
  const second = createOrder({ ...base, idempotencyKey: k });
  ok(second.reused, "the second call with the same key must report reuse");
  ok(
    first.order.referenceCode === second.order.referenceCode,
    "the same key must return the same order, not a new one",
  );
  ok(findByIdempotencyKey(k).id === first.order.id, "lookup by key must find the original");

  // Ten rapid retries — the double-tap case on a slow connection.
  const codes = new Set();
  for (let i = 0; i < 10; i++) codes.add(createOrder({ ...base, idempotencyKey: k }).order.referenceCode);
  ok(codes.size === 1, `10 retries produced ${codes.size} orders, expected 1`);
}

// ── 4. Reference codes are unique across many creates ──
{
  const codes = new Set();
  for (let i = 0; i < 300; i++) {
    codes.add(createOrder({ ...base, idempotencyKey: key() }).order.referenceCode);
  }
  ok(codes.size === 300, `300 orders produced ${codes.size} unique references`);
}

// ── 5. A tier not sold in a currency is refused ──
{
  let threw = null;
  try {
    createOrder({ ...base, tier: "nukhba", currency: "EGP", idempotencyKey: key() });
  } catch (e) { threw = e; }
  ok(threw instanceof OrderError, "selling nukhba in EGP must throw");
  ok(threw?.code === "invalid", `expected code "invalid", got ${threw?.code}`);
}

// ── 6. The happy path, in order ──
{
  const { order } = createOrder({ ...base, idempotencyKey: key() });
  const withProof = attachProof(order.referenceCode, "proofs/x.jpg");
  ok(withProof.status === "proof_submitted", "attaching proof moves to proof_submitted");
  ok(withProof.proofUploadedAt !== null, "proof timestamp must be recorded");

  const verified = markVerified(order.referenceCode, "owner");
  ok(verified.status === "verified", "verification moves to verified");
  ok(verified.verifiedBy === "owner", "verifier must be recorded — who confirmed the money matters");
  ok(verified.verifiedAt !== null, "verification timestamp must be recorded");

  const active = setStatus(order.referenceCode, "active");
  ok(active.status === "active", "access granted moves to active");
}

// ── 7. ILLEGAL TRANSITIONS ARE REFUSED ──
// These encode real-world facts. A payment cannot be un-verified, and access cannot
// be granted for an order nobody verified.
//
// Each case gets a FRESH order, and every step is guarded. An earlier version reused
// one order and left the follow-up steps unguarded, so when a mutation wrongly
// ALLOWED a transition, the next step threw and killed the script — CI failed with a
// stack trace instead of naming the broken invariant. A gate that cannot explain
// itself sends the next person to read a traceback.
{
  /** Drive an order to a status through legal steps only, guarding each one. */
  const at = (status) => {
    const { order } = createOrder({ ...base, idempotencyKey: key() });
    const ref = order.referenceCode;
    try {
      if (status === "created") return ref;
      if (status === "proof_submitted") { attachProof(ref, "p.jpg"); return ref; }
      if (status === "verified") { markVerified(ref, "owner"); return ref; }
      if (status === "active") { markVerified(ref, "owner"); setStatus(ref, "active"); return ref; }
      if (status === "cancelled") { setStatus(ref, "cancelled"); return ref; }
    } catch (e) {
      fail(`could not set up an order at "${status}" via legal steps: ${e.message}`);
      return null;
    }
    return null;
  };

  const illegal = (from, label, fn) => {
    const ref = at(from);
    if (!ref) return;
    let threw = null;
    try { fn(ref); } catch (e) { threw = e; }
    if (!(threw instanceof OrderError)) {
      fail(`${label} must be REFUSED — it was allowed (order left at "${findByReference(ref)?.status}")`);
      return;
    }
    ok(threw.code === "conflict", `${label} should be a conflict, got "${threw.code}"`);
  };

  illegal("created", "created → active (granting access to an order nobody verified)",
    (ref) => setStatus(ref, "active"));
  illegal("created", "created → refunded (refunding money never confirmed)",
    (ref) => setStatus(ref, "refunded"));
  illegal("verified", "verifying twice",
    (ref) => markVerified(ref, "owner"));
  illegal("verified", "attaching proof after verification",
    (ref) => attachProof(ref, "p.jpg"));
  illegal("cancelled", "reviving a cancelled order",
    (ref) => setStatus(ref, "active"));
  illegal("cancelled", "verifying a cancelled order",
    (ref) => markVerified(ref, "owner"));
  illegal("active", "re-verifying an already-active order",
    (ref) => markVerified(ref, "owner"));

  // And confirm the legal path still works, so the guard above is not just refusing
  // everything.
  ok(at("active") !== null, "the legal created → verified → active path must still work");
}

// ── 7b. Durability SETTINGS are asserted, because power loss is not testable here ──
// `synchronous = OFF` passes every functional test in this file and loses committed
// transactions on power loss. The behaviour cannot be reproduced in a sandbox, so the
// setting itself is the thing under test — otherwise it can be weakened silently.
// Interrogated through the MODULE's own connection, not a fresh probe. `synchronous`
// is a per-connection setting, so opening a second connection to the same file
// reports the default and proves nothing — that was the first version of this check.
{
  const { synchronous, journalMode } = durabilitySettings();
  ok(
    synchronous === 2,
    `PRAGMA synchronous must be FULL (2) on the money ledger, got ${synchronous} — ` +
      `NORMAL (1) or OFF (0) can lose committed orders on power loss`,
  );
  ok(journalMode === "wal", `PRAGMA journal_mode should be wal, got "${journalMode}"`);
}

// ── 8. Unknown references are refused, not silently ignored ──
{
  let threw = null;
  try { markVerified("EEC-2609-ASEG-ZZZZ", "owner"); } catch (e) { threw = e; }
  ok(threw instanceof OrderError && threw.code === "invalid", "verifying a nonexistent order must throw");
  ok(findByReference("EEC-2609-ASEG-ZZZZ") === null, "a nonexistent reference reads as null");
}

// ── 9. Reference code shape ──
{
  ok(isReferenceCode(buildReferenceCode({ tier: "vip", currency: "USD" })), "generated codes must validate");
  ok(!isReferenceCode("EEC-2609-ASEG-0O1I"), "ambiguous glyphs must not validate");
  ok(!isReferenceCode("nonsense"), "junk must not validate");
  ok(!isReferenceCode(""), "empty must not validate");
  ok(!isReferenceCode(null), "null must not validate");
  // No 0/O/1/I/L anywhere in a generated suffix — these get read aloud.
  for (let i = 0; i < 200; i++) {
    const c = buildReferenceCode({ tier: "asas", currency: "EGP" });
    const suffix = c.split("-")[3];
    ok(!/[0O1IL]/.test(suffix), `suffix "${suffix}" contains an ambiguous glyph`);
  }
}

// ── 10. DURABILITY: data survives closing and reopening the database ──
// The whole point of the storage choice. If this fails, nothing else matters.
{
  const { order } = createOrder({ ...base, idempotencyKey: key() });
  const ref = order.referenceCode;
  const before = countByStatus();

  __resetConnectionForTests();

  const after = findByReference(ref);
  ok(after !== null, "an order must survive a reconnect — this is what durable means");
  ok(after?.referenceCode === ref, "the reconnected row must be the same order");
  const counts = countByStatus();
  ok(
    JSON.stringify(counts) === JSON.stringify(before),
    `status counts changed across reconnect: ${JSON.stringify(before)} → ${JSON.stringify(counts)}`,
  );
}

// ── 11. Listing and counting work for the owner queue ──
{
  const all = listOrders({ limit: 500 });
  ok(all.length > 0, "listOrders should return rows");
  ok(
    all.every((o, i) => i === 0 || all[i - 1].createdAt >= o.createdAt),
    "orders must be newest first",
  );
  const verifiedOnly = listOrders({ status: "verified" });
  ok(verifiedOnly.every((o) => o.status === "verified"), "status filter must filter");
  ok(listOrders({ limit: 1 }).length === 1, "limit must be honoured");
}

// ── 9. THE 18+ AFFIRMATION IS ENFORCED IN THE LEDGER, not only in the route ──
// The route can be bypassed: the JSON endpoint exists, and any future caller (an admin
// tool, a bot command, a script) will not think about age. The refusal has to live in the
// function that writes the row, so there is exactly one place it cannot be skipped.
{
  for (const [label, value] of [
    ["omitted", undefined],
    ["false", false],
    ["null", null],
    ["the string \"yes\"", "yes"],   // truthy but not `true` — a form value leaking through
    ["the string \"false\"", "false"],
    ["1", 1],
  ]) {
    let threw = null;
    try {
      createOrder({ ...base, ageConfirmed: value, idempotencyKey: key() });
    } catch (e) { threw = e; }
    if (!(threw instanceof OrderError)) {
      fail(
        `creating an order with ageConfirmed ${label} must be REFUSED — it was allowed. ` +
          `No membership may exist without the 18+ affirmation.`,
      );
      continue;
    }
    ok(threw.code === "invalid", `ageConfirmed ${label} should be "invalid", got "${threw.code}"`);
  }

  // And the affirmation is RECORDED, not merely checked — what matters later is when it
  // was made, not that a boolean was once true.
  const { order } = createOrder({ ...base, idempotencyKey: key() });
  ok(
    typeof order.ageConfirmedAt === "string" && order.ageConfirmedAt.length >= 10,
    `an accepted order must record ageConfirmedAt, got ${JSON.stringify(order.ageConfirmedAt)}`,
  );
}

// ── 10. THE MIGRATION IS TESTED IN A SEPARATE PROCESS ──
// `orders.ts` fixes DATA_DIR/ORDERS_DB at module load, which is right for production and
// means this file cannot repoint the database after importing. Rather than loosen the
// module to suit a test, the migration check runs in its own process with the env pre-set.
// See scripts/check-orders-migration.mjs for what it proves and why nothing else can.
{
  const res = spawnSync(
    process.execPath,
    ["--import", "tsx", join(import.meta.dirname, "check-orders-migration.mjs")],
    { encoding: "utf8", env: { ...process.env, DATA_DIR: undefined, ORDERS_DB: undefined } },
  );
  const out = `${res.stdout ?? ""}${res.stderr ?? ""}`
    .split("\n")
    .filter((l) => l && !/ExperimentalWarning|trace-warnings/.test(l))
    .join("\n");
  if (res.status !== 0) {
    fail(`the schema-migration gate FAILED:\n${out.replace(/^/gm, "      ")}`);
  } else {
    console.log(out.trim());
  }
}

// ── Report ──
rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n✗ ${failures.length} order-ledger failure(s):\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error("");
  process.exit(1);
}
console.log(
  `✓ orders: durable across reconnect, idempotent under retry, server-priced, ` +
    `illegal transitions refused (tested against a real SQLite file).`,
);
