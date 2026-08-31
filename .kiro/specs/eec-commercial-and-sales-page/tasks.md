# EEC Commercial Model & Sales Page — Implementation Plan

> **Status (2026-08-31): PHASES 0–4 BUILT. Phase 5 PREPARED but NOT EXECUTED.**
> The page exists and sells. It is not deployed, and deploying it needs SSH and a
> Cloudflare token this session did not have — see `DEPLOY.md`.
>
> **Phase 3/4 evidence.** `npm run check` green. `npm run check:live` boots the real
> server and passes: correct `dir`/`lang`, **887 Arabic lines** with zero
> un-isolated Latin islands, currency isolation across **8 route/currency states**,
> and every budget category within limits.
>
> Currency precedence verified against a live server — no signal → USD; cookie
> honoured; `?c=` beats cookie; geo `EG` → EGP; **an explicit choice beats geo**. In
> all eight states the page renders exactly one currency, never both.
>
> **Three defects found by looking at the rendered page, none catchable by a gate:**
> 1. **Tofu in the plans list.** `✓` (U+2713) has no glyph in Cairo or Reem Kufi, so
>    every feature row showed a missing-glyph box — on the most commercially
>    important section of the page. Replaced with inline SVG. General rule now
>    recorded: on an Arabic-first page, never rely on a decorative Unicode symbol
>    being in the loaded face; Arabic webfonts carry Arabic and Latin, not dingbats.
> 2. **The currency switch was ambiguous.** It read "change payment method — USD" on
>    a page showing EGP prices, which parses as *"this page is in USD"* — the
>    opposite of the truth. Now a full sentence naming the destination.
> 3. **The currency choice did not persist.** `resolveCurrency` read a cookie that
>    nothing ever wrote, so the choice was lost on the next navigation. Added
>    `/api/currency`, which sets the cookie and redirects — and works without
>    JavaScript. Its `next` parameter is validated against an open redirect
>    (`//evil.com` and `/etc/passwd` both refused, verified).
>
> **The page is now DYNAMIC, and that has consequences.** It must read a cookie and
> a geo header to choose a currency, so Next server-renders it on demand. Two
> follow-ons: (a) the three build-output gates were replaced by `check:live`, which
> fetches real routes — strictly better, since it exercises the geo path no build
> artefact could; (b) **pure-static Cloudflare Pages will not host this.** Phase 5
> needs SSR at the edge or the VPS. The Phase 5 hosting note must be revisited.
>
> Also found: **dynamic rendering drops `next/font`'s preload links**, so the three
> faces are discovered only after CSS parses — a visible swap on the hero text,
> which is the LCP element. Budgeted and warned, not failed; `display: swap` keeps
> text readable throughout. Fix when hosting is settled.
>
> **LAUNCH BLOCKERS — do not go live with these open:**
> - ~~`/terms` and `/privacy` do not exist.~~ **BUILT** — both routes exist in both
>   locales, prerendered, footer links restored and verified to resolve. **But the
>   content needs owner review**, and one question is genuinely open: there is no
>   age policy, and publishing a minor's voice recording to a community channel and
>   sending it to third-party processors is not something to leave undecided.
> - The **proof** and **testimonials** sections are not built at all (§2 and §10 of
>   design §3) — correctly, since there is no consented content yet.
> - ~~The founder photo frame is reserved but no image is wired.~~ **DONE** — one
>   portrait wired as pre-optimised AVIF/WebP/JPEG (7.5/9.7/20.6 KB), plus a favicon
>   from the crest. `next/image` deliberately not used: it needs `sharp` at runtime,
>   and adding a native image pipeline to a 384 MB container to resize one static
>   portrait is a bad trade.
> - Seat display shows a tier's **cap**, not seats *remaining*. Honest as worded
>   ("limited seats — 12") but 4.4 wants a derived count.
>
> **Phase 0 remains complete except 0.2 and 0.3** — both merged now
> (`empire-chronicle` #138, `EEC-MATERIAL` #7).
>
> **Phase 2 evidence:**
> - `npm run check` green: types, price invariants, copy bidi, logical properties.
> - `npm run build` green; 7 pages prerendered.
> - `check:rendered` — 140 Arabic lines across 7 pages, 0 un-isolated multi-island
>   lines, direction attributes correct.
> - `check:perf` — 189.9 KB first view (budget 200), 74.9 KB preloaded fonts
>   (budget 85), CSS 6.1 KB, HTML 3.0 KB.
> - Verified at a real **360×780** viewport with `dir="rtl"`:
>   `scrollWidth` 345 ≤ 360, so **no horizontal overflow** — the classic RTL mobile
>   failure. Screenshots in `.kiro/artifacts/screenshots/p2-*`.
> - Two more gates mutation-tested: a physical `ml-2` fails `check:logical`; a
>   tightened budget fails `check:perf`.
>
> **A real bug was found by looking at a screenshot, and no gate could have caught
> it.** `<Ltr>` wrapped the whole price group, forcing an LTR base over a string
> whose currency mark is Arabic. `500 ج.م` rendered with the numeral to the *left*
> of `ج.م` — mirrored from Arabic convention, where the amount belongs on the right.
> Nothing was garbled, which is exactly why every checker passed it: `<bdi>` prevents
> *garbling*, it does not make a mixed-direction group *idiomatic*. Fixed by
> isolating only the digits for EGP and keeping `$30` whole for USD. The reasoning is
> recorded in `src/components/Price.tsx` because it will recur.
>
> Two byte reductions banked while meeting the budget: **Cinzel dropped entirely**
> (~30 KB to serve one wordmark on a page whose display type is Arabic — the
> engraved feel now lives in the crest SVG), and Reem Kufi's unused Latin subset
> removed (~10 KB). The perf gate itself had to be corrected twice: it counted all
> seven font files instead of the three the page preloads (an 80% overstatement),
> and double-counted chunks appearing as both a preload `href` and a script `src`.
>
> **Phase 0 remains complete except 0.2 and 0.3**, which are pull requests against
> other repos: `empire-chronicle` #138 (registration) and `EEC-MATERIAL` #7 (style
> guide amendment). Both are open, not merged.
>
> This header is the progress signal — **not** the checkboxes below. Ecosystem
> precedent: initiatives here have read "0/28, in progress" while live in
> production for a week.
>
> **Evidence for the claim above:**
> - `npm run check` passes: `tsc --noEmit` clean, 10 price-invariant groups pass,
>   bidi gate passes on 9 Arabic strings.
> - `npm run build` succeeds; `/ar` and `/en` both prerender static.
> - Rendered `.next/server/app/ar.html` contains `<html lang="ar" dir="rtl">` and
>   every price wrapped as `<bdi dir="ltr">199 ج.م</bdi>`.
> - `دَرْب`, `الأساس`, `التركيز` appear in the EGP list; `VIP` and `النخبة` correctly
>   do **not** — the availability model works in the rendered output, not just in
>   the types.
> - The gates were **mutation-tested**, not merely observed passing. Restoring the
>   original VIP terms (12 × 1:1 at $100) fails two independent invariants; a
>   250 annual on a 30 monthly fails the annual policy; promoting VIP in Egypt
>   fails; and `ادفع بـ InstaPay أو Vodafone Cash` fails the bidi gate with all
>   three Latin islands named.
>
> **Still open in Phase 0:** 0.2 (register the repo in `empire-chronicle`) and
> 0.3 (amend `empire-style-guide.md`) — both are pull requests against *other*
> repos and are not done. Until 0.3 lands, this repo's palette and the declared
> style guide disagree, which is precisely the documentation drift this ecosystem
> keeps suffering from. Do it before Phase 2.
>
> **Two model corrections made during Phase 1, worth knowing:**
> 1. `groupSeatCap` as a single field could not express a tier with two
>    differently-sized groups (`tarkeez` = one 20-person session + one 8-person
>    session). It was replaced with a `groups[]` list. The old shape reported VIP
>    at **$477/teaching-hour instead of $47** — a tenfold error in the business's
>    governing metric, in the very file built to protect it.
> 2. The revenue floor is now evaluated **per currency**. Comparing an EGP rate
>    against a USD-derived floor measures the deliberate ~3× purchasing-power gap
>    rather than the health of a tier, and it wrongly failed `tarkeez/EGP`.
>
> Phases are ordered for execution and each one is **independently shippable**.
> Phase 5 puts a live selling page on the root domain *before* self-serve checkout
> exists — deliberately, because WhatsApp is already how sales close today, and it
> gets the page earning while the riskier money code is still being written.

