import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildReferenceCode } from "./reference";
import { priceFor, getTier, type Currency, type TierId, type Term } from "./pricing";

/**
 * The order ledger.
 *
 * WHY SQLITE, AND WHY NOT WHAT THE SPEC SAID
 * ------------------------------------------
 * `design.md` specified Cloudflare D1 for orders and R2 for proof images. That was
 * premised on deploying to Cloudflare Pages. We are not: the page is dynamic, so it
 * runs as a Node server in Docker on the VPS (see DEPLOY.md §0). From there, D1 and
 * R2 would mean putting an external API call, a network dependency and an API token
 * on the money path — to store a few hundred rows a year.
 *
 * `node:sqlite` is built into Node 22 (verified unflagged in node:22-alpine), so this
 * adds ZERO dependencies and no native build step. It gives real transactions and a
 * real fsync, which is what "durable" has to mean here. The bot already runs on
 * SQLite, so the operational knowledge and the backup habit already exist.
 *
 * WHAT THIS FILE REFUSES TO DO
 * ----------------------------
 * It never swallows a write failure. `EEC-MATERIAL`'s waitlist endpoint appends a
 * lead best-effort and returns `{ok:true}` even when the write threw — acceptable for
 * a lead, disqualifying for an order. A caller here either gets a committed row or an
 * exception. There is no third outcome.
 *
 * Spec: requirements.md R5.2, R5.3, R5.4, R6.1, R6.7.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Rail =
  | "vodafone_cash"
  | "instapay"
  | "paypal"
  | "crypto"
  | "bank_transfer";

/**
 * `created` → the buyer has an order and payment instructions, nothing has arrived.
 * `proof_submitted` → they say they paid and gave us an image.
 * `verified` → a HUMAN confirmed the money landed.
 * `active` → access has been granted.
 * `cancelled` / `refunded` → terminal.
 *
 * `verified` and `active` are separate on purpose. Confirming money and granting
 * access are two different acts, done at different moments, and collapsing them
 * would hide which one failed.
 */
export type OrderStatus =
  | "created"
  | "proof_submitted"
  | "verified"
  | "active"
  | "cancelled"
  | "refunded";

export interface NewOrder {
  locale: string;
  currency: Currency;
  tier: TierId;
  term: Term;
  rail: Rail;
  name: string;
  /** WhatsApp or equivalent — the channel the owner will actually use. */
  contact: string;
  email?: string | null;
  country?: string | null;
  discord?: string | null;
  source?: string | null;
  /** Client-generated. The same key must never create a second order. */
  idempotencyKey: string;
}

