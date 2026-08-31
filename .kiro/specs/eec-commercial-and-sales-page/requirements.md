# EEC Commercial Model & Sales Page — Requirements

> **Status (evidence-based, 2026-08-31):** SPEC — nothing built. Written after a
> live-repo audit of `empire-chronicle`, `EEC-MATERIAL`, `empire-dojo` and
> `empire-nexus`. Every "current state" claim below carries a `file:line`
> citation; the pricing numbers are owner-agreed in session 2026-08-31 and are
> **not** yet reflected in any repo or in production.
>
> Read this before `design.md`. Trust this header, not checkboxes elsewhere.

---

## 1. Why this exists

Two problems, one document.

**Problem 1 — the commercial model is unpriced and inverted.** No price number is
committed anywhere in any repo. `EEC-MATERIAL/strategy/01-foundational-strategy.md:312`
says so explicitly: *"Exact price points to be validated with the founding cohort."*
Meanwhile the prices actually being charged live exist only in the owner's head and
in WhatsApp messages. When those live prices are written down and measured (§4.1),
the premium tier turns out to yield **$8.33 per teaching hour** against Basic's
**$139** — the business sells its scarcest resource at a 94% discount.

**Problem 2 — there is no way to buy anything.** `EEC-MATERIAL/program/01-founding-cohort-offer.md:166`
has carried an unchecked box for the "offer/sales page + checkout" since it was
written. The existing `web/src/app/[locale]/cohort/page.tsx:90-101` renders a
pricing section whose only call to action is `href={base}/waitlist`. Every sale
today is a manual WhatsApp conversation.

## 1.1 Why this is urgent, not just important

`empire-chronicle/STATUS.md:216-225`: `!suspend all go` is held by the owner until
**Wed 2 September 2026** — two days after this spec was written. That command
withdraws access from every member who has not renewed.

**There is no record of who has paid.** §2.2 establishes that no payment,
subscription, tier, amount, currency or expiry field exists in any schema. The
monthly membership cycle is about to be enforced by a system that cannot answer
"did this person pay?" — the answer lives only in the owner's memory and his
Vodafone Cash SMS log.

This makes the ledger (R6) the highest-priority item in this spec, ahead of any
page work. A beautiful sales page that feeds an unrecorded funnel reproduces the
current problem at higher volume.

---

## 2. Ground truth (verified 2026-08-31)

### 2.1 What is deployed at the root domain

| Fact | Evidence |
|---|---|
| `empireenglish.online` is served by `EEC-MATERIAL/web/` | `empire-chronicle/SYSTEM-MAP.md:973` |
| Next.js 16.2.11, React 19.2.4, Tailwind v4, TypeScript 5 | `EEC-MATERIAL/web/package.json` |
| `output: "standalone"` — a real SSR Node server, not a static export | `EEC-MATERIAL/web/next.config.ts` |
| Runs as Docker service `eec-web` on `127.0.0.1:8080`, capped 512 MB / 0.75 CPU | `EEC-MATERIAL/web/docker-compose.yml` |
| Public only via the shared Cloudflare Named Tunnel | `EEC-MATERIAL/web/DEPLOY.md:35-52` |
| **Nothing auto-deploys.** Manual `git pull` → `rsync -a --delete` → `docker compose up -d --build` | `EEC-MATERIAL/web/DEPLOY.md:70-104` |
| Arabic is already the default locale; `ar` = RTL, `en` = LTR | `EEC-MATERIAL/web/src/i18n/config.ts:1-21` |
| Cairo font, `arabic`+`latin` subsets; `<html dir>` set per locale | `EEC-MATERIAL/web/src/app/[locale]/layout.tsx:1-58` |
| Brand tokens exist: `royal-50…950`, `gold-400/500/600`, `--color-ink`, `--color-cream` | `EEC-MATERIAL/web/src/app/globals.css:3-24` |
| Copy is fully externalised to `ar.json` / `en.json` dictionaries | `EEC-MATERIAL/web/src/content/` |

The RTL, font, locale-routing, brand-token and component-primitive work a sales
page needs **already exists and is in production.** This is the single most
important architectural fact in this document (see R13).

### 2.2 There is no commercial ledger — anywhere

