/**
 * THE SINGLE SOURCE OF TRUTH FOR EVERY PRICE IN THE SYSTEM.
 *
 * No price may appear anywhere else — not in a component, not in a copy
 * dictionary, not in a payment instruction. `scripts/check-price-invariants.mjs`
 * fails the build if the policies below are violated.
 *
 * Spec: .kiro/specs/eec-commercial-and-sales-page/requirements.md §4.3, R2.
 *
 * WHY THIS FILE IS SHAPED LIKE THIS
 * ---------------------------------
 * Every tier is an exchange rate on one person's calendar, so `ownerHoursPerMonth`
 * sits beside the price rather than in a spreadsheet. That adjacency is the point:
 * it makes it visible, at the moment someone edits a price, that VIP once sold
 * twelve 1:1 hours a month for $100 — $8.33 per teaching hour, against $139 for
 * the cheapest tier. Twenty such members would have consumed more of the calendar
 * than a thousand Basic students, for 6.7% of the revenue.
 *
 * Run `npm run revenue` to recompute that table from this data rather than
 * trusting any number written in prose.
 */

export type Currency = "EGP" | "USD";

export type TierId = "darb" | "asas" | "tarkeez" | "vip" | "nukhba";

export type Term = "monthly" | "annual";

/**
 * How a tier is offered in a given market.
 *
 * `unlisted` is load-bearing, not a nicety. Egyptian 1:1 coaching yields roughly
 * $20 per teaching hour against $45 for an Egyptian group session — so VIP in
 * Egypt is a *worse* use of the calendar than the cheaper tier it upgrades from.
 * It stays purchasable for someone who insists, and is never promoted. Egyptian
 * buyers who want more attention are routed to `tarkeez` instead.
 */
export type Availability = "promoted" | "unlisted" | "unavailable";

// ---------------------------------------------------------------------------
// Policy constants — declared before TIERS because TIERS is computed from them
// ---------------------------------------------------------------------------

/**
 * Annual = ten months' money for twelve months' access ("two months free").
 *
 * ONE policy, deliberately. Before this was fixed the three annual prices
 * embodied three different accidental discounts — 20% on Basic EGP, 31% on
 * Basic USD, 17% on VIP. A CI gate now holds the line.
 */
export const ANNUAL_MONTHS_CHARGED = 10;

/**
 * 4.333…, not 4. Using 4 understates monthly owner-hours by 7.6%, which is
 * exactly the kind of quiet error that makes a tier look more profitable than it
 * is. One weekly session therefore costs 4.33 hours a month, not 4.
 */
export const WEEKS_PER_MONTH = 52 / 12;

/** The owner's stated maximum teaching capacity. The ceiling on everything. */
export const TEACHING_HOURS_PER_WEEK = 50;

/** Hours of teaching available per month at full capacity. ≈216.7 */
export const TEACHING_HOURS_PER_MONTH =
  TEACHING_HOURS_PER_WEEK * WEEKS_PER_MONTH;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TermPrice {
  /** Price for one month. */
  monthly: number;
  /** Price for twelve months. Invariant: monthly * ANNUAL_MONTHS_CHARGED. */
  annual: number;
}

/**
 * One recurring group session a tier includes.
 *
 * Modelled as a LIST rather than a single `groupSeatCap`, because a tier can
 * include two groups of different sizes — `tarkeez` is the 20-person session
 * *plus* a small group of 8. Collapsing that into one seat count silently
 * misprices the tier: an hour shared with 20 people costs a twentieth of an hour
 * per member, an hour shared with 8 costs an eighth, and averaging them is
 * simply wrong. The first version of this file had exactly that bug and reported
 * VIP at $477/teaching-hour instead of $47.
 */
export interface GroupSession {
  /** Max students in this session. */
  seatCap: number;
  sessionsPerWeek: number;
  /** Length of one session in hours. */
  hoursPerSession: number;
  /** Human label for the revenue report. */
  label: string;
}

export interface Tier {
  id: TierId;
  /** Arabic name — the primary, canonical name. Owner-approved 2026-08-31. */
  nameAr: string;
  /** Latin name, used only on the `en` surface and in analytics. */
  nameEn: string;

  /** Group sessions included. Empty for a tier with no live contact. */
  groups: readonly GroupSession[];
  /** One-to-one hours per month. These are NOT shared — they cost full price. */
  oneToOnePerMonth: number;

