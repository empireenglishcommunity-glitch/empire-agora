import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";

/**
 * Owner authentication for the order queue.
 *
 * FAILS CLOSED, in both directions that matter:
 *
 *   · no `ADMIN_TOKEN` configured  → nobody gets in, ever
 *   · token present but not equal  → nobody gets in
 *
 * The first case is the one that bites. A guard written as `token === process.env.X`
 * lets EVERYONE in when the variable is unset, because `undefined === undefined` on a
 * missing cookie — and an unset env var is the single most likely production
 * misconfiguration. So an unconfigured token is treated as "locked", not "open".
 *
 * Spec: requirements.md R12.6.
 */

export const ADMIN_COOKIE = "eec_admin";

/** Constant-time compare, so the token cannot be recovered by timing the response. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // timingSafeEqual throws on length mismatch, which would itself leak length —
  // compare padded buffers and fold the length check into the result.
  const len = Math.max(ab.length, bb.length, 1);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ab.copy(pa);
  bb.copy(pb);
  return timingSafeEqual(pa, pb) && ab.length === bb.length;
}

export function adminTokenConfigured(): boolean {
  const t = process.env.ADMIN_TOKEN;
  return typeof t === "string" && t.trim().length >= 16;
}

/** True only if a real token is configured AND the supplied value matches it. */
export function isValidAdminToken(supplied: string | undefined | null): boolean {
  if (!adminTokenConfigured()) return false;
  if (!supplied) return false;
  return safeEqual(supplied, process.env.ADMIN_TOKEN as string);
}

/** Whether the current request carries a valid owner session. */
export async function isAdminRequest(): Promise<boolean> {
  const store = await cookies();
  return isValidAdminToken(store.get(ADMIN_COOKIE)?.value);
}