`empire-nexus/bots/discord-learning-bot/src/database.py:154-171` — the `members`
table is `discord_id, discord_name, telegram_id, level, track, goal, joined_at,
last_active_at, total_points, current_streak, longest_streak, status, buddy_id,
notes, gender`.

There is **no** `paid`, `tier`, `plan`, `price`, `currency`, `amount`,
`expires_at`, `renewed_at` or `payment_id` column. `level` and `track` are
pedagogical (CEFR A1–C2, "Core"), not commercial.

The entire "membership lifecycle" advertised in `STATUS.md` is **one nullable
column**, `members.suspended_at` (`database.py:114-120`), plus
`suspend_member` / `restore_member` / 60-day retention
(`database.py:6237-6340`, `RETENTION_DAYS = 60`).

Three consequences bind this spec:

1. **`suspended_at` is the enforcement layer and must remain so.** It is
   explicitly documented as the only authoritative clock; `members.status` is
   free text that no code path reads for authorisation (`database.py:6217-6222`).
   The ledger must *drive* `suspend_member`/`restore_member`, never replace them.
2. **Suspension deletes nothing** — an owner-level data guarantee dated
   2026-08-30 (`database.py:6224-6228`). Any commercial state we add inherits
   that promise.
3. **The invite codes are not entitlements.** `EEC-FREE-2026`, `EEC-PAID-2026`,
   `EMPIRE-VIP` are shared static strings in the *uncloned* assessment app
   (`empire-chronicle/SESSION_CONTINUITY.md:187`, `AUDIT_2026-07-11.md:24`).
   They carry no expiry, no seat count, no single-use semantics and no link to a
   person or a payment. "Paid" is a label on a signup form.

**Identity is also unjoined:** the bot keys on `discord_id`, the website keys on
`email` (`EEC-MATERIAL/web/src/lib/store.ts:21-41`). Only a manual `!link` /
`claim_codes` flow connects them.

### 2.3 The pattern we must not copy

`EEC-MATERIAL/web/src/app/api/waitlist/route.ts:1-46` appends a lead to
`leads.jsonl` and optionally POSTs a webhook. **Both sinks are best-effort and
non-blocking — a failed write still returns `{ok:true}`.** Acceptable for a
lead. Disqualifying for an order. R5 forbids it explicitly.

Website persistence today is a JSON file store, not a database
(`store.ts:1-19`), deliberately *"right-sized for a 15–30 cohort."*

### 2.4 Bidi tooling exists, is not wired to CI, and does not cover a sales page

Two checkers:

- `empire-nexus/bots/discord-learning-bot/scripts/bidi_check.py` — flags any
  Arabic-containing line with **≥2 embedded LTR islands**; islands under 2 chars
  are ignored unless `#`/`!`. Its own docstring confirms CI wiring is *"not yet
  done."*
- `EEC-MATERIAL/tools/audit/bidi-render-probe.mjs` — Puppeteer, measures where
  closing punctuation actually lands. Caught **796** broken lines, fixed by
  `unicode-bidi: plaintext`; **69 remain** needing editorial rewording.

**The gap that matters here:** the `unicode-bidi: plaintext` contract in
`globals.css:53-85` is scoped to `.lesson-prose` only. A new marketing page —
which is wall-to-wall mixed Arabic and Latin (`Discord`, `VIP`, `Darb`,
`InstaPay`, and every price) — inherits **no bidi handling at all**. And
`npm run bidi` probes lesson pages only.

`EEC-MATERIAL` has **no `.github` directory**, so no gate can be added there
without creating CI from scratch.

### 2.5 Scale, honestly

`STATUS.md:149` says *"17 students on A1."* `STATUS.md:216-225` says the renewal
notice reached *"15 of 16"* and two members left for good. These two counts
disagree; both are documentation claims, and per standing practice a count in a
doc is a claim until re-derived from the live database.

**Working assumption: 15–17 active students, all at A1.** Curriculum is 55 of
275 lessons finished (20%); Stage 0 is complete and Stages 1–4 have no
`materials/` directory at all (`SYSTEM-MAP.md:986-995`).

This calibrates everything. Capacity is **not** the constraint — 50 teaching
hours/week supports ~1,000 Basic students (§4.2). Demand is the constraint.
The page's job is demand generation, and the model's job is to not be
structurally broken when demand arrives.

### 2.6 The strategy docs already agree with the live prices

