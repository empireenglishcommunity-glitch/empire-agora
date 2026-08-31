import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { isReferenceCode } from "./reference";

/**
 * Payment-proof images.
 *
 * These are FINANCIAL PII. A transfer receipt shows an account name, often a partial
 * account number, and a balance. So:
 *
 *   · they are stored under DATA_DIR, NEVER under `public/`
 *   · the filename is derived server-side, never from the upload
 *   · they are served only through an authenticated owner endpoint
 *
 * Everything under `public/` is world-readable at a guessable URL. That is exactly
 * how this project's Teacher's Edition PDF stayed downloadable after being "moved" —
 * so a receipt must never go near it (requirements R12.2).
 *
 * The spec said R2. That was premised on Cloudflare Pages; from a VPS container the
 * same volume that holds the ledger is simpler and has no external dependency or
 * token. R2 remains a sensible later addition for OFFSITE durability, which is a
 * different problem from access control.
 */

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const PROOF_DIR = join(DATA_DIR, "proofs");

/** 5 MB. A phone screenshot is well under this; anything larger is not a receipt. */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

/**
 * Accepted types, checked by MAGIC BYTES rather than the declared mime type or the
 * filename extension — both are attacker-controlled.
 *
 * HEIC is included because it is what an iPhone produces by default, and telling an
 * Egyptian buyer to convert their screenshot before they can pay is how a sale dies.
 */
const SIGNATURES: Array<{ ext: string; test: (b: Buffer) => boolean }> = [
  { ext: "jpg", test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: "png",
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    ext: "webp",
    test: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString("ascii") === "RIFF" &&
      b.subarray(8, 12).toString("ascii") === "WEBP",
  },
  {
    // ISO-BMFF container with an HEIC/HEIF brand — same family the founder photos use.
    ext: "heic",
    test: (b) =>
      b.length > 12 &&
      b.subarray(4, 8).toString("ascii") === "ftyp" &&
      ["heic", "heix", "hevc", "mif1", "msf1", "heim", "heis"].includes(
        b.subarray(8, 12).toString("ascii"),
      ),
  },
];

export type ProofRejection =
  | "empty"
  | "too_large"
  | "unsupported_type"
  | "bad_reference";

/** Random component appended to a key, in bytes. 8 bytes → 16 hex characters. */
const KEY_NONCE_BYTES = 8;

/**
 * A storage key is `<reference>-<nonce>.<ext>`, and this splits it back apart.
 *
 * The reference half is then validated with `isReferenceCode` rather than by a second
 * regex written out here. An earlier version DID spell the reference format out again
 * (`EEC-\d{4}-[A-Z]{4}-...`), which is a latent outage: the reference alphabet
 * deliberately excludes O/I/L, so the day anyone widens or narrows it, this copy stops
 * matching and `readProof` starts returning null for every real receipt — silently,
 * and only for the owner, who is the one person who cannot be told by a customer.
 */
const KEY_SHAPE = new RegExp(
  `^(.+)-([0-9a-f]{${KEY_NONCE_BYTES * 2}})\\.(jpg|png|webp|heic)$`,
);

/** Split a key, or null if it is not one we could have written. */
export function parseProofKey(key: string): { reference: string; ext: string } | null {
  const m = KEY_SHAPE.exec(key);
  if (!m) return null;
  // `isReferenceCode` is anchored and restricted to an alphabet with no separators or
  // dots, so a reference that passes it can never contain a path traversal.
  if (!isReferenceCode(m[1])) return null;
  return { reference: m[1], ext: m[3] };
}

export function detectExtension(bytes: Buffer): string | null {
  for (const sig of SIGNATURES) {
    if (sig.test(bytes)) return sig.ext;
  }
  return null;
}

/**
 * Validate and store a proof. Returns the storage key, never a path the caller
 * could turn into a URL.
 */
export function storeProof(
  referenceCode: string,
  bytes: Buffer,
): { ok: true; key: string } | { ok: false; reason: ProofRejection } {
  // Checked here as well as by the caller. This value becomes part of a FILENAME, so
  // it is the one place a bad string turns into a write outside the proofs directory —
  // defence in depth is cheap and the failure mode is not.
  if (!isReferenceCode(referenceCode)) return { ok: false, reason: "bad_reference" };

  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_PROOF_BYTES) return { ok: false, reason: "too_large" };

  const ext = detectExtension(bytes);
  if (!ext) return { ok: false, reason: "unsupported_type" };

  mkdirSync(PROOF_DIR, { recursive: true });

  // Name derived entirely server-side. A user-supplied filename is a path-traversal
  // and an overwrite vector; the random component also stops a second upload for the
  // same order from clobbering the first, so a re-upload never destroys evidence.
  const key = `${referenceCode}-${randomBytes(KEY_NONCE_BYTES).toString("hex")}.${ext}`;
  writeFileSync(join(PROOF_DIR, key), bytes, { mode: 0o600 });

  return { ok: true, key };
}

/** Read a stored proof for the owner endpoint. Key is validated, never trusted. */
export function readProof(key: string): { bytes: Buffer; ext: string } | null {
  const parsed = parseProofKey(key);
  if (!parsed) return null;

  const path = join(PROOF_DIR, key);
  if (!existsSync(path) || !statSync(path).isFile()) return null;
  return { bytes: readFileSync(path), ext: parsed.ext };
}

export const PROOF_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};