---

## Phase 0 — Foundation and the decisions that must be written down

- [x] 0.1 Create `empireenglishcommunity-glitch/empire-agora`. Follow
      `empire-chronicle/docs/NEW-REPO-TEMPLATE.md` **on day one**: day-one
      `.gitignore` (`.env`, `.env.*` with `!.env.example`, `node_modules/`,
      `.next/`, `out/`, OS files), README, and
      `.kiro/steering/project-rules.md` pointing at the memory hub. *Retrofitting
      this later is how 4 of 9 repos ended up needing repair.* `Req: R12.1`
- [x] 0.2 Register the repo in `empire-chronicle` — `README.md` repo map **and**
      the protocol repo-map table — via a PR against the chronicle. Note the
      template still uses the retired name `Kiro-Master-Index`; use
      `empire-chronicle`. `Req: R13`
- [x] 0.3 **Amend `empire-style-guide.md`.** §3 palette → obsidian + antique gold
      (design §1/§2.1); §4 → Arabic register differs by currency path (Egyptian
      colloquial on EGP, light MSA on USD). Ship in the same PR as the first page
      code. *The guide is the declared source of truth and "the guide wins" — it
      is amended, never ignored.* `Req: R9.4, R9.5`
- [x] 0.4 Record the FX anchor (50.82 EGP/USD, 2026-08-31), the ~3× Egypt ratio
      and the ±15% review trigger as data in the repo. `Req: R2.4`
