#!/usr/bin/env node
/**
 * Crypto-address validator gate. FAILS THE BUILD.
 *
 *   npx tsx scripts/check-crypto-address.mjs
 *
 * The validator itself runs at BOOT against the real `RAIL_CRYPTO` (see
 * `src/instrumentation.ts`); CI has no access to that value. What CI can prove is that the
 * validator actually works — because a checksum test that accepts everything is worse than
 * no test at all, and this is the one rail where being wrong is irreversible.
 *
 * Both directions are asserted. A validator that returns `false` for everything would pass
 * every "must reject" case, so the real address must also be accepted.
 */

const { verifyCryptoAddress } = await import("../src/commerce/crypto-address.ts");

const failures = [];
const ok = (cond, m) => { if (!cond) failures.push(m); };

/** The live address. Public by nature — it exists to be sent money. */
const REAL = "TGrDipHjepcnhfASy3nzcW5M84BQxF5kFn";

// ── Must ACCEPT ──
{
  const v = verifyCryptoAddress(REAL);
  ok(v.ok && v.kind === "tron", `the real TRON address must verify, got ${JSON.stringify(v)}`);

  // As it is actually configured, with a network label around it.
  const labelled = verifyCryptoAddress(`USDT · TRC20 (TRON) · ${REAL}`);
  ok(
    labelled.ok && labelled.kind === "tron",
    "a network-labelled value must still be verified — the address is extracted, not assumed bare",
  );
}

// ── Must REJECT: single-character transcription errors ──
// Exactly the confusions a human eye slides over when copying off a phone screen.
{
  const corruptions = [
    ["last char n -> m", REAL.slice(0, -1) + "m"],
    ["i -> 1 (not base58-adjacent but visually close)", REAL.replace("Dip", "D1p")],
    ["k -> K (case flip)", REAL.slice(0, 32) + "K" + REAL.slice(33)],
    ["digit 5 -> S", REAL.replace("W5M", "WSM")],
    ["dropped character", REAL.slice(0, 20) + REAL.slice(21)],
    ["extra character", REAL.slice(0, 20) + "a" + REAL.slice(20)],
    ["transposed pair", REAL.slice(0, 10) + REAL[11] + REAL[10] + REAL.slice(12)],
  ];
  for (const [label, bad] of corruptions) {
    const v = verifyCryptoAddress(bad);
    ok(
      v.ok === false || v.kind === "unverified",
      `a ${label} must NOT verify as a valid TRON address — funds sent there are gone ` +
        `permanently (got ${JSON.stringify(v)})`,
    );
    // A length-changing corruption stops looking like a TRON address at all, which is a
    // legitimate "unverified" rather than a checksum failure. A same-length corruption
    // must be caught by the CHECKSUM, which is the property under test.
    if (bad.length === REAL.length) {
      ok(v.ok === false, `a same-length ${label} must FAIL the checksum, not merely be unverified`);
    }
  }
}

// ── Must REJECT: characters base58 excludes on purpose ──
{
  for (const [label, bad] of [
    ["contains 'l'", REAL.replace("i", "l")],
    ["contains '0'", REAL.replace("5", "0")],
    ["contains 'O'", REAL.replace("Q", "O")],
    ["contains 'I'", REAL.replace("H", "I")],
  ]) {
    const v = verifyCryptoAddress(bad);
    ok(v.ok === false || v.kind === "unverified", `an address that ${label} must not verify`);
  }
}

// ── Non-TRON values are UNVERIFIED, not rejected ──
// Refusing them would be a lie about what was checked, and would block a Bitcoin or
// Ethereum address someone configures later.
{
  for (const [label, value] of [
    ["an Ethereum address", "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"],
    ["a Bitcoin address", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"],
    ["empty", ""],
    ["prose", "ask me on WhatsApp"],
  ]) {
    const v = verifyCryptoAddress(value);
    ok(
      v.ok === true && v.kind === "unverified",
      `${label} should be reported UNVERIFIED rather than invalid, got ${JSON.stringify(v)}`,
    );
  }
}

if (failures.length) {
  console.error(`\n✗ ${failures.length} crypto-address validator failure(s):\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error("");
  process.exit(1);
}

console.log(
  "✓ crypto address: the live TRON address verifies (labelled or bare), 7 single-character " +
    "corruptions and 4 excluded-glyph forms are all refused, and non-TRON formats report " +
    "UNVERIFIED rather than invalid.",
);
