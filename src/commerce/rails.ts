import type { Currency } from "./pricing";
import type { Rail } from "./orders";

/**
 * Payment rails, and where their details come from.
 *
 * TWO RULES, BOTH LOAD-BEARING
 * ----------------------------
 * 1. **No payment identifier is committed to this repository.** Every account number
 *    comes from an environment variable. A payment number in a public repo is
 *    grep-able forever, and this project's history already includes real leaked
 *    credentials.
 *
 * 2. **Instructions are never rendered into public markup.** They are returned only
 *    in the response to creating an order (requirements R5.7). A payment number on a
 *    public page is an impersonation vector: a third party screenshots the page with
 *    their own number substituted and collects real payments from your buyers.
 *
 * The rail also acts as the geo gate (R1.5). Vodafone Cash and InstaPay need an
 * Egyptian phone or bank account, so offering them only on the EGP path means the
 * tier enforces itself without anyone having to verify a passport.
 */

export interface RailDefinition {
  id: Rail;
  currencies: Currency[];
  /** Copy key, so the label is translated rather than hard-coded here. */
  labelKey: string;
  /** Env var holding the account identifier. NEVER a literal value. */
  envVar: string;
  /** Shown when the env var is unset, so a misconfiguration is visible not silent. */
  required: boolean;
}

export const RAILS: readonly RailDefinition[] = [
  {
    id: "vodafone_cash",
    currencies: ["EGP"],
    labelKey: "vodafoneCash",
    envVar: "RAIL_VODAFONE_CASH",
    required: true,
  },
  {
    id: "instapay",
    currencies: ["EGP"],
    labelKey: "instapay",
    envVar: "RAIL_INSTAPAY",
    required: true,
  },
  {
    id: "paypal",
    currencies: ["USD"],
    labelKey: "paypal",
    envVar: "RAIL_PAYPAL",
    required: true,
  },
  {
    id: "bank_transfer",
    currencies: ["USD"],
    labelKey: "bankTransfer",
    envVar: "RAIL_BANK_TRANSFER",
    required: false,
  },
  {
    id: "crypto",
    currencies: ["USD"],
    labelKey: "crypto",
    envVar: "RAIL_CRYPTO",
    required: false,
  },
] as const;

export function railsFor(currency: Currency): RailDefinition[] {
  return RAILS.filter((r) => r.currencies.includes(currency));
}

export function isRailValidFor(rail: string, currency: Currency): rail is Rail {
  return railsFor(currency).some((r) => r.id === rail);
}

/**
 * The account identifier for a rail, or null if it is not configured.
 *
 * Returns null rather than a placeholder: a buyer shown "TODO" as an account number
 * would try to pay it. The API surfaces the absence instead.
 */
export function railAccount(rail: Rail): string | null {
  const def = RAILS.find((r) => r.id === rail);
  if (!def) return null;
  const value = process.env[def.envVar];
  return value && value.trim() ? value.trim() : null;
}

/** Which required rails are unconfigured — for a startup/ops check. */
export function missingRequiredRails(): string[] {
  return RAILS.filter((r) => r.required && !railAccount(r.id)).map((r) => r.envVar);
}
