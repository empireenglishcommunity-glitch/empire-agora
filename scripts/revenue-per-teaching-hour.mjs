#!/usr/bin/env node
/**
 * Recompute revenue per teaching hour from pricing.ts.
 *
 * Exists so the governing metric of the business is DERIVED rather than
 * remembered. Any figure quoted in a document is a claim; this is the command
 * that settles it.
 *
 * Spec: requirements.md §4.1, R8.4.
 */

import {
  TIERS,
  ASSESSMENT,
  TEACHING_HOURS_PER_WEEK,
  TEACHING_HOURS_PER_MONTH,
  WEEKS_PER_MONTH,
  priceFor,
  annualPerMonth,
  revenuePerTeachingHour,
  memberHoursPerMonth,
  maxMembersAtCapacity,
  sessionsPerWeek,
  smallestGroup,
  getTier,
} from "../src/commerce/pricing.ts";
import { FX_ANCHOR, egpToUsdAtAnchor, egyptRatio } from "../src/commerce/fx.ts";

const usd = (n) => `$${n.toFixed(2)}`;
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);
const int = (n) => Math.round(n).toLocaleString();

console.log(`\nEEC — revenue per teaching hour`);
console.log(
  `Capacity ${TEACHING_HOURS_PER_WEEK} h/week = ${TEACHING_HOURS_PER_MONTH.toFixed(1)} h/month · ` +
    `${WEEKS_PER_MONTH.toFixed(3)} weeks/month · FX anchor ${FX_ANCHOR.egpPerUsd} EGP/USD (${FX_ANCHOR.recordedOn})`,
);
console.log(
  `\nA group hour is divided by its seat count; a 1:1 hour is not. That single\n` +
    `asymmetry is the whole model.\n`,
);

// ---------------------------------------------------------------------------
console.log(`Owner time consumed by ONE member, and what that member pays for it\n`);
console.log(
  `  ${pad("tier", 10)}${padL("sess/wk", 9)}${padL("min grp", 9)}${padL("1:1/mo", 8)}` +
    `${padL("h/member", 10)}${padL("EGP $/h", 10)}${padL("USD $/h", 10)}`,
);
console.log(`  ${"-".repeat(66)}`);

for (const tier of TIERS) {
  const hours = memberHoursPerMonth(tier);
  const grp = smallestGroup(tier);

  const rateEgp = tier.price.EGP ? revenuePerTeachingHour(tier.id, "EGP", "monthly") : null;
  const rateUsd = tier.price.USD ? revenuePerTeachingHour(tier.id, "USD", "monthly") : null;

  console.log(
    `  ${pad(tier.id, 10)}${padL(sessionsPerWeek(tier), 9)}${padL(grp ?? "—", 9)}` +
      `${padL(tier.oneToOnePerMonth || "—", 8)}${padL(hours === 0 ? "0" : hours.toFixed(3), 10)}` +
      `${padL(rateEgp === null ? (tier.price.EGP ? "∞" : "—") : usd(egpToUsdAtAnchor(rateEgp)), 10)}` +
      `${padL(rateUsd === null ? (tier.price.USD ? "∞" : "—") : usd(rateUsd), 10)}`,
  );
}

console.log(`\n  ∞ = consumes none of the owner's calendar, so the rate is unbounded.`);
console.log(`  EGP rates are shown converted at the anchor purely so the two are comparable.\n`);

// ---------------------------------------------------------------------------
console.log(`Monthly vs annual, per month\n`);
for (const tier of TIERS) {
  const parts = [];
  for (const c of ["EGP", "USD"]) {
    if (!tier.price[c]) continue;
    parts.push(
      `${c} ${priceFor(tier.id, c, "monthly").toLocaleString()}/mo → ` +
        `${annualPerMonth(tier.id, c).toFixed(2)}/mo on annual`,
    );
  }
  console.log(`  ${pad(tier.id, 10)} ${parts.join("   ·   ")}`);
}

