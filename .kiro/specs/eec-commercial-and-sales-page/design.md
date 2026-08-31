# EEC Commercial Model & Sales Page — Design

> **Status (2026-08-31):** DESIGN — nothing built. Companion to `requirements.md`
> (read that first). Resolves O1 as **Option A** (separate repo, root domain),
> O2/O3 as approved, O4 as **defer the accounting system** — with one
> qualification in §7.3 that the owner must read.
>
> Visual direction is derived from a live inspection of
> `assessment.empireenglish.online` on 2026-08-31 (measured colour frequencies,
> DOM, and screenshots in `.kiro/artifacts/screenshots/`), **not** from
> description.

---

## 1. The central design tension, and how it resolves

Three sources disagree about what EEC looks and sounds like:

| Source | Says |
|---|---|
| `empire-style-guide.md` §3 (declared source of truth) | royal-blue `royal-900/950` + `gold-500`; *"premium, uncluttered, academy not influencer"*; *"restraint + dignity, never gaudy"* |
| The live root domain (`EEC-MATERIAL/web/globals.css:3-24`) | royal purple `#2e1065` + gold `#f5b301` |
| **`assessment.empireenglish.online`** (what the owner asked us to match) | near-black `#0a0a0a` / `#111118` + antique gold `#c9a84c` + bronze `#cd7f32` + parchment `#e8e0d0`; engraved serif small-caps; crest; particle atmosphere; cinematic entry gate; sound |

The owner's instruction is explicit: match the assessment app. So **the assessment
app's visual language becomes the public brand**, and this spec treats that as the
new canonical direction.

Two consequences the owner needs to accept:

1. **`empire-style-guide.md` §3 becomes wrong** the moment this ships. It must be
   amended in the same pull request (see `tasks.md` Phase 0). The guide's rule
   that *"the guide wins"* is respected by **amending** it, never by ignoring it.
2. **The portal will visually diverge.** Under Option A the portal moves to
   `portal.empireenglish.online` and keeps royal purple until it is rethemed
   (deferred, tracked in Phase 6). Marketing and product looking different for a
   while is the accepted cost of Option A.

**What does not change:** the guide's *honesty* rules (§1 / GC-5) and its
*restraint* principle are behavioural, not chromatic, and survive intact. Dark
and gold is not permission to be gaudy, and it is not permission to write hype.

---

## 2. Visual system

### 2.1 Tokens (derived from measured usage on the assessment app)

Colour frequency in the live document, highest first: `#c9a84c` (99
occurrences), `#8b7355` (54), `#e8e0d0` (14), `#1a1a2e` (14), `#111118` (14),
`#cd7f32` (12), `#0a0a0a` (7), plus `#c9a84c` at 15/20/40/50/60% alpha for glows
and borders. That distribution *is* the design system; we formalise it:

```css
@theme {
  /* Surfaces — darkest to lightest */
  --color-obsidian:      #0a0a0a;  /* page base */
  --color-obsidian-2:    #111118;  /* raised surface */
  --color-midnight:      #1a1a2e;  /* card / elevated panel */

  /* Accent — the empire's gold */
  --color-gold:          #c9a84c;  /* primary accent, borders, rules */
  --color-gold-bright:   #e8d48b;  /* gradient highlight, top of text fill */
  --color-gold-deep:     #d4b55c;
  --color-bronze:        #cd7f32;  /* tertiary accent, secondary rank marks */

  /* Text */
  --color-parchment:     #e8e0d0;  /* primary text on dark */
  --color-bronze-muted:  #a08a68;  /* secondary text — SEE 2.2, lightened */

  /* Semantic aliases (components use these, never raw colours) */
  --color-surface:       var(--color-obsidian-2);
  --color-text:          var(--color-parchment);
  --color-text-muted:    var(--color-bronze-muted);
  --color-accent:        var(--color-gold);
  --color-hairline:      color-mix(in srgb, var(--color-gold) 20%, transparent);
}
```

Signature treatments to carry over: **gold gradient text fill** on display
headings (`gold` → `gold-bright`), **gold-gradient primary button with a soft
outer glow**, **outlined-gold secondary button**, **hairline gold rules** above
and below section eyebrows, thin gold **card borders at 20% alpha**, and a
**radial vignette** with sparse gold particles as page atmosphere.

### 2.2 One accessibility correction we are making deliberately

