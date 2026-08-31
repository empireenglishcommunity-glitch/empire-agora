# empire-agora

The Empire English Community sales and marketing site — the commercial front
door. Arabic-first, RTL, mobile-first, two currencies.

> *Agora: the public square where the offer is made.*

## Status

**Phase 0–1 complete** (foundation + the commercial model as code). No page
content yet, nothing deployed.

Progress lives in the status headers of
`.kiro/specs/eec-commercial-and-sales-page/tasks.md` — **not** in its checkboxes.

## What this repo is for

Two inseparable things:

1. **The commercial model**, expressed as code with CI-enforced invariants. Five
   tiers in two currencies, priced against *revenue per teaching hour* rather
   than by feel.
2. **The sales page** that sells them, with an assisted checkout built around the
   five manual payment rails actually in use (Vodafone Cash, InstaPay, PayPal,
   crypto, bank transfer). There is no automated card checkout and none is
   planned for v1.

Read the spec in order: `requirements.md` → `design.md` → `tasks.md`, in
`.kiro/specs/eec-commercial-and-sales-page/`.

## The number this whole repo exists to protect

Every tier is an exchange rate on one person's calendar:

| Tier | Owner hours/month | Per teaching hour (USD) |
|---|---|---|
| `دَرْب` — practice only | **0** | no hours consumed |
| `الأساس` — 1 group session/wk | 4.33 shared | **$139** |
| `التركيز` — + small group | +4.33 shared | ~$72 marginal |
| `VIP` — + 4 × 1:1 | +4.00 | **$50** |
| `النخبة` — + 8 × 1:1 | +8.00 | **$62** |

Before this work, VIP sold twelve 1:1 sessions a month for $100 — **$8.33 per
teaching hour**, against $139 for the cheapest tier. Twenty VIP members would
have consumed more of the calendar than a thousand Basic students, for 6.7% of
the revenue. Run `npm run revenue` to recompute the table from
`src/commerce/pricing.ts` rather than trusting it.

## Commands

```bash
npm install
npm run dev        # local dev server
npm run build      # production build
npm run check      # all CI gates (run before pushing)
npm run revenue    # recompute revenue per teaching hour from pricing.ts
```

### The gates `npm run check` runs

| Gate | What it prevents |
|---|---|
| `check:prices` | An annual price drifting off `10 × monthly`; a tier priced in a currency it isn't sold in; VIP becoming promoted in Egypt |
| `check:bidi` | Any Arabic line carrying 2+ embedded Latin tokens — the pattern that makes RTL text genuinely unreadable |
| `tsc` | Type errors |

## Structure

```
src/
├─ commerce/pricing.ts     ← the ONLY file containing a price
├─ commerce/fx.ts          ← FX anchor, target ratio, review trigger
├─ curriculum/cefr.ts      ← mirrors the bot's CEFR_LEVELS
├─ content/{ar,en}.json    ← all copy; never inline in components
├─ i18n/                   ← ar default, RTL
└─ app/[locale]/           ← routes
assets/founder/            ← source photos (HEIC, not web-servable)
scripts/                   ← CI gates
```

## Two things that will bite you

**Prices are not in the copy files.** `ar.json` holds a `{price}` placeholder;
the number comes from `pricing.ts` through the `<Price>` component. A CI gate
fails the build if a literal price appears in a component.

**Arabic + Latin is a real rendering hazard.** An Arabic line containing two or
more Latin tokens (`ادفع بـ InstaPay أو Vodafone Cash`) reorders on screen so
that punctuation lands in the wrong place. Every Latin token goes inside `<Ltr>`.
`npm run check:bidi` enforces it — this is the first automated bidi gate anywhere
in the ecosystem; the two existing checkers (`empire-nexus`'s `bidi_check.py` and
`EEC-MATERIAL`'s render probe) are both manual.

## Related repos

`empire-chronicle` (memory hub — read first) · `empire-nexus` (the bot; owns
CEFR levels and the `suspended_at` access lifecycle) · `empire-dojo` (the Darb
practice site) · `EEC-MATERIAL` (curriculum + the current root-domain site that
this repo will replace) · the assessment app (owns the placement test).