`strategy/01-foundational-strategy.md:304-341` §12 specifies an **Egypt tier
(EGP, high volume)** and a **Gulf/diaspora tier (USD) at 3–5× the Egypt tier for
the same program**, funded by a deliberate EGP cost base — cost arbitrage as the
strategic thesis.

The live prices independently land at **3.05×** (§4.3). The documented strategy
and the owner's instinct already match; this spec makes the ratio explicit and
maintainable instead of coincidental.

### 2.7 What the docs get wrong about the current business

`program/01-founding-cohort-offer.md` and `content/04-entry-challenge.md`
describe a **12-week founding cohort** with a 40–50% founding discount, a 7–14
day paid entry challenge, and 15–30 fixed seats.

That is not what is running. The live business is a **rolling monthly
membership** enforced by `suspended_at`, sold via a paid live assessment. The
cohort framing is stale. R3 and R4 encode the live model; reconciling the stale
docs is tracked in `tasks.md` as a separate, non-blocking cleanup.

`program/01-founding-cohort-offer.md:146-148` §10 does contain a usable
11-section sales-page skeleton. We build on it rather than reinventing it.

---

## 3. Decisions locked in this session

Owner-agreed 2026-08-31. Rationale in §4.

| # | Decision |
|---|---|
| D1 | **VIP drops from 12 × 1:1/month to 4 × 1:1/month and reprices to $199/mo.** |
| D2 | **A zero-teaching-hour "Darb" tier is added** (Discord + practice site + bot, no live session). |
| D3 | **A "Focus" mid-tier is added** — Basic plus one small-group session/week, max 8 students. |
| D4 | **Annual = 10 × monthly ("two months free") for every tier.** International Basic annual moves $250 → $300. |
| D5 | **Egypt assessment rises 100 → 300 LE and shortens to 30 minutes**; the automated placement test becomes the free step in front of the live call. |
| D6 | **Monthly intake dates** create a real enrolment deadline. |
| D7 | **Existing members are grandfathered** at their current price for their current term. |

---

## 4. The commercial model

### 4.1 The governing metric: revenue per teaching hour

Every tier is an exchange rate on the owner's calendar. Computed at 4.33
weeks/month, 20 seats per Basic group, FX anchor 50.82 EGP/USD.

**Current model, as sold today:**

| Product | Owner hours/mo | Revenue | Per teaching hour |
|---|---|---|---|
| Basic — international, monthly | 4.33 | $600 | **$139** |
| Basic — international, annual | 4.33 | $417 | **$96** |
| Basic — Egypt, monthly | 4.33 | 10,000 LE | **2,309 LE · $45** |
| Basic — Egypt, annual | 4.33 | 8,000 LE | **1,848 LE · $36** |
| Assessment — international | 1.00 | $10 | **$10** |
| **VIP — monthly (12 × 1:1)** | **12.00** | $100 | **$8.33** |
| **VIP — annual (144 × 1:1)** | **12.00** | $83 | **$6.94** |
| Assessment — Egypt | 1.00 | 100 LE | **100 LE · $1.97** |

The cheapest tier earns **20× more per hour** than the premium tier.

### 4.2 The capacity arithmetic that forces D1

At 50 teaching hours/week = **216.5 hours/month**:

- **1,000 Basic students** = 50 groups × 4.33 h = **216.5 h/month** → up to **$30,000/mo**
- **20 VIP members** (as priced today) = 20 × 12 h = **240 h/month** → **$2,000/mo**

> **20 VIP members would consume more of the owner's calendar than 1,000 Basic
> students, for 6.7% of the revenue.**

One VIP member at the old price costs 12 hours — three group slots — which is 60
Basic seats, or **$1,800/month of forgone international revenue in exchange for
$100.** VIP was not a premium tier; it was an unpriced liability that had simply
not scaled yet. At 15–17 students it is survivable. At 100 it is fatal.

### 4.3 Canonical price table (post-decision)

**This table is the single source of truth for every price in the system (R2).**