The assessment app's secondary text colour `#8b7355` on `#0a0a0a` measures
**4.43:1** contrast — just below the WCAG AA 4.5:1 threshold for body text. On a
sales page read on phones in daylight, that is a conversion problem before it is
a compliance problem.

**Decision: secondary text uses `#a08a68` (≈6.2:1).** `#8b7355` is retained only
for large display text and decorative rules, where AA Large (3:1) applies. This
is a deliberate, documented divergence from the source — matching the *feel*, not
propagating a defect.

### 2.3 Typography — the part that cannot be copied

The assessment app sets everything in an engraved Latin serif (Cinzel/Trajan
family) in letterspaced small caps. **Arabic cannot be set in that face.** And on
our page Arabic is not a secondary label in the nav — it is the primary language
of the entire document (R10.1). This is the single largest design translation
required.

| Role | Face | Rationale |
|---|---|---|
| Arabic display (headings, tier names, prices) | **Reem Kufi** | Geometric Kufi with monumental, architectural weight. Reads *imperial*, not *devotional* — the correct register for a commercial page. Pairs credibly with engraved Latin caps. |
| Arabic body | **Cairo** | Already loaded and subset in the ecosystem (`layout.tsx:1-58`); zero new cost; highly legible on low-end Android. |
| Latin display (`EMPIRE ENGLISH`, `VIP`, English headings) | **Cinzel** | Matches the assessment app's engraved caps directly. |
| Latin body / numerals / prices | **Cairo** (latin subset) | One face for all body text keeps the payload down and numerals consistent. |

**Rejected: Amiri and Aref Ruqaa.** Both are beautiful classical Naskh, but at
display size they carry strong religious/manuscript connotations that misread on
a commercial offer page.

Budget discipline (R11.3): Reem Kufi is loaded **only** for display, subset to
the actual glyphs used, `font-display: swap`, self-hosted. Cinzel is subset to
Latin caps and digits. Total added font payload target **≤ 45 KB**.

### 2.4 What we deliberately do NOT copy from the assessment app

This list is as important as the tokens.

| Not copied | Why |
|---|---|
| **The cinematic entry gate** (`ACTIVATE EXPERIENCE` / `Enter silently`) | An interstitial between a paid visitor and the offer. It adds a required tap, delays LCP past the hero, and on Egyptian mobile data it is where the session ends. A sales page's first paint must be the promise and the price path. |
| **Sound / the audio toggle** | Unrequested audio on a commercial page erodes trust and is hostile on mobile. Audio on our page is **opt-in and diegetic** — the visitor presses play to hear a student's before/after (§4.2), which is proof, not ambience. |
| **Scroll-reveal-gated content** | Verified: programmatic scroll screenshots of the live app return blank frames, i.e. section content is `opacity: 0` until an IntersectionObserver fires. That means no content without JS, and nothing for a crawler or a slow connection. Our reveals are **progressive enhancement only** — content is present and legible with JS disabled (R11.4). |
| **`Recruit / Initiate / Warrior / Champion`** | These are the assessment app's four test bands. The style guide defines a *different* five-rank ladder (Recruit / Citizen / Legionary / Confident / Sovereign) mapped to CEFR A1–C1. Two live rank systems is a real inconsistency — see §12 R-4. The sales page uses the **CEFR-aligned guide ranks**, because a buyer is buying a path, not a test result. |
| **`A GLOBAL MOVEMENT` + nine country flags + "battle stories"** | With 15–17 students (`requirements.md` §2.5), "global movement" is not yet earned. R9.2 forbids unearned proof. We ship a proof section that is **honest at current scale** and grows. |

---

## 3. Information architecture

Ordered for a mobile Arabic reader, and built on the existing 11-section skeleton
at `program/01-founding-cohort-offer.md:146-148` rather than reinventing it.