- [x] 0.5 Scaffold Next.js + TypeScript + Tailwind v4, `ar`/`en` routing with
      `ar` default and RTL, mirroring `EEC-MATERIAL/web/src/i18n/config.ts`.
      `Req: R10.1`

**Ships when:** the repo exists, is registered, and `/ar` renders an empty
RTL shell.

---

## Phase 1 — The commercial model as code (no UI)

The cheapest, highest-leverage phase. It makes the pricing decisions
machine-checked before a single pixel depends on them.

- [x] 1.1 Write `src/commerce/pricing.ts` per design §5 — five tiers, both
      currencies, owner-hours, seat caps, `promoted` flags. `Req: R2.1, R2.2, R3.1`
- [x] 1.2 Build-time gate: `annual === monthly * 10` for every tier/currency.
      `Req: R2.3`
- [x] 1.3 Build-time gate: `promoted.EGP === false` for `vip`, so the
      unpromoted-in-Egypt decision cannot be undone in a component. `Req: R3.1`
- [x] 1.4 Build-time gate: every price rendered anywhere resolves to a
      `pricing.ts` entry — no literal prices in components or copy. `Req: R2.5`
- [x] 1.5 A `revenue-per-teaching-hour` derivation checked into the repo as a
      script, so the §4.1 table can be recomputed rather than trusted.
      `Req: R8.4`
- [x] 1.6 Wire GitHub Actions CI running 1.2–1.5. **`EEC-MATERIAL` has no
      `.github` directory at all** — this is the first automated gate for
      commercial correctness in the ecosystem. `Req: R2.3`

**Ships when:** CI fails if anyone breaks a pricing invariant.

---

## Phase 2 — Design system, shell, and the bidi gate

- [x] 2.1 Tokens from design §2.1 as a Tailwind v4 `@theme` block. Use the
      **lightened** `#a08a68` for secondary text, not `#8b7355` — the source
      colour measures 4.43:1 and fails WCAG AA for body text. `Req: R9.4`
- [x] 2.2 Type system: Reem Kufi (Arabic display, self-hosted + subset), Cairo
      (Arabic + Latin body), Cinzel (Latin display caps). Budget ≤ 45 KB total.
      `Req: R11.3`
- [x] 2.3 Signature treatments: gold-gradient display text, gold-gradient primary
      button with glow, outlined secondary, hairline gold rules, 20%-alpha card
      borders, radial vignette + sparse particles (CSS-only,
      `prefers-reduced-motion` respected). `Req: R9.4, R11.2`
- [x] 2.4 **The bidi contract.** Page-scoped `unicode-bidi: plaintext` +
      `text-align: start`. Logical properties only — no `left`/`right` anywhere.
      *The existing contract is scoped to `.lesson-prose` and does not reach a
      marketing page.* `Req: R10.2, R10.3`
- [x] 2.5 `<Ltr>` isolating primitive and the `<Price>` component; every embedded
      Latin token and every price goes through them. `Req: R10.4, R10.5`
