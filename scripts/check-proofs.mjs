#!/usr/bin/env node
/**
 * Payment-receipt storage and owner-authentication gate. FAILS THE BUILD.
 *
 *   npx tsx scripts/check-proofs.mjs
 *
 * WHY THESE TWO THINGS SHARE A GATE
 * ---------------------------------
 * They are the same risk from two sides. A payment receipt shows an account name, often
 * a partial account number, and a balance — it is financial PII belonging to a student.
 * `proofs.ts` decides where those bytes land; `lib/admin.ts` decides who may read them
 * back. A hole in either one exposes the same file.
 *
 * WHAT IS ACTUALLY UNDER TEST
 * ---------------------------
 * Not "does the happy path work" — that is the easy half and it is checked here only so
 * the refusals below cannot pass by refusing everything. The real subjects are:
 *
 *   1. **Type detection by magic bytes**, because both the declared mime type and the
 *      filename extension are attacker-controlled. A `.jpg` containing HTML is the
 *      classic stored-XSS delivery, and this endpoint serves what it stored.
 *   2. **Key validation**, because the key travels in a URL. Every traversal shape is
 *      asserted individually rather than trusting one regex to be right.
 *   3. **The location itself.** Everything under `public/` is world-readable at a
 *      guessable URL. This project has already had a Teacher's Edition PDF stay
 *      downloadable after being "moved", so the path is asserted, not assumed.
 *   4. **That the admin guard fails CLOSED.** This is the single most important
 *      assertion in the file, and it is a MUTATION test: with `ADMIN_TOKEN` unset,
 *      every caller must be refused. The naive guard — `cookie === process.env.TOKEN` —
 *      lets the entire internet in when both sides are `undefined`, and an unset
 *      variable is the most likely production misconfiguration there is.
 *
 * Spec: requirements.md R5.5, R12.2, R12.6.
 */

import { mkdtempSync, rmSync, existsSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "agora-proofs-"));
process.env.DATA_DIR = dir;
process.env.ORDERS_DB = join(dir, "orders.db");

// Set BEFORE importing anything that reads it, so the configured-token cases are real.
process.env.ADMIN_TOKEN = "0123456789abcdef0123456789abcdef";

const { storeProof, readProof, detectExtension, parseProofKey, MAX_PROOF_BYTES, PROOF_MIME } =
  await import("../src/commerce/proofs.ts");
const { isValidAdminToken, adminTokenConfigured, ADMIN_COOKIE } =
  await import("../src/lib/admin.ts");
const { buildReferenceCode } = await import("../src/commerce/reference.ts");

const failures = [];
const fail = (m) => failures.push(m);
const ok = (cond, m) => { if (!cond) fail(m); };

/**
 * Call a function under test and never let it kill the run.
 *
 * A gate that dies with a stack trace has told the next person nothing about which
 * invariant broke. Every one of these functions is *supposed* to refuse bad input by
 * returning a value, so a throw is itself a finding and is reported as one.
 *
 * This is not defensive padding: while mutation-testing this file, weakening
 * `storeProof`'s reference check and `adminTokenConfigured` both produced raw `ENOENT`
 * and `Buffer.from(undefined)` crashes rather than named failures.
 */
const attempt = (label, fn, fallback = undefined) => {
  try {
    return fn();
  } catch (e) {
    fail(`${label} THREW instead of returning a refusal: ${e.message}`);
    return fallback;
  }
};

const REF = buildReferenceCode({ tier: "asas", currency: "EGP" });

// ---------------------------------------------------------------------------
// Fixtures — the smallest byte sequences that are genuinely each format's header
// ---------------------------------------------------------------------------

const pad = (head, size = 64) => {
  const b = Buffer.alloc(size);
  Buffer.from(head).copy(b);
  return b;
};

const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = (() => {
  const b = Buffer.alloc(64);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  return b;
})();
const HEIC = (() => {
  const b = Buffer.alloc(64);
  b.write("ftyp", 4, "ascii");
  b.write("heic", 8, "ascii");
  return b;
})();