| # | Section | Job | Notes |
|---|---|---|---|
| 1 | **Hero** | Crest · honest headline · one-line subhead · primary CTA *"ابدأ اختبار المستوى — مجانًا"* · secondary *"اعرف الأسعار"* | Currency chip top-corner, auto-suggested, tappable (R1.2). LCP element = the headline text, not an image. **No gate.** |
| 2 | **The 30-second proof** | The "stunning" moment: press play, hear a real student before → after | Interactive, opt-in audio. Drawn from the 1,095 committed broadcast clips / 9,360 R2 speech clips. **Gated on the owner supplying two consented clips** — ships hidden if absent (R9.2). |
| 3 | **Why it hasn't worked before** | Name the real reason in Egyptian colloquial: input without output | Three short lines. No villain-bashing, no hype. |
| 4 | **The system — three layers** | Justify a 20-person group session honestly | **The retention-critical section.** Reps happen async and unlimited on Darb + the bot; the live hour is *correction and accountability*, not the only practice. Sets a truthful expectation and prevents month-2 churn (`requirements.md` §4 / R9.3). |
| 5 | **Try it right now** | 1–2 real placement questions inline | Zero-friction interactive demo that flows into the free adaptive placement test (R4.3). This is the actual front door of the funnel. |
| 6 | **What you get** | Deliverable grid, tier-agnostic | Discord, Darb, weekly live session, CEFR profile, certificate wording *"CEFR-aligned, not certified"*. |
| 7 | **Plans** | The commercial core | One currency only (R1.3). **Annual preselected.** `التركيز` marked most-chosen. Real remaining seats from the ledger (R3.3). VIP shows its 12-seat cap. `النخبة` present as the anchor. `دَرْب` as the low-friction entry. |
| 8 | **How joining works** | Remove anxiety about manual payment | Four steps: free placement test → paid assessment (fee credited) → choose a plan → pay and get access. Explicitly states a human verifies payment and how long that takes. |
| 9 | **Who is behind this** | Credibility | **Founder photos here** (§8). |
| 10 | **Proof** | Testimonials / before-after | Shell built, **hidden until real content exists**. Never placeholder quotes. |
| 11 | **The guarantee** | Risk reversal | *Attend the first two sessions; if it is not for you, the remainder of the month is refunded.* Bounded exposure, large conversion effect. |
| 12 | **FAQ** | Kill the top objections | Payment rails, timezone (Gulf +1/+2 from Cairo — existing session times already work), absolute-beginner anxiety, accent honesty, refunds, missed sessions, Egypt-vs-abroad pricing. |
| 13 | **Final CTA** | Convert the scrollers | Restate the offer + WhatsApp. |
| 14 | **Footer** | Terms · IP · Privacy · social | Mirrors the assessment app's `Terms` / `IP` nav so the properties feel related. |

Plus a **sticky mobile CTA bar** appearing after section 2: current currency,
cheapest entry price, and one button.

---

## 4. Currency isolation

- Suggested from Cloudflare's `CF-IPCountry` header at the edge: `EG` → EGP,
  everything else → USD (R1.2).
- Persisted in a first-party cookie plus the URL (`?c=egp|usd`) so a shared link
  keeps its currency.
- **A hard invariant, enforced by a test:** no rendered document may contain both
  a `LE`/`ج.م` price and a `$` price (R1.3). This is checked in CI by scanning the
  rendered output of every route in both currency states.
- The override is a small, non-promotional control reading *"أدفع من مصر"* /
  *"I pay from outside Egypt"* — a factual statement about payment origin, which
  is what actually determines the rail (R1.5), rather than a claim about identity.

---

## 5. Pricing as a typed source of truth

One module, `src/commerce/pricing.ts`, is the only place a number exists (R2.1):

```ts
export type Currency = "EGP" | "USD";
export type TierId = "darb" | "asas" | "tarkeez" | "vip" | "nukhba";

export interface TierPrice {
  monthly: number;
  annual: number;          // invariant: === monthly * 10  (D4, R2.3)
}

export interface Tier {
  id: TierId;
  nameAr: string;          // دَرْب · الأساس · التركيز · VIP · النخبة
  ownerHoursPerMonth: number;   // 0 for darb — the whole point of the tier
  liveGroupSessionsPerWeek: number;
  oneToOnePerMonth: number;
  groupSeatCap: number | null;
  totalSeatCap: number | null;  // 12 for vip, 4 for nukhba
  promoted: Record<Currency, boolean>;  // vip.EGP = false (unpromoted, §4.3)
  price: Record<Currency, TierPrice>;
}

export const FX_ANCHOR = {
  egpPerUsd: 50.82,
  recordedOn: "2026-08-31",
  source: "Wise mid-market",
  targetEgyptRatio: 3.0,        // volume tiers ≈ 1/3 of international
  reviewIfMovesBeyondPct: 15,   // review at >= 58.4 or <= 43.2
} as const;
```

Three build-time gates (R2.3, R2.5, and the D4 policy):

1. `annual === monthly * 10` for every tier and currency — the annual discount
   cannot silently drift back into three different accidents.