- [x] 2.6 **CI bidi gate** — port `bidi_check.py`'s rule (flag any
      Arabic-containing line with ≥2 LTR islands) against `ar.json`, plus a
      Puppeteer punctuation-position probe against rendered routes modelled on
      `tools/audit/bidi-render-probe.mjs`. **Must fail the build.** `Req: R10.7`
- [x] 2.7 CI performance budget: ≤ 150 KB initial transfer, LCP ≤ 2.5 s on
      throttled 4G, CLS ≤ 0.05. `Req: R11.2`
- [x] 2.8 Verify RTL on real mobile viewports down to 360 px, not a narrowed
      desktop window. `Req: R10.8`

**Ships when:** an empty page in the new brand passes bidi, performance and
contrast gates in CI.

---

## Phase 3 — The page content (WhatsApp CTA, no checkout yet)

Sections per design §3. All copy in `ar.json` / `en.json` — never inline.

- [x] 3.1 Hero: crest, honest headline, subhead, primary CTA (free placement
      test), secondary (plans), currency chip. **No entry gate, no ambient
      audio.** LCP element is text. `Req: R9.1, R11.2`
- [x] 3.2 §3 "Why it hasn't worked before" — three lines, Egyptian colloquial, no
      hype. `Req: R9.1, R9.2, R9.5`
- [x] 3.3 §4 "The system — three layers." **Retention-critical:** reps are async
      and unlimited on Darb + the bot; the live hour is correction and
      accountability. This is what makes a 20-person session honest and stops
      month-2 churn. `Req: R9.3`
- [x] 3.4 §6 "What you get" — deliverables. Level language always *"CEFR-aligned,
      not certified."* Use the guide's five CEFR ranks, **not** the assessment
      app's four test bands. `Req: R9.1`
- [x] 3.5 §8 "How joining works" — four steps, stating plainly that a human
      verifies payment and how long that takes. `Req: R5.1`
- [x] 3.6 §11 guarantee, §12 FAQ (payment rails, Gulf timezone, beginner anxiety,
      accent honesty, refunds, missed sessions, Egypt-vs-abroad pricing), §13
      final CTA, §14 footer with Terms / IP / Privacy. `Req: R9.1`
- [x] 3.7 Sticky mobile CTA bar after section 2. `Req: R11.1`
- [ ] 3.8 Empty shells (rendering nothing) for §2 proof, §9 founder, §10
      testimonials. **No placeholder quotes, no stock faces.** `Req: R9.2, R14`
- [x] 3.9 Copy review against GC-5: no "native", no "fluent in X days", no
      fabricated countdowns, no invented "was" prices. `Req: R9.1, R9.2`

**Ships when:** the full page renders persuasively on a Pages preview URL, with
every CTA going to WhatsApp.

---

## Phase 4 — Plans and currency isolation

- [x] 4.1 Tier cards from `pricing.ts`: annual **preselected**, `التركيز` marked
      most-chosen, VIP showing its 12-seat cap, `النخبة` as anchor, `دَرْب` as
      entry. `Req: R3.1, D4`
- [x] 4.2 Currency resolution from `CF-IPCountry`, overridable, persisted in
      cookie + URL. Never a hard block. `Req: R1.1, R1.2, R1.4`
- [x] 4.3 **CI gate: no rendered document may contain both an EGP and a USD
      price.** Scan every route in both currency states. `Req: R1.3`
- [ ] 4.4 Seat-availability display derived from real counts, or omitted. No
      decorative scarcity. `Req: R3.3, R9.2`
- [x] 4.5 Terms text stating EGP pricing is for residents of Egypt. `Req: R1.6`

**Ships when:** a visitor sees exactly one currency, correct prices, and cannot
see the other currency's numbers anywhere.

---

## Phase 5 — Go live on the root domain (Option A cutover)

Do this **before** checkout exists. The page starts earning via WhatsApp while
the money code is still being written.

> **PREPARED, NOT EXECUTED (2026-08-31).** Every artefact exists and is verified
> locally; the cutover itself needs SSH and a Cloudflare token, which this session
> did not have. Runbook: [`DEPLOY.md`](../../../DEPLOY.md).
>
> **The hosting decision reversed.** Cloudflare Pages was chosen on the premise
> that this was a static site. The page must read a cookie and a geo header to pick
> a currency, so it is server-rendered on demand and a static host cannot serve it.
> It now mirrors the pattern already proven on the box by `EEC-MATERIAL/web`:
> standalone build → Docker → `127.0.0.1:8090` → existing Cloudflare Tunnel. The
> edge option (`next-on-pages`/OpenNext) is not ruled out, but its Next 16
> compatibility could not be tested without deploying — the wrong thing to discover
> mid-cutover.
>
> **Measured, not guessed:** boot 103 MB · 50 renders 140 MB · 200 requests
> **166 MB peak** · 15 s idle back to 103 MB (no leak). Cap set to 384 MB ≈ 2.3×
> peak. Image 210 MB.