// ---------------------------------------------------------------------------
// 1. Real image headers are accepted — so the refusals below mean something
// ---------------------------------------------------------------------------
{
  const cases = [["jpg", JPEG], ["png", PNG], ["webp", WEBP], ["heic", HEIC]];
  for (const [ext, bytes] of cases) {
    ok(detectExtension(bytes) === ext, `${ext} header must be detected as "${ext}", got "${detectExtension(bytes)}"`);
    const r = storeProof(REF, bytes);
    ok(r.ok === true, `storing a valid ${ext} must succeed, got ${JSON.stringify(r)}`);
    if (r.ok) {
      ok(r.key.endsWith(`.${ext}`), `stored key must carry the DETECTED extension .${ext}, got "${r.key}"`);
      ok(PROOF_MIME[ext] !== undefined, `no mime type mapped for detected extension "${ext}"`);
      const back = readProof(r.key);
      ok(back !== null, `a proof just stored must be readable back (${ext})`);
      ok(back?.bytes.equals(bytes), `bytes must round-trip unchanged (${ext})`);
    }
  }

  // HEIC specifically, because it is what an iPhone produces by default and refusing it
  // means telling an Egyptian buyer to convert a screenshot before they can pay.
  ok(detectExtension(HEIC) === "heic", "HEIC must be accepted — it is the iPhone default");
}

// ---------------------------------------------------------------------------
// 2. NOT-an-image is refused, however it is dressed up
// ---------------------------------------------------------------------------
{
  const rejects = [
    ["plain text", Buffer.from("this is not an image, it is a note about money")],
    ["HTML", Buffer.from("<html><script>alert(1)</script></html>")],
    // SVG is an image to a browser and an EXECUTION context: it can carry <script>.
    // It is deliberately absent from the signature list, and that must stay true.
    ["SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
    ["PDF", Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n")],
    ["ZIP / office doc", Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])],
    ["ELF binary", Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0])],
    ["shell script", Buffer.from("#!/bin/sh\nrm -rf /\n")],
    // One byte short of the PNG signature. Truncated-header handling is where a
    // hand-written magic-byte check normally reads past the end of the buffer.
    ["truncated PNG", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a])],
    ["RIFF that is not WEBP (a .wav)", (() => {
      const b = Buffer.alloc(64);
      b.write("RIFF", 0, "ascii");
      b.write("WAVE", 8, "ascii");
      return b;
    })()],
    ["ISO-BMFF that is not HEIC (an .mp4)", (() => {
      const b = Buffer.alloc(64);
      b.write("ftyp", 4, "ascii");
      b.write("mp42", 8, "ascii");
      return b;
    })()],
  ];

  for (const [label, bytes] of rejects) {
    ok(detectExtension(bytes) === null, `${label} must NOT be detected as an image type`);
    const r = storeProof(REF, bytes);
    ok(r.ok === false, `storing ${label} must be refused`);
    ok(r.ok === false && r.reason === "unsupported_type",
      `${label} should be refused as "unsupported_type", got "${r.ok === false ? r.reason : "accepted"}"`);
  }

  // A JPEG header with HTML in the body is STILL a jpeg by magic bytes, and that is
  // correct — the defence against it is the `Content-Type` and `Content-Disposition`
  // the read endpoint sends, not the type sniffer. Recorded so nobody "fixes" this
  // into a content scanner it was never meant to be.
  const polyglot = Buffer.concat([JPEG.subarray(0, 4), Buffer.from("<script>alert(1)</script>")]);
  ok(detectExtension(polyglot) === "jpg",
    "a JPEG-headed polyglot is still typed as jpg — it is served with an explicit image " +
    "Content-Type, which is what neutralises it");
}

// ---------------------------------------------------------------------------
// 3. Size limits
// ---------------------------------------------------------------------------
{
  const empty = storeProof(REF, Buffer.alloc(0));
  ok(empty.ok === false && empty.reason === "empty", "a zero-byte upload must be refused as empty");

  const huge = Buffer.alloc(MAX_PROOF_BYTES + 1);
  JPEG.copy(huge); // a valid header, so size is the ONLY reason it can fail
  const big = storeProof(REF, huge);
  ok(big.ok === false && big.reason === "too_large",
    `${MAX_PROOF_BYTES + 1} bytes must be refused as too_large, got "${big.ok === false ? big.reason : "accepted"}"`);

  const atLimit = Buffer.alloc(MAX_PROOF_BYTES);
  JPEG.copy(atLimit);
  ok(storeProof(REF, atLimit).ok === true, "exactly MAX_PROOF_BYTES must be ACCEPTED — the limit is inclusive");
}