| Tier | Owner hours/mo | Egypt monthly | Egypt annual | Intl monthly | Intl annual | Seat cap |
|---|---|---|---|---|---|---|
| **Darb** — practice only, no live session | **0** | 199 LE | 1,990 LE | $12 | $120 | none |
| **Basic** — 1 group session/wk | 4.33 shared | 500 LE | 5,000 LE | $30 | $300 | 20/group |
| **Focus** — Basic + small group/wk | +4.33 shared | 1,200 LE | 12,000 LE | $69 | $690 | 8/group |
| **VIP** — Basic + 4 × 1:1/mo | +4.00 | 5,000 LE¹ | 50,000 LE¹ | $199 | $1,990 | 12 total |
| **Elite** — Basic + 8 × 1:1/mo² | +8.00 | — | — | $499 | $4,990 | 4 total |
| **Assessment** — credited on join | 0.50–0.75 | 300 LE | — | $10 | — | 6–8/wk |

¹ Offered but **not promoted** in Egypt — Egyptian 1:1 yields ~$20/teaching-hour
against $45 for an Egyptian group session, so 1:1 is a worse use of the calendar
than the cheaper tier. Egyptian buyers seeking attention are routed to Focus.

² Elite is optional and may be deferred; it exists to give VIP an anchor.

**Resulting per-teaching-hour figures:** Darb ∞ (no hours) · Basic intl $139 ·
Focus intl ~$72 marginal · VIP intl $50 · Elite intl $62. Every tier now sits
within one order of magnitude, and the premium tiers no longer invert.

### 4.4 The Egypt/international ratio is now deliberate

At the 50.82 anchor:

| Tier | Egypt price in USD | Intl price | Ratio |
|---|---|---|---|
| Darb | $3.92 | $12 | 3.06× |
| Basic | $9.84 | $30 | 3.05× |
| Focus | $23.61 | $69 | 2.92× |
| VIP | $98.39 | $199 | 2.02× |
| Assessment | $5.90 | $10 | 1.69× |

Volume tiers hold ~3× (inside the 3–5× band of `strategy/01`:308-310). The ratio
deliberately narrows on VIP and the assessment because both consume near-fixed
owner time regardless of the buyer's passport.

### 4.5 FX policy (R2.4)