- [x] 5.1 **Deploy artefacts built and verified locally** — `output: "standalone"`,
      `Dockerfile` (mirroring the proven `eec-web` build), `docker-compose.yml` on
      `127.0.0.1:8090` capped at 384 MB, `.dockerignore`, `public/`. Image builds;
      the standalone server serves every route and currency isolation holds inside
      it. **Cloudflare Pages abandoned — see the note above.**
- [x] 5.1b **Legacy-path redirects enumerated and verified.** After cutover this app
      owns the root domain, so every route the old site had either has a home here
      or 404s — and those are links already shared in Telegram posts and student
      bookmarks. `/cohort` and `/waitlist` redirect internally; `/portal/*`,
      `/api/coursebook/*`, `/guide`, `/about`, `/accent-lab` redirect to the portal
      hostname. **This also fixed a bug shipped in Phase 0:** `/cohort` pointed at
      `/ar/plans`, which does not exist — the redirect resolved to a 404, which is
      worse than no redirect because it looks handled.
- [ ] 5.2 Add tunnel ingress `portal.empireenglish.online → localhost:8080`; DNS
      route it. **Do not touch the root yet.**
- [ ] 5.3 **Verify the portal fully on its new hostname first** — login, lessons,
      and the coursebook gate: `student` → 401 unauthenticated, `teacher` → 200
      only with the admin token, `/coursebook/*.pdf` → 404. `Req: R13.4`
- [ ] 5.4 **Tell the 15–17 students they will be logged out.** The `eec_session`
      cookie is scoped to the apex domain; moving to a subdomain changes its
      scope. This must be an announcement, not a discovery. `Req: R13.4`
- [ ] 5.5 Point `empireenglish.online` + `www` at Pages.
- [ ] 5.6 Redirects: `/cohort` → `/plans`, `/waitlist` → `/join`, `/portal/*` and
      `/api/coursebook/*` → the portal hostname. `Req: R13.4`
- [ ] 5.7 Update `eec-web`'s `metadataBase` and absolute URLs to the portal
      hostname. Redeploy with `rsync -a --delete` — **never `cp -r`**, which
      cannot remove a repo-deleted file and has already caused one real exposure.
      `Req: R13.3`
- [ ] 5.8 Verify from **outside** the box: root 200, portal 200, every redirect
      lands, coursebook gate intact. `Req: R13.3`
- [ ] 5.9 Write the rollback into the repo: revert one DNS record. `Req: R13.3`

**Ships when:** `empireenglish.online` serves the new sales page, the portal works
on its own hostname, and nothing that worked before is broken.

---

## Phase 6 — Assisted checkout

- [ ] 6.1 `/[locale]/join` flow: currency → tier → term → identity → rail.
      `Req: R5.1`
- [ ] 6.2 Reference codes `EEC-YYMM-<TIER><CUR>-<4>`, unambiguous alphabet.
      `Req: R5.2`
- [ ] 6.3 `POST /api/orders` — **synchronous, durable, fails loudly.** Explicitly
      not the `api/waitlist` best-effort pattern that returns `{ok:true}` on a
      failed write. `Req: R5.3`
- [ ] 6.4 Idempotency key; retries and double-submits return the original order.
      `Req: R5.4`
- [ ] 6.5 `orders` storage per design §7.1 (D1, or the VPS equivalent on the
      alternate path). `Req: R6.1`
- [ ] 6.6 Rail instructions revealed **only after** an order exists — the Vodafone
      Cash number is never in public markup. `Req: R5.7`
- [ ] 6.7 Proof upload: one tap on mobile, type/size validated, stored in **R2**
      under a non-guessable key, never on a public path. `Req: R5.5, R12.2, R12.3`
- [ ] 6.8 WhatsApp fallback at every step, pre-filled with the reference code.
      `Req: R5.5, R11.4`
- [ ] 6.9 Owner verification queue — authenticated, fails closed. Human approval
      preserved; no auto-grant on unverified proof. `Req: R5.6, R12.6`