// ---------------------------------------------------------------------------
// 4. The reference code becomes part of a FILENAME, so it is validated
// ---------------------------------------------------------------------------
{
  const bad = [
    ["traversal", "../../../../etc/cron.d/x"],
    ["absolute path", "/etc/passwd"],
    ["separator", "EEC-2609-ASEG/7K3Q"],
    ["backslash", "EEC-2609-ASEG\\7K3Q"],
    ["null byte", "EEC-2609-ASEG-7K3Q\u0000.png"],
    ["dot segment", "EEC-2609-ASEG-..7K"],
    ["empty", ""],
    ["wrong shape", "hello"],
    // Excluded from the reference alphabet on purpose: O/I/L are misread when a code is
    // spoken over the phone or copied by hand.
    ["ambiguous glyph O", "EEC-2609-ASEG-OOOO"],
    ["ambiguous glyph l", "EEC-2609-ASEG-llll"],
  ];
  for (const [label, ref] of bad) {
    const r = attempt(`storeProof with a ${label} reference`, () => storeProof(ref, JPEG));
    ok(r?.ok === false, `storeProof must refuse a ${label} reference ("${ref}")`);
    ok(r?.ok === false && r.reason === "bad_reference",
      `a ${label} reference should be refused as "bad_reference", got "${r?.ok === false ? r.reason : "accepted"}"`);
  }
}

// ---------------------------------------------------------------------------
// 5. readProof key validation — every traversal shape, asserted individually
// ---------------------------------------------------------------------------
{
  const stored = storeProof(REF, PNG);
  ok(stored.ok === true, "fixture proof must store");
  const goodKey = stored.ok ? stored.key : "";

  ok(readProof(goodKey) !== null, "a well-formed key for an existing file must read");
  ok(parseProofKey(goodKey)?.reference === REF, "parseProofKey must recover the reference code");

  /**
   * Files OUTSIDE the proofs directory that a traversal key would REACH IF the
   * validation were removed.
   *
   * This detail is the whole test. The first version of this block only used traversal
   * keys pointing at paths that did not exist, so `existsSync` returned false and
   * `readProof` returned null **for the wrong reason** — deleting the `isReferenceCode`
   * check entirely still passed. A traversal test whose target does not exist proves
   * nothing about traversal.
   *
   * So: one plain decoy, and one planted at exactly the name a `../` key would resolve
   * to while still satisfying the key's shape.
   */
  const secret = join(dir, "orders.db");
  writeFileSync(secret, "pretend ledger");

  const escapedName = `${REF}-0123456789abcdef.jpg`;
  const escapedTarget = join(dir, escapedName); // one level ABOVE DATA_DIR/proofs
  writeFileSync(escapedTarget, "PRIVATE — must never be reachable through readProof");

  const badKeys = [
    // The discriminating case: correct shape, real file at the resolved path, and the
    // ONLY thing standing between a caller and those bytes is reference validation.
    ["traversal to a file that EXISTS", `../${escapedName}`],
    ["parent traversal", `../orders.db`],
    ["deep traversal", `../../../../etc/passwd`],
    ["traversal wearing a valid suffix", `../orders.db-0123456789abcdef.jpg`],
    ["traversal inside the reference half", `../${REF}-0123456789abcdef.jpg`],
    ["absolute path", `/etc/passwd`],
    ["absolute path with valid suffix", `/etc/passwd-0123456789abcdef.jpg`],
    ["backslash traversal", `..\\orders.db`],
    ["URL-encoded traversal", `..%2Forders.db`],
    ["double-encoded traversal", `..%252Forders.db`],
    ["null byte truncation", `${REF}-0123456789abcdef.jpg\u0000.txt`],
    ["nested path", `sub/${REF}-0123456789abcdef.jpg`],
    ["no extension", `${REF}-0123456789abcdef`],
    ["disallowed extension", `${REF}-0123456789abcdef.svg`],
    ["executable extension", `${REF}-0123456789abcdef.php`],
    ["double extension", `${REF}-0123456789abcdef.jpg.php`],
    ["nonce too short", `${REF}-0123456789abcde.jpg`],
    ["nonce too long", `${REF}-0123456789abcdef0.jpg`],
    ["nonce not hex", `${REF}-zzzzzzzzzzzzzzzz.jpg`],
    ["malformed reference half", `NOPE-0000-XXXX-0000-0123456789abcdef.jpg`],
    ["empty", ``],
    ["just a dot", `.`],
    ["just dots", `..`],
  ];

  for (const [label, key] of badKeys) {
    const result = attempt(`readProof with a ${label} key`, () => readProof(key), null);
    ok(result === null, `readProof must refuse a ${label} key ("${key}")`);
    // Stronger than "returned null": assert it did not hand back the escaped bytes.
    ok(
      result === null || !result.bytes.toString("utf8").includes("must never be reachable"),
      `readProof LEAKED a file outside the proofs directory via a ${label} key ("${key}")`,
    );
  }

  // Both decoys must still be sitting there, byte-intact — nothing above reached them.
  ok(readFileSync(secret, "utf8") === "pretend ledger", "the out-of-directory file must be untouched");
  ok(
    readFileSync(escapedTarget, "utf8").startsWith("PRIVATE"),
    "the planted traversal target must be untouched",
  );
}