  /**
   * Hard cap on total members in this tier, or null for uncapped.
   * These caps are REAL and enforced — the arithmetic of the calendar, not a
   * marketing device. Because they are real, they may be displayed.
   */
  totalSeatCap: number | null;

  availability: Record<Currency, Availability>;
  /** Absent for a currency where availability is "unavailable". */
  price: Partial<Record<Currency, TermPrice>>;
}

// ---------------------------------------------------------------------------
// Derived calendar cost — the heart of the model
// ---------------------------------------------------------------------------

/**
 * Hours of the owner's time ONE MEMBER of this tier consumes per month.
 *
 * A group hour is divided by its seat count because it genuinely serves that
 * many people at once. A 1:1 hour is not divided, because it serves one. This
 * single asymmetry is why the original VIP was catastrophic and why the entry
 * tier is the most profitable thing in the business.
 */
export function memberHoursPerMonth(tier: Tier): number {
  const shared = tier.groups.reduce(
    (sum, g) =>
      sum + (g.sessionsPerWeek * g.hoursPerSession * WEEKS_PER_MONTH) / g.seatCap,
    0,
  );
  return shared + tier.oneToOnePerMonth;
}

/**
 * Total hours the owner spends per month delivering this tier to a FULL cohort
 * of it — every group filled to capacity. Used for capacity planning.
 */
export function tierHoursAtCapacity(tier: Tier, members: number): number {
  const groupHours = tier.groups.reduce(
    (sum, g) =>
      sum +
      Math.ceil(members / g.seatCap) *
        g.sessionsPerWeek *
        g.hoursPerSession *
        WEEKS_PER_MONTH,
    0,
  );
  return groupHours + members * tier.oneToOnePerMonth;
}

/** Live group sessions per week, summed. Convenience for copy. */
export function sessionsPerWeek(tier: Tier): number {
  return tier.groups.reduce((sum, g) => sum + g.sessionsPerWeek, 0);
}

/** Smallest group a member of this tier sits in — the "attention" signal. */
export function smallestGroup(tier: Tier): number | null {
  if (tier.groups.length === 0) return null;
  return Math.min(...tier.groups.map((g) => g.seatCap));
}

// ---------------------------------------------------------------------------
// The tiers
// ---------------------------------------------------------------------------

export const TIERS: readonly Tier[] = [
  {
    id: "darb",
    nameAr: "دَرْب",
    nameEn: "Darb",
    // NO live contact, and that is the entire strategic point: this tier scales
    // without limit because it consumes none of the owner's calendar. Discord +
    // the practice site + the bot. It is also the only tier that needs no paid
    // assessment first, which makes it the widest mouth of the funnel.
    groups: [],
    oneToOnePerMonth: 0,
    totalSeatCap: null,
    availability: { EGP: "promoted", USD: "promoted" },
    price: {
      EGP: { monthly: 199, annual: 1_990 },
      USD: { monthly: 12, annual: 120 },
    },
  },
  {
    id: "asas",
    nameAr: "الأساس",
    nameEn: "Basic",
    groups: [
      { label: "main group", seatCap: 20, sessionsPerWeek: 1, hoursPerSession: 1 },
    ],
    oneToOnePerMonth: 0,
    totalSeatCap: null,
    availability: { EGP: "promoted", USD: "promoted" },
    price: {
      EGP: { monthly: 500, annual: 5_000 },
      USD: { monthly: 30, annual: 300 },
    },
  },
  {
    id: "tarkeez",
    nameAr: "التركيز",
    nameEn: "Focus",
    // The main session PLUS a second session in a small group of 8. Two groups
    // of different sizes — which is precisely why `groups` is a list.
    groups: [
      { label: "main group", seatCap: 20, sessionsPerWeek: 1, hoursPerSession: 1 },
      { label: "small group", seatCap: 8, sessionsPerWeek: 1, hoursPerSession: 1 },
    ],
    oneToOnePerMonth: 0,
    totalSeatCap: null,
    availability: { EGP: "promoted", USD: "promoted" },
    price: {
      EGP: { monthly: 1_200, annual: 12_000 },
      USD: { monthly: 69, annual: 690 },
    },
  },
  {
    id: "vip",
    nameAr: "VIP",
    nameEn: "VIP",
    groups: [
      { label: "main group", seatCap: 20, sessionsPerWeek: 1, hoursPerSession: 1 },
    ],
    oneToOnePerMonth: 4,
    // 12 seats = 48 one-to-one hours/month ≈ 22% of a 50 hour/week calendar.
    // Real arithmetic, therefore honestly advertisable.
    totalSeatCap: 12,
    availability: { EGP: "unlisted", USD: "promoted" },
    price: {
      EGP: { monthly: 5_000, annual: 50_000 },
      USD: { monthly: 199, annual: 1_990 },
    },
  },
  {
    id: "nukhba",
    nameAr: "النخبة",
    nameEn: "Elite",
    groups: [
      { label: "main group", seatCap: 20, sessionsPerWeek: 1, hoursPerSession: 1 },
    ],
    oneToOnePerMonth: 8,
    totalSeatCap: 4,
    // Exists primarily as a price anchor for VIP. Not sold in EGP: at any
    // sellable EGP price, eight 1:1 hours is a losing use of the calendar.
    availability: { EGP: "unavailable", USD: "promoted" },
    price: {
      USD: { monthly: 499, annual: 4_990 },
    },
  },
] as const;