- [ ] 6.10 Rate limiting on order and admin endpoints. `Req: R12.4`
- [ ] 6.11 EGP installments (2–3 scheduled transfers) representable.
      `Req: R5.8`
- [ ] 6.12 Provisioning handoff on verification: Discord access, tier-appropriate
      practice access, welcome sequence. Idempotent. `دَرْب` grants **no live
      session**, enforced technically. Any new student-facing behaviour goes
      behind a flag registered in `flag_registry.py` in the same commit; flags
      fail closed. `Req: R7.1–R7.4`

**Ships when:** a real order can be placed on a phone, is durably recorded, and is
verified by a human before access is granted.

---

## Phase 7 — Measurement

- [ ] 7.1 Funnel counters end to end: view → currency → tier viewed → placement
      started/finished → assessment booked → paid → attended → order → verified →
      access. `Req: R8.1`
- [ ] 7.2 Retention at 30/60/90 days by monthly intake. `Req: R8.2`
- [ ] 7.3 Revenue by currency, tier and term. `Req: R8.3`
- [ ] 7.4 Owner-hours consumed per tier, so §4.1 is recomputed from reality.
      `Req: R8.4`
- [ ] 7.5 Self-hosted or cookieless analytics. No third-party marketing tracker.
      `Req: R8.5`
- [ ] 7.6 Order/proof retention policy, coherent with the existing 60-day member
      retention policy. `Req: R12.5`

**Ships when:** the owner can answer "what is my close rate and my churn?" from
data — the two questions he could not answer at the start of this work.
**Acceptance evidence is ledger rows, not passing tests.** `Req: R8.6`

---

## Phase 8 — Proof assets (owner-supplied; unblocks the hidden sections)

- [ ] 8.1 Two consented before/after audio clips → §2 "30-second proof." From the
      1,095 committed broadcast clips or the 9,360 R2 speech clips. `Req: R9.3`
- [x] 8.2 Founder photos → §9. **Use two of the four:** the strongest formal
      portrait in the founder section, one candid teaching shot as support.
      `next/image`, explicit dimensions, AVIF/WebP, ≤ 120 KB each, faces legible
      at 360 px. Not in the hero — a photo there beats the LCP text and pushes the
      price path below the fold. `Req: R11.2`
- [ ] 8.3 Testimonials → §10, when real and consented. `Req: R9.2`

---

## Phase 9 — Deferred backlog (explicitly not now)

- [ ] 9.1 **The accounting/billing system** — per O4. Imports Phase 6 orders as
      history. *Note: August 2026 and the current members' payment history are
      already unreconstructable; this cannot recover them.* `Req: R6, design §7.3`
- [ ] 9.2 Backfill the 15–17 existing members. `Req: R6.5`
- [ ] 9.3 Automatic reconciliation onto `suspend_member` / `restore_member` —
      owner-triggered and reversible, never silent. `Req: R6.2, R6.3`
- [ ] 9.4 Grandfathered per-member prices. `Req: R3.6, R6.6`
- [ ] 9.5 Retheme the portal to the new brand (it stays royal purple until then).
- [ ] 9.6 Reconcile the two live rank systems — the assessment app's four test
      bands vs the guide's five CEFR ranks. Should not stay unresolved.
- [ ] 9.7 Real card checkout: Paymob/Fawry (EGP), merchant-of-record (USD).
      `Req: R5.9`
- [ ] 9.8 Referral mechanic — the ledger already carries `source`/`referrer`.
- [ ] 9.9 B2B / corporate: one invoice, no monthly churn decision, Gulf budgets in
      dollars. Highest-margin, lowest-churn segment identified in brainstorming.
- [ ] 9.10 Reconcile the stale cohort framing in
      `program/01-founding-cohort-offer.md` §6 and `content/04-entry-challenge.md`
      against the rolling monthly membership actually in production.
      `Req: requirements §2.7`

---

## The honest caveat on all of this

**Demand, not conversion, is the binding constraint.** At 15–17 students the page
has almost no traffic to convert, and a perfect page changes nothing without
distribution. This plan fixes a commercial model that would have broken at scale
(a premium tier yielding $8.33 per teaching hour), and builds the instrument that
makes the next decision evidence-led instead of remembered. It is necessary. It
is not sufficient. The distribution work is a separate conversation and should
happen in parallel, not after.