// ---------------------------------------------------------------------------
// 6. WHERE the bytes land, and with what permissions
// ---------------------------------------------------------------------------
{
  const stored = storeProof(REF, JPEG);
  ok(stored.ok === true, "fixture must store");
  if (stored.ok) {
    const path = join(dir, "proofs", stored.key);
    ok(existsSync(path), `a stored proof must exist at DATA_DIR/proofs (${path})`);

    const abs = resolve(path);
    ok(abs.startsWith(resolve(dir) + sep), "a stored proof must resolve INSIDE DATA_DIR");

    // The load-bearing one. Everything under public/ is world-readable at a guessable
    // URL; this project has already shipped that mistake once with a PDF.
    ok(!abs.includes(`${sep}public${sep}`),
      `a receipt must NEVER be stored under public/ — it is financial PII (${abs})`);

    const mode = statSync(path).mode & 0o777;
    ok(mode === 0o600, `a receipt must be mode 0600, got 0${mode.toString(8)}`);
  }

  // The repository's own public/ directory must never accumulate receipts, whatever a
  // future refactor does to DATA_DIR.
  const publicDir = resolve(process.cwd(), "public");
  if (existsSync(publicDir)) {
    ok(!existsSync(join(publicDir, "proofs")), "public/proofs must not exist");
  }
}

// ---------------------------------------------------------------------------
// 7. A second upload never destroys the first — re-uploading is evidence, not edit
// ---------------------------------------------------------------------------
// Deliberately the SAME format twice, with different bytes. An earlier version used a
// jpg and a png, whose keys differ by extension alone — so removing the random nonce
// from the key entirely still passed, while the second upload silently overwrote the
// first on disk. Same extension is the only arrangement that actually tests the nonce.
{
  const first = pad([0xff, 0xd8, 0xff, 0xe0, 0xaa, 0xaa]);
  const second = pad([0xff, 0xd8, 0xff, 0xe0, 0xbb, 0xbb]);

  const a = storeProof(REF, first);
  const b = storeProof(REF, second);
  ok(a.ok && b.ok, "two uploads for one order must both store");

  if (a.ok && b.ok) {
    ok(a.key !== b.key,
      "two uploads of the same format for one order must get DIFFERENT keys — otherwise " +
      "re-uploading a receipt destroys the first one, and receipts are payment evidence");

    const backA = readProof(a.key);
    const backB = readProof(b.key);
    ok(backA !== null && backB !== null, "both uploads must remain readable");
    ok(backA?.bytes.equals(first),
      "the FIRST receipt's bytes must survive a second upload — evidence is append-only here");
    ok(backB?.bytes.equals(second), "the second receipt must hold its own bytes");
  }
}