// ---------------------------------------------------------------------------
console.log(`\nEgypt vs international, in real terms\n`);
for (const tier of TIERS) {
  const r = egyptRatio(tier.id);
  if (r === null) continue;
  const egpUsd = egpToUsdAtAnchor(priceFor(tier.id, "EGP", "monthly"));
  console.log(
    `  ${pad(tier.id, 10)} Egypt ${padL(usd(egpUsd), 8)}  vs  ` +
      `${padL(usd(priceFor(tier.id, "USD", "monthly")), 8)}   ${r.toFixed(2)}×`,
  );
}
const aEgp = egpToUsdAtAnchor(ASSESSMENT.price.EGP);
console.log(
  `  ${pad("assessment", 10)} Egypt ${padL(usd(aEgp), 8)}  vs  ` +
    `${padL(usd(ASSESSMENT.price.USD), 8)}   ${(ASSESSMENT.price.USD / aEgp).toFixed(2)}×`,
);

// ---------------------------------------------------------------------------
console.log(`\nIf the entire calendar went to ONE tier\n`);
console.log(
  `  ${pad("tier", 10)}${padL("max members", 13)}${padL("EGP/mo", 14)}${padL("USD/mo", 13)}`,
);
console.log(`  ${"-".repeat(50)}`);
for (const tier of TIERS) {
  const max = maxMembersAtCapacity(tier.id);
  if (max === Infinity) {
    console.log(
      `  ${pad(tier.id, 10)}${padL("unbounded", 13)}${padL("—", 14)}${padL("—", 13)}` +
        `   (no calendar cost)`,
    );
    continue;
  }
  const egp = tier.price.EGP ? int(max * priceFor(tier.id, "EGP", "monthly")) : "—";
  const usdRev = tier.price.USD ? usd(max * priceFor(tier.id, "USD", "monthly")) : "—";
  console.log(
    `  ${pad(tier.id, 10)}${padL(int(max), 13)}${padL(egp, 14)}${padL(usdRev, 13)}`,
  );
}

// ---------------------------------------------------------------------------
// The comparison that drove the repricing. Recomputed like-for-like, so the
// improvement claim can be audited rather than believed.
// ---------------------------------------------------------------------------
const vip = getTier("vip");
const OLD_SESSIONS = 12;
const OLD_PRICE = 100;

const sharedHours = memberHoursPerMonth({ ...vip, oneToOnePerMonth: 0 });
const oldHours = sharedHours + OLD_SESSIONS;
const oldRate = OLD_PRICE / oldHours;
const newRate = revenuePerTeachingHour("vip", "USD", "monthly");

const asasMax = maxMembersAtCapacity("asas");
const asasRev = asasMax * priceFor("asas", "USD", "monthly");
const oldVipAt20Hours = 20 * OLD_SESSIONS + sharedHours * 1;

console.log(`\nThe original VIP, for the record\n`);
console.log(
  `  Old: ${OLD_SESSIONS} × 1:1 + group for ${usd(OLD_PRICE)}/mo` +
    ` = ${oldHours.toFixed(2)} h/member → ${usd(oldRate)}/teaching-hour`,
);
console.log(
  `  New: ${vip.oneToOnePerMonth} × 1:1 + group for ${usd(priceFor("vip", "USD", "monthly"))}/mo` +
    ` = ${memberHoursPerMonth(vip).toFixed(2)} h/member → ${usd(newRate)}/teaching-hour`,
);
console.log(`  Improvement: ${(newRate / oldRate).toFixed(1)}×\n`);
console.log(
  `  20 members on the OLD terms would have cost ≈${oldVipAt20Hours.toFixed(0)} h/month, against ` +
    `${TEACHING_HOURS_PER_MONTH.toFixed(0)} h available.`,
);
console.log(
  `  The same calendar spent on ${asas_label()} serves ${int(asasMax)} students for ` +
    `${usd(asasRev)}/mo, versus ${usd(20 * OLD_PRICE)}/mo.`,
);

function asas_label() {
  return getTier("asas").id;
}

console.log("");