export interface Order {
  id: number;
  referenceCode: string;
  createdAt: string;
  locale: string;
  currency: Currency;
  tier: TierId;
  term: Term;
  /**
   * Minor units — piastres or cents. Integers only.
   *
   * Money is never stored as a float. Every price in `pricing.ts` is a whole unit
   * today, so this could have been a plain integer; it is minor units anyway because
   * the first non-integer price would otherwise introduce rounding into the ledger,
   * and that class of bug is discovered by a customer.
   */
  amountMinor: number;
  rail: Rail;
  name: string;
  contact: string;
  email: string | null;
  country: string | null;
  discord: string | null;
  status: OrderStatus;
  proofKey: string | null;
  proofUploadedAt: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  source: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.DATA_DIR ?? "/data";
const DB_FILE = process.env.ORDERS_DB ?? join(DATA_DIR, "orders.db");

let db: DatabaseSync | null = null;

function connect(): DatabaseSync {
  if (db) return db;

  mkdirSync(DATA_DIR, { recursive: true });
  const handle = new DatabaseSync(DB_FILE);

  // WAL so a reader never blocks the writer. `synchronous = FULL` because this is
  // money: NORMAL can lose the last transactions on power loss, and "we lost the
  // order but the customer paid" is the worst outcome this system can produce.
  handle.exec("PRAGMA journal_mode = WAL");
  handle.exec("PRAGMA synchronous = FULL");
  handle.exec("PRAGMA foreign_keys = ON");
  // Better to fail loudly after 5s than to hang a checkout request forever.
  handle.exec("PRAGMA busy_timeout = 5000");

  handle.exec(`
    CREATE TABLE IF NOT EXISTS orders (
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
  `);
  handle.exec(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
  handle.exec(`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at)`);

  db = handle;
  return handle;
}

/** For tests and scripts: drop the cached handle so a new DB_FILE takes effect. */
export function __resetConnectionForTests(): void {
  db?.close();
  db = null;
}

/**
 * Report the durability pragmas of THIS module's connection.
 *
 * Exists because `synchronous` and `journal_mode` are **per-connection** settings for
 * the former and per-database for the latter — so opening a second connection to the
 * same file and reading `PRAGMA synchronous` returns the *default*, not what this
 * module configured. A gate that probes from outside is testing nothing, which is
 * exactly the mistake this function was added to fix.
 *
 * Power-loss durability itself cannot be reproduced in a sandbox, so the setting is
 * the thing under test: `synchronous = OFF` passes every functional test and loses
 * committed orders when the box dies.
 */
export function durabilitySettings(): { synchronous: number; journalMode: string } {
  const handle = connect();
  const sync = handle.prepare("PRAGMA synchronous").get() as Record<string, unknown>;
  const journal = handle.prepare("PRAGMA journal_mode").get() as Record<string, unknown>;
  return {
    synchronous: Number(Object.values(sync)[0]),
    journalMode: String(Object.values(journal)[0]).toLowerCase(),
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function rowToOrder(row: any): Order {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    createdAt: row.created_at,
    locale: row.locale,
    currency: row.currency,
    tier: row.tier,
    term: row.term,
    amountMinor: row.amount_minor,
    rail: row.rail,
    name: row.name,
    contact: row.contact,
    email: row.email ?? null,
    country: row.country ?? null,
    discord: row.discord ?? null,
    status: row.status,
    proofKey: row.proof_key ?? null,
    proofUploadedAt: row.proof_uploaded_at ?? null,
    verifiedAt: row.verified_at ?? null,
    verifiedBy: row.verified_by ?? null,
    source: row.source ?? null,
    notes: row.notes ?? null,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function findByReference(referenceCode: string): Order | null {
  const row = connect()
    .prepare(`SELECT * FROM orders WHERE reference_code = ?`)
    .get(referenceCode);
  return row ? rowToOrder(row) : null;
}

export function findByIdempotencyKey(key: string): Order | null {
  const row = connect()
    .prepare(`SELECT * FROM orders WHERE idempotency_key = ?`)
    .get(key);
  return row ? rowToOrder(row) : null;
}

export function listOrders(opts: { status?: OrderStatus; limit?: number } = {}): Order[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const rows = opts.status
    ? connect()
        .prepare(`SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC LIMIT ?`)
        .all(opts.status, limit)
    : connect()
        .prepare(`SELECT * FROM orders ORDER BY created_at DESC LIMIT ?`)
        .all(limit);
  return rows.map(rowToOrder);
}

export function countByStatus(): Record<string, number> {
  const rows = connect()
    .prepare(`SELECT status, COUNT(*) AS n FROM orders GROUP BY status`)
    .all() as Array<{ status: string; n: number }>;
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export class OrderError extends Error {
  constructor(
    message: string,
    readonly code: "invalid" | "conflict" | "storage",
  ) {
    super(message);
    this.name = "OrderError";
  }
}

/**
 * Create an order. Synchronous, durable, and loud on failure.
 *
 * IDEMPOTENT: calling twice with the same key returns the FIRST order rather than
 * creating a second. A double-tapped submit button on a slow Egyptian mobile
 * connection is the normal case, not the edge case — and two orders for one payment
 * means the owner reconciles a payment against two rows and one of them looks unpaid
 * forever.
 *
 * The amount is computed HERE from `pricing.ts`, never accepted from the caller.
 * A client-supplied price is a client-chosen price.
 */
export function createOrder(input: NewOrder): { order: Order; reused: boolean } {
  // Idempotency first, so a retry never even tries to insert.
  const existing = findByIdempotencyKey(input.idempotencyKey);
  if (existing) return { order: existing, reused: true };

  const tier = getTier(input.tier);
  if (tier.availability[input.currency] === "unavailable") {
    throw new OrderError(
      `${input.tier} is not sold in ${input.currency}`,
      "invalid",
    );
  }

  // Server-side price. Never trust a submitted amount.
  const amountMinor = Math.round(priceFor(input.tier, input.currency, input.term) * 100);
  if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
    throw new OrderError("computed a non-positive amount", "invalid");
  }

  const handle = connect();

  // A reference collision is astronomically unlikely but not impossible, and the
  // column is UNIQUE, so retry a few times rather than 500 on a coin flip.
  for (let attempt = 0; attempt < 5; attempt++) {
    const referenceCode = buildReferenceCode({
      tier: input.tier,
      currency: input.currency,
    });
    try {
      handle
        .prepare(
          `INSERT INTO orders
             (reference_code, idempotency_key, locale, currency, tier, term,
              amount_minor, rail, name, contact, email, country, discord, source, status)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'created')`,
        )
        .run(
          referenceCode,
          input.idempotencyKey,
          input.locale,
          input.currency,
          input.tier,
          input.term,
          amountMinor,
          input.rail,
          input.name,
          input.contact,
          input.email ?? null,
          input.country ?? null,
          input.discord ?? null,
          input.source ?? null,
        );

      const created = findByReference(referenceCode);
      if (!created) {
        // The insert reported success and the row is not there. Never assume; say so.
        throw new OrderError(
          "order insert reported success but the row could not be read back",
          "storage",
        );
      }
      return { order: created, reused: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Someone else won the race on the idempotency key — return their row.
      if (message.includes("idempotency_key")) {
        const now = findByIdempotencyKey(input.idempotencyKey);
        if (now) return { order: now, reused: true };
      }

      // Reference collision: try a new code.
      if (message.includes("reference_code") && attempt < 4) continue;

      if (err instanceof OrderError) throw err;
      throw new OrderError(`failed to store order: ${message}`, "storage");
    }
  }

  throw new OrderError("could not allocate a unique reference code", "storage");
}

/**
 * Legal status transitions.
 *
 * Enforced rather than trusted, because the transitions encode real-world facts:
 * a payment cannot be un-verified into "created", and access cannot be granted for
 * an order nobody has verified. Free-text status fields are how a member ends up
 * "active" without anyone having seen the money.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  created: ["proof_submitted", "verified", "cancelled"],
  proof_submitted: ["verified", "cancelled"],
  verified: ["active", "refunded", "cancelled"],
  active: ["refunded", "cancelled"],
  cancelled: [],
  refunded: [],
};

/**
 * Statuses from which a receipt may be attached.
 *
 * Deliberately NOT `ALLOWED_TRANSITIONS[status].includes("proof_submitted")`, which is
 * what this used to be and which was wrong: `proof_submitted` has no self-loop in that
 * table, so a buyer who uploaded a blurry or wrong screenshot was refused when they
 * tried to upload the right one — and the refusal surfaced as "this order has already
 * been checked", which is a lie that ends in a WhatsApp argument about money.
 *
 * Attaching a second receipt is a REPLACEMENT, not a transition, so it belongs in its
 * own rule. Nothing is destroyed by it: proof keys carry a random component, so every
 * upload lands as a separate file and the earlier evidence survives on disk.
 *
 * Once a human has verified or cancelled the order, uploads stop mattering and are
 * refused — that path is still a genuine conflict.
 */
const PROOF_ATTACHABLE: OrderStatus[] = ["created", "proof_submitted"];

/**
 * The statuses an order may legally move to next.
 *
 * Exported so the owner's queue can render only the buttons that would succeed. The
 * ledger still enforces the rule on the way in — this is so the UI cannot OFFER an
 * illegal action, not so the UI can be trusted to prevent one.
 */
export function allowedNext(status: OrderStatus): readonly OrderStatus[] {
  return ALLOWED_TRANSITIONS[status];
}

export function attachProof(referenceCode: string, proofKey: string): Order {
  const order = findByReference(referenceCode);
  if (!order) throw new OrderError("no such order", "invalid");
  if (!PROOF_ATTACHABLE.includes(order.status)) {
    throw new OrderError(
      `cannot attach proof to an order that is "${order.status}"`,
      "conflict",
    );
  }
  connect()
    .prepare(
      `UPDATE orders
          SET proof_key = ?, proof_uploaded_at = datetime('now'), status = 'proof_submitted'
        WHERE reference_code = ? AND status IN ('created','proof_submitted')`,
    )
    .run(proofKey, referenceCode);

  const updated = findByReference(referenceCode);
  if (!updated || updated.proofKey !== proofKey) {
    throw new OrderError("proof did not persist", "storage");
  }
  return updated;
}

/** Mark that a human confirmed the money arrived. Access is a separate step. */
export function markVerified(referenceCode: string, verifiedBy: string): Order {
  const order = findByReference(referenceCode);
  if (!order) throw new OrderError("no such order", "invalid");
  if (!ALLOWED_TRANSITIONS[order.status].includes("verified")) {
    throw new OrderError(
      `cannot verify an order that is "${order.status}"`,
      "conflict",
    );
  }
  connect()
    .prepare(
      `UPDATE orders
          SET status = 'verified', verified_at = datetime('now'), verified_by = ?
        WHERE reference_code = ?`,
    )
    .run(verifiedBy, referenceCode);

  const updated = findByReference(referenceCode);
  if (!updated || updated.status !== "verified") {
    throw new OrderError("verification did not persist", "storage");
  }
  return updated;
}

export function setStatus(
  referenceCode: string,
  next: OrderStatus,
  note?: string,
): Order {
  const order = findByReference(referenceCode);
  if (!order) throw new OrderError("no such order", "invalid");
  if (!ALLOWED_TRANSITIONS[order.status].includes(next)) {
    throw new OrderError(
      `illegal transition ${order.status} → ${next}`,
      "conflict",
    );
  }
  connect()
    .prepare(`UPDATE orders SET status = ?, notes = COALESCE(?, notes) WHERE reference_code = ?`)
    .run(next, note ?? null, referenceCode);

  const updated = findByReference(referenceCode);
  if (!updated || updated.status !== next) {
    throw new OrderError("status change did not persist", "storage");
  }
  return updated;
}

/** Display helper. Minor units back to whole currency for humans. */
export function amountForDisplay(order: Order): number {
  return order.amountMinor / 100;
}
