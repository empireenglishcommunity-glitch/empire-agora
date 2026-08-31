import type { Currency, TierId, Term } from "./pricing";

/**
 * Order reference codes.
 *
 * WHY THESE EXIST AT ALL
 * ----------------------
 * Every payment rail here is manual. A Vodafone Cash or InstaPay transfer arrives
 * with a name and an amount and no order context whatsoever. Without a code the
 * owner has to match "someone called Mohamed sent 500" against a list of people
 * called Mohamed — which is unsolvable past a handful of members, and silently
 * wrong before that.
 *
 * The code is quoted by the buyer when they pay, so reconciliation becomes lookup
 * instead of detective work.
 *
 * FORMAT: EEC-YYMM-<TIER><CUR>-<RANDOM4>      e.g. EEC-2609-ASEG-7K3Q
 *
 * The month and tier are embedded deliberately: the owner can eyeball a code
 * against an SMS notification and know roughly what it should be worth, without
 * opening anything. That has caught mis-typed amounts in similar systems.
 */

/**
 * No 0/O/1/I/L. These codes get read aloud over a phone, typed into a WhatsApp
 * message, and copied by hand off a screen — an ambiguous glyph in a payment
 * reference is a support conversation.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RANDOM_LEN = 4;

const TIER_ABBREV: Record<TierId, string> = {
  darb: "DA",
  asas: "AS",
  tarkeez: "TA",
  vip: "VI",
  nukhba: "NU",
};

const CURRENCY_ABBREV: Record<Currency, string> = {
  EGP: "EG",
  USD: "US",
};

function randomSuffix(length = RANDOM_LEN): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function buildReferenceCode(input: {
  tier: TierId;
  currency: Currency;
  at?: Date;
}): string {
  const at = input.at ?? new Date();
  const yy = String(at.getUTCFullYear()).slice(-2);
  const mm = String(at.getUTCMonth() + 1).padStart(2, "0");
  const tier = TIER_ABBREV[input.tier];
  const cur = CURRENCY_ABBREV[input.currency];
  return `EEC-${yy}${mm}-${tier}${cur}-${randomSuffix()}`;
}

const REFERENCE_PATTERN = new RegExp(
  `^EEC-\\d{4}-(${Object.values(TIER_ABBREV).join("|")})(${Object.values(
    CURRENCY_ABBREV,
  ).join("|")})-[${ALPHABET}]{${RANDOM_LEN}}$`,
);

/**
 * Validate a reference code's SHAPE only.
 *
 * A well-formed code is not a valid order — that requires a database lookup. This
 * exists so a malformed path parameter is rejected before it reaches a query, not
 * as any kind of authorisation.
 */
export function isReferenceCode(value: unknown): value is string {
  return typeof value === "string" && REFERENCE_PATTERN.test(value);
}

/** Human-friendly grouping for display. Never used for storage or comparison. */
export function formatReferenceForDisplay(code: string): string {
  return code;
}

export type { Currency, TierId, Term };