- **Anchor: 50.82 EGP/USD, recorded 2026-08-31** ([Wise mid-market](https://wise.com/gb/currency-converter/usd-to-egp-rate?amount=1); 30-day average 50.35). *Rate summarised from Wise; content rephrased for compliance with licensing restrictions.*
- EGP prices are derived from a **target ratio (~3× for volume tiers)**, never
  from a live conversion.
- **Review trigger: a ±15% move from the anchor** — i.e. at ≥58.4 or ≤43.2
  EGP/USD. Review means a deliberate re-pricing decision, not an automatic one.
- Annual EGP members are **locked for their term.** This is real, accepted FX
  exposure, priced as the cost of removing eleven churn decisions.
- Prices are **never** displayed as a converted equivalent (see R1.3).

---

## 5. Requirements

### R1 — Currency and geography isolation

- **R1.1** The system SHALL present exactly **one** currency per visitor session.
  Egypt sees EGP; everywhere else sees USD.
- **R1.2** Currency SHALL be **suggested** by geo-IP and **overridable** by the
  visitor. Geo-IP SHALL NOT hard-block: VPNs are common, and Gulf residents
  browsing on Egyptian SIMs are a real segment.
- **R1.3** EGP and USD prices SHALL NEVER be rendered in the same view, and a
  price SHALL NEVER be shown as a converted equivalent of the other currency.
  *Rationale: the Egypt tier is ~⅓ of international (§4.4). A side-by-side
  toggle publishes that asymmetry to the higher-paying market for no benefit.*
- **R1.4** The chosen currency SHALL persist across navigation and SHALL be
  recorded on the resulting order.
- **R1.5** Tier enforcement SHALL be by **payment rail**, not by declaration:
  Vodafone Cash and InstaPay require an Egyptian phone or bank and therefore gate
  themselves; PayPal, crypto and the UAE account serve international.
- **R1.6** Egyptian-expatriate leakage (an Egyptian abroad paying via InstaPay to
  obtain the EGP price) SHALL be accepted, not engineered against. Terms SHALL
  state that EGP pricing is for residents of Egypt. *Rationale: the enforcement
  cost exceeds the leakage cost at any plausible volume.*

### R2 — Price integrity

- **R2.1** Every price SHALL derive from **one machine-readable source of
  truth** (a typed pricing module). No price SHALL be hard-coded in a component,
  a copy dictionary, or a payment instruction.
- **R2.2** The pricing source SHALL encode, per tier: currency, monthly amount,
  annual amount, owner-hours consumed, seat cap, promoted/unpromoted flag.
- **R2.3** A build-time check SHALL fail if any annual price ≠ 10 × monthly (D4),
  so the discount policy cannot drift back into three different accidents.
- **R2.4** The FX anchor, its date, the target ratio and the review trigger
  (§4.5) SHALL live beside the prices as data, not prose.
- **R2.5** A build-time check SHALL fail if any price rendered in the UI has no
  corresponding entry in the pricing source.

### R3 — Tier and capacity model

- **R3.1** The system SHALL implement exactly the tiers in §4.3.
- **R3.2** Seat caps SHALL be **real and enforced**, not decorative: 20/Basic
  group, 8/Focus group, 12 VIP total, 4 Elite total, 6–8 assessments/week.
- **R3.3** Remaining capacity MAY be displayed, and if displayed SHALL be derived
  from actual ledger counts. Fabricated or decorative scarcity is forbidden
  (§R9.2).
- **R3.4** The VIP tier SHALL record owner-hours consumed per member so calendar
  load is queryable before it is felt.
- **R3.5** The model SHALL remain a **rolling monthly membership**, not a cohort
  (§2.7). Deadline pressure comes from monthly *intake dates* for live-session
  groups (D6), not from rebuilding the product as fixed-term cohorts.
- **R3.6** Grandfathering (D7) SHALL be representable: an existing member keeps a
  price that no longer appears in the public table, for a defined term.

### R4 — The paid-assessment funnel

- **R4.1** The paid live assessment SHALL remain the primary entry point, and its
  fee SHALL be **credited in full** against the first membership payment on join.
- **R4.2** The fee SHALL be 300 LE (Egypt, 30 min) / $10 (international, 45 min).
- **R4.3** The **automated placement test SHALL be offered free, ahead of** the
  live call. *Rationale: it already exists (`STATUS.md:155-160`, `!placement` →
  adaptive 4-skill CEFR profile) and converts a 60-minute owner cost into ~25
  minutes, roughly tripling funnel throughput on the same calendar.*
- **R4.4** Assessment slots SHALL be capped and bookable only in defined windows,
  so assessments can never silently consume teaching capacity.
- **R4.5** Every assessment SHALL be recorded in the ledger with outcome and
  whether it converted, so close rate becomes measurable for the first time.

### R5 — Assisted checkout

All five payment rails are manual; none supports automated card capture, and
Stripe is unavailable to an Egyptian entity (`SESSION_CONTINUITY.md:306-309`).
"Sells directly" therefore means **assisted checkout**, which must feel like
checkout while remaining human-approved.

- **R5.1** Flow: currency → tier → term (annual preselected) → identity form →
  rail-specific instructions → payment proof → confirmation.
- **R5.2** Each order SHALL receive a **unique human-quotable reference code**.
  *Rationale: Vodafone Cash and InstaPay transfers arrive with no order context.
  Without a reference, reconciliation is unsolvable past a handful of members.*
- **R5.3** Order persistence SHALL be **synchronous, durable, and fail loudly.**
  An order SHALL NOT be reported successful unless it is committed. This
  explicitly forbids the `api/waitlist` best-effort pattern (§2.3).
- **R5.4** Order writes SHALL be idempotent under retry and double-submit.
- **R5.5** Payment-proof upload SHALL be one tap on mobile, SHALL accept common
  image formats, and SHALL enforce a size limit. A **WhatsApp fallback carrying
  the reference code** SHALL be available at every step.
- **R5.6** The human approval gate SHALL be preserved. No flow may auto-grant
  access on unverified proof.
- **R5.7** Payment identifiers (the Vodafone Cash number, account details) SHALL
  NOT be present in publicly served markup before an order exists.
  *Rationale: a payment number on a public high-traffic page invites
  impersonation — a third party can screenshot the page with their own number
  substituted.*
- **R5.8** EGP installments (2–3 scheduled transfers, per
  `program/01`:86) SHALL be representable for annual and Focus/VIP tiers.
- **R5.9** Real card checkout (Paymob/Fawry for Egypt; a merchant-of-record such
  as Paddle for international) is explicitly **out of scope for v1** and SHALL
  NOT be designed around.

### R6 — The commercial ledger (highest priority — see §1.1)

- **R6.1** The system SHALL persist a durable order/membership record: person
  identity, contact, country, currency, tier, term, amount, rail, reference code,
  proof reference, paid-at, period start, period end, status, source.
- **R6.2** The ledger SHALL be the commercial record of truth. It SHALL NOT
  duplicate or contradict `members.suspended_at`, which remains the **access**
  record of truth (§2.2).
- **R6.3** Verifying a payment SHALL be able to drive `restore_member`; a lapsed
  period SHALL be able to drive `suspend_member`. Both SHALL be **owner-triggered
  and reversible**, never silent.
- **R6.4** The ledger SHALL carry the **`email` ↔ `discord_id` join** that does
  not exist today (§2.2), and SHALL tolerate a member existing on one side only.
- **R6.5** The ledger SHALL support **backfilling the 15–17 current members**
  before any public launch, so the 2 September cycle is not run blind.
- **R6.6** Grandfathered prices (D7, R3.6) SHALL be stored per member, not
  inferred from the current public table.
- **R6.7** No raw payment credential, card data or full account number SHALL be
  stored. Reference identifiers only.

### R7 — Access provisioning

- **R7.1** On verification the buyer SHALL receive Discord access, practice-site
  access appropriate to their tier, and a welcome sequence.
- **R7.2** The Darb tier SHALL grant practice + community access and **no live
  session**, enforced technically rather than by convention.
- **R7.3** Provisioning SHALL be idempotent — re-verifying SHALL NOT duplicate
  access, invites, or ledger rows.
- **R7.4** Any new student-facing behaviour SHALL sit behind a feature flag
  registered in `empire-nexus/src/flag_registry.py` in the same commit that
  creates it, per standing project discipline. Flags fail closed.

### R8 — Measurement

The owner currently has no close rate, no churn figure and no
Egypt/international split. Without these the page cannot be evaluated.

- **R8.1** The funnel SHALL be counted end to end: page view → currency chosen →
  tier viewed → placement test started/finished → assessment booked → assessment
  paid → assessment attended → order created → payment verified → access granted.
- **R8.2** Retention SHALL be measurable per member at 30 / 60 / 90 days and by
  monthly cohort.
- **R8.3** Revenue SHALL be reportable split by currency, tier and term.
- **R8.4** **Owner-hours consumed per tier SHALL be reportable**, so §4.1 can be
  recomputed from real data instead of assumptions.
- **R8.5** Analytics SHALL be self-hosted or cookieless. No third-party
  marketing tracker, consistent with the zero-paid-dependency constraint.
- **R8.6** A green build SHALL NOT be treated as evidence the model works. The
  acceptance evidence for this spec is ledger data, not passing tests.

### R9 — Copy, voice and honesty

`EEC-MATERIAL/materials/_style/empire-style-guide.md` is the declared source of
truth and wins any disagreement. It constrains **claims**, not **craft**.

- **R9.1** Copy SHALL obey GC-5: promise *"clear, confident, neutral American
  accent."* The words **"native"** and any *"fluent in X days"* construction SHALL
  NOT appear. Level language SHALL always be *"CEFR-aligned, not certified"*
  (`STATUS.md:143`).
- **R9.2** No hype mechanics: no fabricated countdowns, no fake seat counts, no
  invented "was" prices, no unearned testimonials. Scarcity SHALL be real and
  derived (R3.3). *"Academy not influencer"* (§3 of the guide).
- **R9.3** "Stunning" SHALL be delivered by **demonstration, not assertion** —
  the page SHALL let a visitor *hear* and *try* the system rather than read
  adjectives about it. The verifiable assets are unusually strong: 6,948 site
  pages, 1,095 committed broadcast clips, 9,360 speech clips, a live adaptive
  CEFR placement test, and pronunciation scoring (`STATUS.md`, `SYSTEM-MAP.md`).
  Interactive proof is both more persuasive than copywriting and the only route
  that satisfies R9.1 and R9.2 simultaneously.
- **R9.4** Visual language SHALL be the existing royal + gold system with
  *"restraint and dignity, never gaudy"* (guide §3), reusing the deployed tokens
  (§2.1) rather than introducing a second palette.
- **R9.5** Arabic register: **Egyptian colloquial on the EGP path** (per guide
  §1), **light MSA on the USD path** for Gulf and diaspora buyers, to whom heavy
  Egyptian idiom reads as foreign. The currency isolation in R1.1 makes this free
  to implement. *This is a narrow extension of guide §4 and SHALL be written into
  the guide in the same pull request — the guide is amended, never ignored.*
- **R9.6** Cultural specificity per guide §5 — Cairo, Alexandria, InstaPay, Gulf
  work and travel. Never generic.
- **R9.7** All copy SHALL live in the `ar.json` / `en.json` dictionary pattern
  already established (§2.1), never inline in components.

### R10 — Arabic, RTL and bidi correctness

- **R10.1** Arabic SHALL be the default and canonical conversion path; English
  SHALL be a secondary surface.
- **R10.2** The page SHALL carry an explicit `unicode-bidi: plaintext` +
  `text-align: start` contract. It SHALL NOT rely on the existing
  `.lesson-prose` scoping, which does not apply to marketing pages (§2.4).
- **R10.3** Directional CSS SHALL use logical properties (`start`/`end`,
  `margin-inline`), never `left`/`right`.
- **R10.4** Every price, currency symbol, product noun and Latin token embedded
  in Arabic SHALL render through **one shared isolating component**, so no
  Arabic line ever carries 2+ raw LTR islands — the exact condition
  `bidi_check.py` flags.
- **R10.5** Prices SHALL use Western digits (500, not ٥٠٠) for scan speed and
  cross-property consistency.
- **R10.6** No Arabic line SHALL open in one script and be mostly the other
  (guide §4). Mixed content SHALL use table rows or line pairs.
- **R10.7** **A bidi check SHALL run in CI and SHALL fail the build.** Both
  existing checkers are currently manual (§2.4); this is the first place the gate
  becomes automatic.
- **R10.8** RTL rendering SHALL be verified on real mobile viewports, not only in
  a desktop browser at reduced width.

### R11 — Performance and mobile

- **R11.1** Mobile-first is a hard requirement, not a courtesy: the audience is
  overwhelmingly mobile, frequently on constrained Egyptian mobile data.
- **R11.2** A performance budget SHALL be defined and enforced in CI (transfer
  size and Largest Contentful Paint on a mid-tier Android over throttled 4G).
- **R11.3** The Arabic webfont SHALL be subset, and SHALL NOT block first paint.
- **R11.4** The page SHALL be usable with JavaScript degraded; the WhatsApp
  fallback (R5.5) SHALL work without it.
- **R11.5** The deployment SHALL fit the existing 512 MB / 0.75 CPU envelope on a
  4 GB box already running ~10 containers. The $7/month infrastructure ceiling
  and zero-paid-dependency rule are hard constraints.

### R12 — Security and privacy

- **R12.1** No secret SHALL be committed. Reference env var names or server paths
  only. *This project's history includes real leaked credentials
  (`docs/INCIDENT-2026-08-29-ops-bot-token.md`); a secret in history is an
  incident requiring rotation, not a file deletion.*
- **R12.2** Uploaded payment proofs contain financial PII. They SHALL NOT be
  served from a public path. *Everything under `web/public/` is world-readable at
  a guessable URL — this is exactly how the Teacher's Edition PDF stayed
  downloadable after being "moved" (`DEPLOY.md:130-147`).*
- **R12.3** Proof upload SHALL validate type and size and SHALL treat every
  upload as untrusted.
- **R12.4** Order and admin endpoints SHALL be rate-limited and abuse-resistant.
- **R12.5** A retention policy for orders and proofs SHALL be defined, coherent
  with the existing 60-day member retention policy.
- **R12.6** Admin/verification surfaces SHALL fail closed on authorisation,
  matching the existing `isTeacher()` posture.

### R13 — Deployment

- **R13.1** The sales page SHALL be served on the root domain
  `empireenglish.online`.
- **R13.2** It SHALL reuse the deployed design tokens, Cairo font, locale
  routing, RTL configuration and UI primitives (§2.1) rather than duplicating
  them. A second, divergent design system on the same domain is a defect.
- **R13.3** Deployment SHALL be reversible with a documented rollback, and SHALL
  respect the `rsync -a --delete` discipline — `cp -r` cannot remove a
  repo-deleted file and has already caused one real exposure (`DEPLOY.md:84-104`).
- **R13.4** The existing portal, coursebook gating and waitlist SHALL keep
  working. Any hostname or route change SHALL be enumerated with its redirects
  before execution.
- **R13.5** **Open decision — see §6.O1.** The owner asked for a *"completely
  new, separate repo"* on the root domain. The root hostname is already bound to
  `eec-web` (§2.1), so these two instructions cannot both be satisfied without a
  deliberate migration. Resolve O1 before `design.md` is finalised.

### R14 — Out of scope for v1

Automated card checkout (R5.9) · a self-serve public `/register` on the root site
· B2B/corporate invoicing · the referral mechanic (designed later, but the ledger
SHALL leave room for a source/referrer field) · migrating the JSON store to a
database engine · Stages 1–4 curriculum · testimonials, which the owner will
supply at the end (they are a content dependency, not a build dependency — but
R9.2 forbids placeholder proof, so the section SHALL ship hidden rather than
filled with invented quotes).

---

## 6. Open decisions

### O1 — Repo and hostname (blocking `design.md`)

The owner specified a **new separate repo** *and* the **root domain**. The root
domain is already served by `EEC-MATERIAL/web/` via a Cloudflare Tunnel ingress
bound to that exact hostname. Three coherent resolutions:

| Option | What happens | Cost | Risk |
|---|---|---|---|
| **A — new repo takes the root domain** *(matches the instruction literally)* | `empire-agora` becomes the marketing site at `empireenglish.online`; the existing app moves to `portal.empireenglish.online`. Marketing and product cleanly separated, as most companies do. | One tunnel ingress change, one DNS route, redirects for `/ar`, `/en`, `/cohort`, `/waitlist`; portal users re-bookmark. | Medium — touches live routing for a working site. |
| **B — build in `EEC-MATERIAL/web`** *(recommended)* | New route `/[locale]/join` (and a rebuilt home). Inherits locale routing, RTL, Cairo, tokens, primitives, tunnel — nothing new to wire. | Near zero infra work. | Low. Not a new repo, so it contradicts the stated instruction. |
| **C — new repo on a subdomain** | `join.empireenglish.online`. | New ingress + DNS. | Low infra risk, but splits the brand across hostnames and weakens the root domain — the weakest option commercially. |

**Recommendation: B**, on the evidence that every asset a stunning Arabic RTL
sales page needs is already built and deployed in `EEC-MATERIAL/web`, and R13.2
forbids duplicating it. **A** is the right answer if the intent is that marketing
and product should be separate properties long-term — a legitimate architectural
preference, at a real but bounded migration cost. This spec is written to be
implementable under either.

### O2 — Tier names (non-blocking)

Proposed, Arabic-primary, avoiding collision with the CEFR stage ranks (Recruit /
Citizen / Legionary / Confident / Sovereign) already defined in guide §2:

| Tier | Arabic | Note |
|---|---|---|
| Practice-only | **دَرْب** | Reuses the existing practice-site brand — the tier *is* Darb access |
| Basic | **الأساس** | |
| Focus | **التركيز** | |
| VIP | **VIP** | Retained; `EMPIRE-VIP` already exists as an invite code |
| Elite | **النخبة** | Only if Elite ships |

### O3 — Elite tier: ship in v1 or defer?

It exists mainly as a price anchor for VIP. Deferring costs little.

### O4 — Does the owner want the 2 September renewal cycle run against a
backfilled ledger (R6.5), or run as-is with the ledger following?

Running it blind is survivable at 15–17 members and unrecoverable later, because
the question "who paid in August?" becomes permanently unanswerable.

---

## 7. Traceability

Implements the unchecked deliverable at
`EEC-MATERIAL/program/01-founding-cohort-offer.md:166` ("offer/sales page +
checkout") and the pricing sheet at :168. Realises the two-tier EGP/USD strategy
of `strategy/01-foundational-strategy.md` §12. Builds on the §10 sales-page
skeleton. Supersedes the cohort-based commercial framing of `program/01` §6 and
`content/04` in favour of the rolling monthly membership actually in production
(§2.7). Depends on `empire-nexus` `suspend_member`/`restore_member` as the access
enforcement layer, and on the existing adaptive placement test as the free
funnel step.
