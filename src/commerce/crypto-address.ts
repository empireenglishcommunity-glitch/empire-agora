import { createHash } from "node:crypto";

/**
 * Base58check validation for a TRON (TRC20) address.
 *
 * WHY THIS EXISTS
 * ---------------
 * A crypto transfer is **irreversible**. There is no chargeback, no support ticket and no
 * bank to call: a single wrong character in the destination address means the money is gone
 * permanently, and the person who loses it is a student who was trying to pay for lessons.
 *
 * `RAIL_CRYPTO` is typed into a `.env` file by a human, often copied off a phone screen or a
 * QR code. Every other rail tolerates a typo — a wrong PayPal address bounces, a wrong IBAN
 * is rejected by the bank, a wrong wallet number just fails. **Only this one silently
 * succeeds into a void.**
 *
 * TRON addresses carry a 4-byte double-SHA256 checksum, so a transcription error is
 * detectable *without* asking anyone to proofread 34 characters. That is strictly better
 * than human verification: it catches exactly the errors a human eye slides over
 * (`l`/`1`, `n`/`m`, `O`/`0`), and it never gets tired.
 *
 * So the address is verified at BOOT, not in CI: CI does not have the real value, and the
 * only moment that matters is when the process that will show it to a buyer starts up.
 *
 * This address was itself transcribed from an image during setup, and this check is what
 * established the transcription was right.
 */

/** Bitcoin/TRON base58 alphabet. Deliberately excludes `0`, `O`, `I` and `l`. */
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** TRON mainnet address prefix byte. `0x41` renders as a leading `T` in base58. */
const TRON_MAINNET_PREFIX = 0x41;

function base58Decode(input: string): Buffer | null {
  let num = 0n;
  for (const ch of input) {
    const index = BASE58.indexOf(ch);
    if (index === -1) return null; // not base58 at all
    num = num * 58n + BigInt(index);
  }
  let hex = num.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const body = Buffer.from(hex, "hex");

  // Leading '1' characters encode leading zero bytes.
  let leadingZeros = 0;
  for (const ch of input) {
    if (ch !== "1") break;
    leadingZeros++;
  }
  return Buffer.concat([Buffer.alloc(leadingZeros), body]);
}

export type CryptoAddressVerdict =
  | { ok: true; kind: "tron" }
  /** Not recognised as an address we know how to check — NOT the same as invalid. */
  | { ok: true; kind: "unverified"; reason: string }
  | { ok: false; reason: string };

/**
 * Verify a TRON address if that is what this looks like.
 *
 * A string we cannot classify returns `unverified` rather than `false`, deliberately: this
 * must not block a Bitcoin or Ethereum address someone configures later. Silence about an
 * unknown format is honest; refusing it would be a lie about what was checked.
 */
export function verifyCryptoAddress(raw: string): CryptoAddressVerdict {
  // The configured value may carry a network label, e.g. "USDT · TRC20 · T...". Pull out
  // anything that is shaped like a TRON address rather than demanding a bare address.
  const candidate = raw.match(/\bT[1-9A-HJ-NP-Za-km-z]{33}\b/)?.[0];
  if (!candidate) {
    return {
      ok: true,
      kind: "unverified",
      reason: "no TRON-shaped address found; not checked",
    };
  }

  const decoded = base58Decode(candidate);
  if (!decoded) return { ok: false, reason: `"${candidate}" contains non-base58 characters` };
  if (decoded.length !== 25) {
    return { ok: false, reason: `"${candidate}" decodes to ${decoded.length} bytes, expected 25` };
  }

  const body = decoded.subarray(0, 21);
  const checksum = decoded.subarray(21);

  if (body[0] !== TRON_MAINNET_PREFIX) {
    return {
      ok: false,
      reason: `"${candidate}" has prefix byte 0x${body[0].toString(16)}, expected 0x41 (TRON mainnet)`,
    };
  }

  const expected = createHash("sha256")
    .update(createHash("sha256").update(body).digest())
    .digest()
    .subarray(0, 4);

  if (!checksum.equals(expected)) {
    return {
      ok: false,
      reason:
        `"${candidate}" FAILS its base58check checksum (found ${checksum.toString("hex")}, ` +
        `expected ${expected.toString("hex")}). This is almost certainly a transcription ` +
        `error — do not publish it, funds sent there are unrecoverable.`,
    };
  }

  return { ok: true, kind: "tron" };
}