2. Every price string rendered in the UI resolves to a `pricing.ts` entry.
3. `promoted.EGP === false` for `vip` — so the unpromoted-in-Egypt decision
   (`requirements.md` §4.3 note 1) cannot be undone by editing a component.

---

## 6. Assisted checkout

### 6.1 Flow

```
/[locale]/join
  → currency (pre-suggested)
  → tier
  → term (annual preselected)
  → identity: name · WhatsApp · email · country · Discord username
  → rail choice   EGP: Vodafone Cash | InstaPay
                  USD: PayPal | crypto | bank transfer (EG or UAE)
  → ORDER CREATED  → reference code issued, durably committed
  → payment instructions (revealed only now — R5.7)
  → proof upload (one tap) or WhatsApp handoff carrying the code
  → "received, a human verifies within X hours"
```

### 6.2 The reference code

Format `EEC-YYMM-<TIER><CUR>-<4>`, e.g. **`EEC-2609-ASEG-7K3Q`**.

Human-quotable over WhatsApp and over the phone; encodes month, tier and
currency so the owner can eyeball-match a Vodafone Cash SMS to an order without
opening anything. The 4-character suffix uses an unambiguous alphabet (no `0`,
`O`, `1`, `I`). Without this, reconciliation across five manual rails is
unsolvable (R5.2).

### 6.3 Order creation is synchronous and fails loudly

`POST /api/orders` **must** commit before it returns success. This explicitly
rejects the pattern in `api/waitlist/route.ts:1-46`, which returns `{ok:true}`
even when the write failed (`requirements.md` §2.3). A lead may be lost; an order
may not.

Idempotency (R5.4): the client sends a generated `Idempotency-Key`; a repeat
returns the original order and reference code rather than creating a second one.

### 6.4 Payment details are never in public markup

Rail instructions — including the Vodafone Cash number — are returned only in the
authenticated-by-reference response *after* an order exists (R5.7). A payment
number sitting in the HTML of a high-traffic public page is an impersonation
vector: a third party can screenshot the page with their own number substituted
and collect real payments.

---

## 7. Storage

### 7.1 Orders (`orders` table)

`id · reference_code · created_at · locale · currency · tier · term · amount ·
rail · name · whatsapp · email · country · discord_username · idempotency_key ·
status · proof_key · verified_at · verified_by · period_start · period_end ·
source · referrer · notes`

`status`: `created → proof_submitted → verified → active → lapsed`, plus
`cancelled` and `refunded`.

### 7.2 Proofs

Payment screenshots are financial PII (R12.2). They go to **R2** under a
non-guessable key, are **never** served from a public path, and are readable only
through an authenticated owner endpoint. Nothing goes in `public/` — that is
exactly how the Teacher's Edition PDF stayed downloadable after being "moved"
(`DEPLOY.md:130-147`).

### 7.3 The O4 qualification the owner must read

The instruction was *"proceed as-is for now; we will build a proper accounting
system later."* Applied precisely, that means:

**Deferred, as instructed** — backfilling the 15–17 existing members; the full
accounting/billing system; automatic reconciliation onto
`suspend_member`/`restore_member`; renewal automation; revenue reporting.

**Not deferrable** — durable recording of *new* orders arriving from this page.
A checkout that does not record its orders is not a checkout; it is a form that
loses money. §7.1 is therefore the **minimum viable record**, not the accounting
system: an append-only, exportable set of order rows that the future accounting
system imports as history.

The practical consequence of deferring the rest: **August 2026 revenue and the
current members' payment history remain permanently unreconstructable**, and the
2 September cycle runs on memory. That is an accepted, informed cost — recorded
here so it is a decision on the record rather than an omission discovered later.

---

## 8. The founder photos

Four are being supplied. Recommendation: **use two.** More than two on a sales
page reads as a personal brand page rather than an academy, which cuts against
*"academy not influencer."*

| Placement | Photo | Treatment |
|---|---|---|
| §9 *Who is behind this* | The strongest formal portrait | Primary. Portrait crop, thin gold hairline border, subtle warm grade to sit inside the obsidian/gold palette. Beside 3–4 short honest credibility lines. |
| §4 *The system* or §8 *How joining works* | A candid teaching/working shot | Secondary, smaller, supporting — evidence that a real person runs the sessions. |

Not in the hero: a photo there competes with the crest, pushes the price path
below the fold, and makes the LCP element an image instead of text.

