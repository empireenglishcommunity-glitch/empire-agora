/**
 * Boot-time configuration check.
 *
 * WHY THIS EXISTS
 * ---------------
 * `railAccount()` returns null for an unconfigured rail and the `/join` form simply does
 * not offer it. That is the right behaviour for a buyer — better than an account number
 * they cannot pay — but it is SILENT for the operator, and the silence hides the worst
 * case: USD is the default currency for anyone this app cannot place geographically, so
 * configuring only the two Egypt rails closes checkout for **every international
 * visitor** while `/ar` keeps working perfectly for the owner testing from Egypt.
 *
 * Nothing would report that. No error, no failed request, no empty table — just a form
 * that says "no payment method is available" to the highest-paying market, discovered
 * whenever someone eventually mentions it.
 *
 * So the process says so once, loudly, at boot, where `docker logs` will show it.
 *
 * This deliberately does NOT throw. A misconfigured rail must not stop the sales page
 * from serving: the marketing content is still worth reading, and refusing to boot would
 * turn a partial outage into a total one.
 */
export async function register() {
  // Imported lazily so this module stays cheap for the edge runtime, which never needs it.
  const { RAILS, railAccount, missingRequiredRails } = await import("@/commerce/rails");

  const missing = missingRequiredRails();
  const configured = RAILS.filter((r) => railAccount(r.id) !== null);

  const byCurrency = (currency: "EGP" | "USD") =>
    configured.filter((r) => r.currencies.includes(currency)).map((r) => r.id);

  const egp = byCurrency("EGP");
  const usd = byCurrency("USD");

  console.log(
    `[agora] payment rails configured — EGP: ${egp.join(", ") || "NONE"} · ` +
      `USD: ${usd.join(", ") || "NONE"}`,
  );

  if (missing.length > 0) {
    console.warn(`[agora] WARNING: required rail env vars are unset: ${missing.join(", ")}`);
  }

  if (usd.length === 0) {
    console.error(
      "[agora] NO USD RAIL IS CONFIGURED. USD is the default currency for every visitor " +
        "this app cannot place, so international checkout is CLOSED — silently, while the " +
        "Egyptian path keeps working. Set RAIL_PAYPAL (see .env.example).",
    );
  }

  if (egp.length === 0) {
    console.error(
      "[agora] NO EGP RAIL IS CONFIGURED. Egyptian checkout is CLOSED. Set " +
        "RAIL_VODAFONE_CASH and/or RAIL_INSTAPAY (see .env.example).",
    );
  }

  // The order queue is the only surface holding buyer PII and receipts. An unset token
  // locks it (by design, it fails closed) — but the operator needs to know why.
  if (!process.env.ADMIN_TOKEN || process.env.ADMIN_TOKEN.trim().length < 16) {
    console.warn(
      "[agora] ADMIN_TOKEN is unset or too short, so /admin/orders is locked for " +
        "EVERYONE. This is the safe failure, not a broken one. Generate one with " +
        "`openssl rand -hex 32`.",
    );
  }
}
