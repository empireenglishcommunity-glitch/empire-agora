#!/usr/bin/env node
/**
 * Price invariant gate. Fails the build if a commercial policy has drifted.
 *
 * These are not style checks. Each one corresponds to a decision that was made
 * deliberately, cost real analysis to reach, and would be silently undone by a
 * plausible future edit.
 *
 * Spec: requirements.md R2.3, R2.5, R3.1.
 */

import {
  TIERS,
  ASSESSMENT,
  ANNUAL_MONTHS_CHARGED,
  WEEKS_PER_MONTH,
  TEACHING_HOURS_PER_MONTH,
  revenuePerTeachingHour,
  memberHoursPerMonth,
} from "../src/commerce/pricing.ts";
import {
  FX_ANCHOR,
  TARGET_EGYPT_RATIO,
  RATIO_ENFORCED_TIERS,
  RATIO_TOLERANCE,
  egyptRatio,
} from "../src/commerce/fx.ts";
import { CEFR_LEVELS, CEFR_ORDER } from "../src/curriculum/cefr.ts";

const failures = [];
const notes = [];

const fail = (msg) => failures.push(msg);
const note = (msg) => notes.push(msg);

// ---------------------------------------------------------------------------
// 1. Annual = ANNUAL_MONTHS_CHARGED × monthly, for every tier and currency.
//
// This is the invariant that was actually broken before: Basic EGP was 20% off,
// Basic USD 31% off, VIP 17% off — three accidents masquerading as a policy.
// ---------------------------------------------------------------------------
for (const tier of TIERS) {
  for (const [currency, price] of Object.entries(tier.price)) {
    const expected = price.monthly * ANNUAL_MONTHS_CHARGED;
    if (price.annual !== expected) {
      fail(
        `${tier.id}/${currency}: annual is ${price.annual}, expected ${expected} ` +
          `(${price.monthly} × ${ANNUAL_MONTHS_CHARGED}). Either fix the price or ` +
          `change ANNUAL_MONTHS_CHARGED deliberately — do not special-case one tier.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Availability and price must agree.
//
// A tier marked available in a currency it has no price for would crash at
// checkout; a tier priced in a currency it is not sold in is dead data that
// will eventually get displayed by accident.
// ---------------------------------------------------------------------------
for (const tier of TIERS) {
  for (const currency of ["EGP", "USD"]) {
    const available = tier.availability[currency] !== "unavailable";
    const priced = Boolean(tier.price[currency]);
    if (available && !priced) {
      fail(
        `${tier.id}/${currency}: availability is "${tier.availability[currency]}" ` +
          `but there is no price. Checkout would throw.`,
      );
    }
    if (!available && priced) {
      fail(
        `${tier.id}/${currency}: marked unavailable but still carries a price. ` +
          `Remove the price or change availability — dead prices get shipped.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 3. VIP must never be PROMOTED in Egypt.
//
// Egyptian 1:1 yields ~$20/teaching-hour against ~$45 for an Egyptian group
// session, so promoting VIP in Egypt actively steers buyers toward the worse
// use of the calendar. It stays purchasable ("unlisted") for someone who
// insists. This gate exists because the decision is counter-intuitive and would
// look like a bug to someone who had not read the analysis.
// ---------------------------------------------------------------------------
const vip = TIERS.find((t) => t.id === "vip");
if (vip && vip.availability.EGP === "promoted") {
  fail(
    `vip/EGP is "promoted". It must be "unlisted": Egyptian 1:1 earns about ` +
      `$20/teaching-hour vs $45 for an Egyptian group session, so promoting it ` +
      `steers Egyptian buyers to the worse option. Route them to tarkeez. ` +
      `See requirements.md §4.3 note 1.`,
  );
}

// ---------------------------------------------------------------------------
// 4. Exactly one tier must consume zero owner hours.
//
// The zero-hour tier is the only part of the model that scales without limit.
// If it disappears, the business is once again bounded entirely by one calendar.
// ---------------------------------------------------------------------------
const zeroHour = TIERS.filter((t) => memberHoursPerMonth(t) === 0);
if (zeroHour.length !== 1) {
  fail(
    `Expected exactly 1 zero-owner-hour tier, found ${zeroHour.length} ` +
      `(${zeroHour.map((t) => t.id).join(", ") || "none"}). The zero-hour tier is ` +
      `the only part of the model that scales without consuming the calendar.`,
  );
}

// ---------------------------------------------------------------------------
// 5. No tier may earn less per teaching hour than the cheapest paid group tier.
//
// This is the gate that would have caught the original VIP: $8.33/hour against
// Basic's $139. A "premium" tier that earns less per hour than the entry tier is
// not premium, it is a discount on the scarcest resource in the business.
// ---------------------------------------------------------------------------
const BASELINE_TIER = "asas";

/**
 * The floor is a fraction of the entry tier's rate IN THE SAME CURRENCY.
 *
 * Per-currency deliberately. Egypt's entire premise is a ~3× lower price, so
 * every Egyptian tier sits about 3× lower in dollar terms by design — comparing
 * an EGP rate against a USD-derived floor measures the purchasing-power gap
 * rather than the health of the tier, and fails tiers that are perfectly sound
 * within their own market. (This check did exactly that on its first run and
 * flagged `tarkeez/EGP`, which is fine.)
 *
 * A fraction rather than parity, because group tiers legitimately out-earn 1:1
 * tiers by a wide margin. The point is to catch an order-of-magnitude inversion
 * — the original VIP sat at 6% of the entry tier — not to force every tier to
 * match the most efficient one.
 */
const FLOOR_FRACTION = 0.25;

for (const currency of ["EGP", "USD"]) {
  const baseline = revenuePerTeachingHour(BASELINE_TIER, currency, "monthly");
  if (baseline === null) continue;
  const floor = baseline * FLOOR_FRACTION;
  const unit = currency === "EGP" ? "EGP" : "$";

  for (const tier of TIERS) {
    // Only PROMOTED tiers are held to the floor. A tier that is deliberately
    // "unlisted" is unlisted precisely BECAUSE its rate is poor. Holding it to
    // the floor would force us either to delete a tier a willing buyer wants, or
    // to lie about why it exists.
    if (tier.availability[currency] !== "promoted") continue;
    const rate = revenuePerTeachingHour(tier.id, currency, "monthly");
    if (rate === null) continue;

    if (rate < floor) {
      fail(
        `${tier.id}/${currency} is PROMOTED but earns ${unit}${rate.toFixed(2)} per ` +
          `teaching hour, below the ${currency} floor of ${unit}${floor.toFixed(2)} ` +
          `(${FLOOR_FRACTION * 100}% of ${BASELINE_TIER}/${currency}'s ` +
          `${unit}${baseline.toFixed(2)}). Either reprice it, enlarge its group, or set ` +
          `availability to "unlisted" so it is not actively recommended. A promoted ` +
          `tier must not be a discount on the owner's calendar.`,
      );
    }
  }
}

// The counterpart: record what the unlisted tiers earn against their own market's
// entry tier, so the reason they are unlisted stays visible rather than becoming
// folklore that a later session "fixes".
for (const currency of ["EGP", "USD"]) {
  const baseline = revenuePerTeachingHour(BASELINE_TIER, currency, "monthly");
  if (baseline === null) continue;
  for (const tier of TIERS) {
    if (tier.availability[currency] !== "unlisted") continue;
    const rate = revenuePerTeachingHour(tier.id, currency, "monthly");
    if (rate === null) continue;
    const usdRate = currency === "EGP" ? rate / FX_ANCHOR.egpPerUsd : rate;
    const usdBase = currency === "EGP" ? baseline / FX_ANCHOR.egpPerUsd : baseline;
    note(
      `${tier.id}/${currency} unlisted — $${usdRate.toFixed(2)}/teaching-hour vs ` +
        `$${usdBase.toFixed(2)} for ${BASELINE_TIER}/${currency}. Worse than the tier it ` +
        `upgrades from, which is exactly why it is never promoted.`,
    );
  }
}

// ---------------------------------------------------------------------------
// 6. Seat caps must be real numbers where the tier claims a cap.
// A displayed "3 seats left" derived from a null cap is a fabricated scarcity
// claim, which the honesty rules forbid outright.
// ---------------------------------------------------------------------------
for (const tier of TIERS) {
  if (tier.oneToOnePerMonth > 0 && tier.totalSeatCap === null) {
    fail(
      `${tier.id} includes ${tier.oneToOnePerMonth} 1:1 sessions/month but has no ` +
        `totalSeatCap. Uncapped 1:1 is an unbounded claim on the calendar.`,
    );
  }
  for (const group of tier.groups) {
    if (!Number.isInteger(group.seatCap) || group.seatCap < 1) {
      fail(`${tier.id} group "${group.label}" has an invalid seatCap: ${group.seatCap}.`);
    }
    if (group.sessionsPerWeek <= 0 || group.hoursPerSession <= 0) {
      fail(`${tier.id} group "${group.label}" has a non-positive cadence or duration.`);
    }
  }
}

// ---------------------------------------------------------------------------
// 7. VIP's seat cap must fit inside the owner's actual capacity.
// ---------------------------------------------------------------------------
for (const tier of TIERS) {
  if (!tier.totalSeatCap || tier.oneToOnePerMonth === 0) continue;
  const hours = tier.totalSeatCap * tier.oneToOnePerMonth;
  const pct = (hours / TEACHING_HOURS_PER_MONTH) * 100;
  if (pct > 50) {
    fail(
      `${tier.id}: ${tier.totalSeatCap} seats × ${tier.oneToOnePerMonth} sessions = ` +
        `${hours}h/month, which is ${pct.toFixed(0)}% of total capacity ` +
        `(${TEACHING_HOURS_PER_MONTH.toFixed(1)}h). Selling out this tier would ` +
        `leave no room to teach.`,
    );
  } else {
    note(
      `${tier.id}: full at ${tier.totalSeatCap} seats = ${hours}h/month ` +
        `(${pct.toFixed(0)}% of capacity).`,
    );
  }
}

// ---------------------------------------------------------------------------
// 8. Egypt/international ratio stays near target for the volume tiers.
// ---------------------------------------------------------------------------
for (const tierId of RATIO_ENFORCED_TIERS) {
  const ratio = egyptRatio(tierId);
  if (ratio === null) {
    fail(`${tierId}: ratio-enforced but not priced in both currencies.`);
    continue;
  }
  const drift = Math.abs(ratio - TARGET_EGYPT_RATIO) / TARGET_EGYPT_RATIO;
  if (drift > RATIO_TOLERANCE) {
    fail(
      `${tierId}: Egypt/international ratio is ${ratio.toFixed(2)}×, target is ` +
        `${TARGET_EGYPT_RATIO}× ±${RATIO_TOLERANCE * 100}%. Either reprice or move ` +
        `this tier out of RATIO_ENFORCED_TIERS deliberately.`,
    );
  } else {
    note(`${tierId}: Egypt ratio ${ratio.toFixed(2)}× (target ${TARGET_EGYPT_RATIO}×).`);
  }
}

// ---------------------------------------------------------------------------
// 9. The assessment fee must be credited, and cheaper than the cheapest month.
// If the entry step costs more than a month of membership it stops being an
// on-ramp and becomes a toll.
// ---------------------------------------------------------------------------
if (!ASSESSMENT.creditedOnJoin) {
  fail(
    `ASSESSMENT.creditedOnJoin is false. Crediting the fee is what makes the paid ` +
      `assessment an on-ramp rather than a barrier.`,
  );
}
// The comparison is against the cheapest tier the assessment actually GATES,
// not the cheapest tier overall. The zero-hour tier is deliberately
// assessment-free: it consumes none of the owner's calendar, so there is nothing
// to protect by interviewing first, and requiring a paid interview to buy the
// cheapest self-serve tier would strangle the widest part of the funnel.
// Anything with live contact requires the assessment, because live contact is
// where the owner's time gets committed.
for (const currency of ["EGP", "USD"]) {
  const gated = TIERS.filter(
    (t) => t.price[currency] && (t.groups.length > 0 || t.oneToOnePerMonth > 0),
  );
  if (gated.length === 0) {
    fail(`No tier in ${currency} includes live contact — the assessment gates nothing.`);
    continue;
  }
  const cheapestGated = Math.min(...gated.map((t) => t.price[currency].monthly));
  if (ASSESSMENT.price[currency] > cheapestGated) {
    fail(
      `Assessment costs ${ASSESSMENT.price[currency]} ${currency} but the cheapest ` +
        `tier it gates costs ${cheapestGated}/month. The entry step must not cost ` +
        `more than the thing it is an entry to.`,
    );
  } else {
    note(
      `assessment ${currency} ${ASSESSMENT.price[currency]} vs cheapest gated tier ` +
        `${cheapestGated}/mo (${((ASSESSMENT.price[currency] / cheapestGated) * 100).toFixed(0)}% of a month).`,
    );
  }
}

// The zero-hour tier must stay assessment-free, since that is what makes it the
// widest entry point in the funnel.
const zeroHourTier = TIERS.find((t) => memberHoursPerMonth(t) === 0);
if (
  zeroHourTier &&
  (zeroHourTier.groups.length > 0 || zeroHourTier.oneToOnePerMonth > 0)
) {
  fail(
    `${zeroHourTier.id} claims 0 owner hours but includes live contact. Live contact ` +
      `always costs calendar time — one of the two is wrong.`,
  );
}

// ---------------------------------------------------------------------------
// 10. Sanity on the constants themselves.
// ---------------------------------------------------------------------------
if (Math.abs(WEEKS_PER_MONTH - 52 / 12) > 1e-9) {
  fail(`WEEKS_PER_MONTH must be 52/12 (≈4.333). Using 4 understates owner hours by 7.6%.`);
}
if (FX_ANCHOR.egpPerUsd <= 0) fail(`FX_ANCHOR.egpPerUsd must be positive.`);
if (!/^\d{4}-\d{2}-\d{2}$/.test(FX_ANCHOR.recordedOn)) {
  fail(`FX_ANCHOR.recordedOn must be an ISO date so staleness is checkable.`);
}

// ---------------------------------------------------------------------------
// 11. CEFR data must stay consistent with the bot's shape.
// ---------------------------------------------------------------------------
if (CEFR_LEVELS.length !== CEFR_ORDER.length) {
  fail(`CEFR_LEVELS has ${CEFR_LEVELS.length} entries but CEFR_ORDER has ${CEFR_ORDER.length}.`);
}
CEFR_LEVELS.forEach((level, i) => {
  if (level.order !== i) fail(`CEFR level ${level.code} has order ${level.order}, expected ${i}.`);
  if (CEFR_ORDER[i] !== level.code) {
    fail(`CEFR_ORDER[${i}] is ${CEFR_ORDER[i]} but CEFR_LEVELS[${i}] is ${level.code}.`);
  }
  if (!level.nameAr) fail(`CEFR level ${level.code} is missing nameAr.`);
});

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (notes.length) {
  console.log("Pricing facts:");
  for (const n of notes) console.log(`  · ${n}`);
  console.log("");
}

if (failures.length) {
  console.error(`✗ ${failures.length} price invariant failure(s):\n`);
  for (const f of failures) console.error(`  • ${f}\n`);
  process.exit(1);
}

console.log(
  `✓ All price invariants hold (${TIERS.length} tiers, 2 currencies, ` +
    `${CEFR_LEVELS.length} CEFR levels).`,
);