All images: `next/image`, explicit dimensions to prevent layout shift, AVIF with
WebP fallback, `loading="lazy"` for everything below the fold, and a hard budget
of **≤ 120 KB each** after encoding. Faces must survive a 360 px-wide viewport.

---

## 9. Arabic, RTL and bidi

- `<html lang="ar" dir="rtl">` by default; the `en` surface is `ltr` (R10.1).
- **An explicit `unicode-bidi: plaintext; text-align: start` contract scoped to
  this page's content**, because the existing contract in `globals.css:53-85` is
  scoped to `.lesson-prose` and does not reach marketing pages
  (`requirements.md` §2.4). This is the single most likely source of embarrassing
  visual bugs on this page.
- **Logical properties only** — `margin-inline-start`, `padding-inline`,
  `inset-inline`, `border-start-*`. No `left`/`right` anywhere (R10.3).
- **One isolating primitive** for every embedded Latin token (R10.4):

```tsx
// Wraps prices, product nouns (Discord, VIP, Darb, InstaPay, PayPal) and codes
// so an Arabic line never carries 2+ raw LTR islands — the exact condition
// bidi_check.py flags.
export function Ltr({ children }: { children: React.ReactNode }) {
  return <bdi dir="ltr" className="inline-block">{children}</bdi>;
}
```

- All prices render through a single `<Price tier currency term />` component that
  wraps its output in `<Ltr>` and pulls from `pricing.ts`. No price is ever typed
  into copy.
- Western digits (R10.5). Copy lives only in `ar.json` / `en.json` (R9.7).
- **CI gate (R10.7):** a port of `bidi_check.py`'s rule — flag any
  Arabic-containing line with ≥2 LTR islands — run against the copy dictionaries,
  plus a Puppeteer punctuation-position probe against the rendered routes,
  modelled on `tools/audit/bidi-render-probe.mjs`. **This is the first time either
  check runs automatically anywhere in the ecosystem.**

---

## 10. Performance budget (enforced in CI — R11.2)

| Metric | Budget |
|---|---|
| HTML + CSS + JS transferred, initial route | **≤ 150 KB** compressed |
| Added font payload | **≤ 45 KB** (§2.3) |
| LCP, mid-tier Android, throttled 4G | **≤ 2.5 s** |
| CLS | **≤ 0.05** |
| Usable with JS disabled | Content readable; WhatsApp path works (R11.4) |

The atmosphere effects (vignette, particles) are CSS-only or a single tiny
canvas, `prefers-reduced-motion` respected, and never on the critical path.

---

## 11. Stack and deployment

### 11.1 Repository

New repo **`empire-agora`** (Option A), following
`empire-chronicle/docs/NEW-REPO-TEMPLATE.md` on day one: `.kiro/steering/project-rules.md`
pointing at the memory hub, a README, and a day-one `.gitignore` (`.env`,
`.env.*` with `!.env.example`, `node_modules/`, `.next/`, `out/`, OS files).
Registered in `empire-chronicle`'s repo map in the same session.

*Name rationale: agora — the public square where the offer is made. Consistent
with nexus / dojo / oracle / scribe / herald / chronicle / forge.*

```
empire-agora/
├─ .kiro/{steering,specs}/
├─ src/
│  ├─ app/[locale]/{page,plans,join,thanks}/
│  ├─ app/api/orders/route.ts
│  ├─ commerce/{pricing.ts,reference.ts,orders.ts}
│  ├─ components/{ui,Price,Ltr,TierCard,Checkout}/
│  ├─ content/{ar.json,en.json}
│  └─ i18n/
├─ scripts/{bidi-check.mjs,price-invariants.mjs,currency-isolation.mjs}
└─ .github/workflows/ci.yml
```

### 11.2 Hosting — a recommendation that deviates from the VPS default

The obvious path is another Docker container on the VPS beside `eec-web`. **I
recommend against it**, for a measurable reason: the box is a 2 vCPU / 4 GB
Hetzner CX23 already running ~10 containers, and `eec-web` alone is capped at
512 MB. Adding a second Next.js server to serve *static marketing content* buys
nothing and spends the scarcest resource on the box.

**Recommended: Cloudflare Pages + Pages Function + D1 + R2.**