// ---------------------------------------------------------------------------
// 8. THE ADMIN GUARD MUST FAIL CLOSED — a mutation test
// ---------------------------------------------------------------------------
// The most important block in this file. `lib/admin.ts` is *written* to fail closed and
// says so in a comment; a comment is not a test. Each case below breaks the
// configuration and asserts that the answer is still "no".
{
  const CORRECT = "0123456789abcdef0123456789abcdef";

  // Baseline: with a real token configured, the right value works and nothing else does.
  process.env.ADMIN_TOKEN = CORRECT;
  ok(attempt("adminTokenConfigured (32-char)", adminTokenConfigured) === true, "a 32-char token must count as configured");
  ok(attempt("isValidAdminToken (correct)", () => isValidAdminToken(CORRECT)) === true,
    "the correct token must be accepted — otherwise the refusals below are vacuous");

  for (const [label, supplied] of [
    ["wrong token", "ffffffffffffffffffffffffffffffff"],
    ["empty string", ""],
    ["undefined", undefined],
    ["null", null],
    ["correct token with trailing space", `${CORRECT} `],
    ["correct token with leading space", ` ${CORRECT}`],
    ["a prefix of the correct token", CORRECT.slice(0, 16)],
    ["the correct token plus a character", `${CORRECT}x`],
    ["uppercased correct token", CORRECT.toUpperCase()],
    ["literal 'undefined'", "undefined"],
    ["literal 'true'", "true"],
  ]) {
    ok(attempt(`isValidAdminToken(${label})`, () => isValidAdminToken(supplied), true) === false,
      `a ${label} must be REFUSED`);
  }

  // ── The mutation that matters ──
  // An unset ADMIN_TOKEN is the most likely production misconfiguration. The naive
  // guard `cookie === process.env.ADMIN_TOKEN` returns TRUE for a request with no
  // cookie when the variable is unset, because `undefined === undefined`. That opens
  // the order queue — names, phone numbers and receipts — to the whole internet.
  const mutations = [
    ["unset", () => { delete process.env.ADMIN_TOKEN; }],
    ["empty", () => { process.env.ADMIN_TOKEN = ""; }],
    ["whitespace only", () => { process.env.ADMIN_TOKEN = "     "; }],
    ["too short to be a secret", () => { process.env.ADMIN_TOKEN = "hunter2"; }],
    ["exactly 15 characters", () => { process.env.ADMIN_TOKEN = "a".repeat(15); }],
  ];

  for (const [label, mutate] of mutations) {
    mutate();
    ok(
      attempt(`adminTokenConfigured (${label})`, adminTokenConfigured, true) === false,
      `an ${label} ADMIN_TOKEN must NOT count as configured`,
    );
    for (const supplied of [undefined, null, "", "anything", process.env.ADMIN_TOKEN]) {
      // `fallback: true` so a THROWING guard is recorded as "let them in" — the
      // pessimistic reading. A guard that crashes has not refused anyone.
      ok(
        attempt(`isValidAdminToken with an ${label} token`, () => isValidAdminToken(supplied), true) === false,
        `with an ${label} ADMIN_TOKEN, supplying ${JSON.stringify(supplied)} must be REFUSED — ` +
          `an unconfigured guard must lock EVERYONE OUT, never let everyone in`,
      );
    }
  }

  // 16 characters is the documented minimum, so it must actually work.
  process.env.ADMIN_TOKEN = "a".repeat(16);
  ok(attempt("adminTokenConfigured (16-char)", adminTokenConfigured) === true,
    "16 characters is the documented minimum and must be accepted");
  ok(attempt("isValidAdminToken (16-char)", () => isValidAdminToken("a".repeat(16))) === true,
    "the 16-char boundary token must authenticate");
  ok(attempt("isValidAdminToken (15-char guess)", () => isValidAdminToken("a".repeat(15)), true) === false,
    "a 15-char guess must not authenticate");

  process.env.ADMIN_TOKEN = CORRECT;
  ok(typeof ADMIN_COOKIE === "string" && ADMIN_COOKIE.length > 0, "the admin cookie must have a name");
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
rmSync(dir, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n✗ ${failures.length} failure(s) in receipt storage / owner auth:\n`);
  for (const f of failures) console.error(`  • ${f}`);
  console.error();
  process.exit(1);
}

console.log(
  "✓ proofs: typed by magic bytes (10 non-image shapes refused, SVG among them), " +
    "22 traversal keys refused, stored 0600 outside public/, re-upload preserves evidence.\n" +
    "✓ admin: fails CLOSED — 5 broken token configurations each lock every caller out.",
);