/**
 * The paid live assessment — the primary entry point to everything.
 *
 * The fee is credited in full against the first membership payment, so for
 * someone who joins it is not a cost at all. For someone who does not, it is the
 * honest price of an hour of expert attention.
 *
 * It used to be 100 LE for a full hour: $1.97 of revenue for 60 minutes of the
 * scarcest resource in the business, and too cheap to filter anyone. Raising it,
 * shortening it, and moving the free automated placement test in front turns a
 * 60-minute cost into roughly 25 minutes — which roughly triples how many people
 * the same calendar can assess.
 */
export const ASSESSMENT = {
  creditedOnJoin: true,
  price: { EGP: 300, USD: 10 } as Record<Currency, number>,
  durationMinutes: { EGP: 30, USD: 45 } as Record<Currency, number>,
  /** Capped so assessments can never silently eat teaching capacity. */
  weeklySlotCap: 8,
  /** The free adaptive placement test runs BEFORE the live call. */
  placementTestFirst: true,
} as const;

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function getTier(id: TierId): Tier {
  const tier = TIERS.find((t) => t.id === id);
  if (!tier) throw new Error(`Unknown tier: ${id}`);
  return tier;
}

/** Tiers to show in the pricing table for a market, in display order. */
export function promotedTiers(currency: Currency): Tier[] {
  return TIERS.filter((t) => t.availability[currency] === "promoted");
}

/** Tiers a visitor may buy in this market, including unlisted ones. */
export function purchasableTiers(currency: Currency): Tier[] {
  return TIERS.filter((t) => t.availability[currency] !== "unavailable");
}

export function priceFor(id: TierId, currency: Currency, term: Term): number {
  const p = getTier(id).price[currency];
  if (!p) throw new Error(`${id} is not sold in ${currency}`);
  return p[term];
}

/** What an annual plan works out to per month — for honest comparison copy. */
export function annualPerMonth(id: TierId, currency: Currency): number {
  return priceFor(id, currency, "annual") / 12;
}

/**
 * Revenue per hour of the owner's time for this tier.
 *
 * The governing metric of the whole business, so it is a FUNCTION rather than a
 * documented number: it cannot go stale, and any claim about it can be settled by
 * running `npm run revenue`.
 *
 * Returns null for a tier that consumes no calendar — the rate is unbounded, and
 * reporting a number there would invite a meaningless comparison.
 */
export function revenuePerTeachingHour(
  id: TierId,
  currency: Currency,
  term: Term,
): number | null {
  const tier = getTier(id);
  const hours = memberHoursPerMonth(tier);
  if (hours === 0) return null;
  const monthlyRevenue =
    term === "annual"
      ? annualPerMonth(id, currency)
      : priceFor(id, currency, "monthly");
  return monthlyRevenue / hours;
}

/**
 * How many members of a tier the owner's full capacity could serve.
 * Solved iteratively because group hours step up as each group fills.
 */
export function maxMembersAtCapacity(
  id: TierId,
  hoursAvailable = TEACHING_HOURS_PER_MONTH,
): number {
  const tier = getTier(id);
  if (memberHoursPerMonth(tier) === 0) return Infinity;
  let n = 0;
  while (tierHoursAtCapacity(tier, n + 1) <= hoursAvailable) n++;
  return n;
}