| Concern | Resolution |
|---|---|
| Precedent | `empire-dojo` already deploys to Cloudflare Pages with 7 working workflows |
| Static marketing content | Served at the edge — materially faster for Egypt and the Gulf than a single Helsinki origin behind a tunnel hop |
| `POST /api/orders` | A Pages Function |
| Order rows | **D1** (SQLite at the edge, free tier) |
| Payment proofs | **R2** — already in the stack, already holding 9,360 speech clips |
| VPS memory | Zero added |
| Cost | £0. Satisfies the $7/month ceiling and the zero-paid-dependency rule |
| Root domain | A DNS change from the tunnel CNAME to Pages — *simpler and lower-risk than editing tunnel ingress* |

Fallback if the owner prefers everything on one box: Docker on
`127.0.0.1:8090`, capped at **384 MB**, with `free -m` and `docker stats`
verified *before* cutover. Documented in `tasks.md` as the alternate path.

### 11.3 The Option A migration (root domain hand-over)

| Step | Action |
|---|---|
| 1 | Deploy `empire-agora` to a Pages preview URL; verify fully |
| 2 | Add tunnel ingress `portal.empireenglish.online → http://localhost:8080`; DNS route it |
| 3 | Verify the portal works on the new hostname **before** touching the root |
| 4 | Point `empireenglish.online` + `www` at Pages |
| 5 | Ship redirects: `/cohort` → `/plans`, `/waitlist` → `/join`, `/portal/*` and `/api/coursebook/*` → `portal.empireenglish.online/...` |
| 6 | Update `eec-web`'s `metadataBase` and absolute URLs to the portal hostname |

**Two risks that must be communicated, not discovered:**

- **Every signed-in student is logged out.** The `eec_session` JWT cookie is
  scoped to `empireenglish.online`; moving the app to a subdomain changes its
  scope. At 15–17 students this is a WhatsApp message, not an incident — but it
  must be that message, sent in advance.
- **`/api/coursebook/*` moves.** The gated coursebook endpoints are the portal's,
  and any bookmarked link breaks without the step-5 redirects. The gate must be
  re-verified after cutover: `student` → 401 unauthenticated, `teacher` → 200
  only with the admin token, and `/coursebook/*.pdf` → 404. Losing that check is
  how the Teacher's Edition leaks again.

**Rollback:** revert the DNS record for the root domain. One change, one place,
no rebuild. The portal ingress can stay in place permanently either way.

---

## 12. Risks

| # | Risk | Mitigation |
|---|---|---|
| R-1 | **Demand, not conversion, is the real constraint** — 15–17 students means the page has almost no traffic to convert. A perfect page changes nothing without distribution. | Explicit in `tasks.md`: Phase 5 is measurement, and the page is instrumented so the *next* decision is evidence-led. The page is necessary, not sufficient. |
| R-2 | Proof assets (before/after audio, testimonials) do not arrive | Sections ship hidden. R9.2 forbids filling them with invented content. The page must be persuasive without them, and better with them. |
| R-3 | Root-domain cutover breaks the portal or the coursebook gate | §11.3 ordering: portal verified on its new hostname *before* the root moves; explicit gate re-verification; single-record rollback. |
| R-4 | **Two rank systems in production** (assessment's four bands vs the guide's five CEFR ranks) confuse a buyer who sees both | Sales page uses the guide's CEFR-aligned ranks (§2.4). Reconciling the assessment app is logged as a separate follow-up — out of scope here, but it should not stay unresolved. |
| R-5 | Manual verification becomes the bottleneck as volume grows | Reference codes (§6.2) make matching near-instant; the owner queue is designed for batch. Real card checkout stays explicitly out of scope (R5.9) until volume justifies it. |
| R-6 | The palette change strands the portal on the old brand | Accepted under Option A; retheme tracked in Phase 6. |
| R-7 | A green CI run is mistaken for a working commercial model | R8.6. Acceptance evidence is ledger rows and retention, not passing tests. This project's history includes shipped bugs that passed 29 tests and were only caught by querying the live database. |

---

## 13. Traceability

Implements `requirements.md` R1–R13. Resolves O1 = Option A, O2 = approved names,
O3 = Elite ships as anchor, O4 = accounting deferred with the §7.3 qualification.
Realises the unchecked deliverable at
`EEC-MATERIAL/program/01-founding-cohort-offer.md:166` and builds on its §10
skeleton. Requires an amendment to `empire-style-guide.md` §3 (palette) and §4
(Arabic register per currency path), to ship in the same pull request.
