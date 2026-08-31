# empire-agora — AI Agent Steering Rules

> Automatically loaded by Kiro and any AI agent working on this repository.

## Session Protocol

Full session commands (`/start`, `/status`, `/sync`, `/checkpoint`) and standing
rules live in `empireenglishcommunity-glitch/empire-chronicle`
(`.kiro/steering/AI-AGENT-PROTOCOL.md`). Read that file — do not duplicate it
here.

At session start read, in order: `empire-chronicle/STATUS.md` in full, then
`SYSTEM-MAP.md`, then `README.md`, then only the newest dated section of
`SESSION_CONTINUITY.md`. This repo's own docs are secondary.

## Project Identity

- **Project:** the EEC sales and marketing site — the commercial front door.
  Sells memberships in two currencies (EGP inside Egypt, USD everywhere else).
- **Parent project:** Empire English Community.
- **Repository:** `empireenglishcommunity-glitch/empire-agora`
- **Live at:** not deployed yet. Target is the root domain
  `empireenglish.online`, with the existing portal moving to
  `portal.empireenglish.online` (see the spec, design §11.3).
- **Spec:** `.kiro/specs/eec-commercial-and-sales-page/` — read `requirements.md`
  → `design.md` → `tasks.md`.

## Repo-Specific Rules

### Prices live in exactly one place
`src/commerce/pricing.ts` is the only file allowed to contain a price. Never
hard-code a number in a component, a copy dictionary, or a payment instruction.
Three CI gates enforce this; `npm run check` runs them.

### Never show two currencies at once
A visitor sees EGP or USD, never both, and never a converted equivalent. The
Egypt tier is roughly one third of the international price — publishing that
side by side to the higher-paying market costs money for no benefit.

### Arabic is the product, not a translation
`ar` is the default locale and the canonical conversion path. Every price and
every embedded Latin token (`Discord`, `VIP`, `InstaPay`, `PayPal`) renders
through the `<Ltr>` isolating component, so no Arabic line ever carries two or
more raw LTR islands — the exact condition `bidi_check.py` flags in the bot repo.
Use logical CSS properties only (`margin-inline-start`, never `margin-left`).

### Honesty rules are inherited and non-negotiable
`EEC-MATERIAL/materials/_style/empire-style-guide.md` is the source of truth for
voice. Promise *"clear, confident, neutral American accent."* Never "native,"
never "fluent in X days." Levels are always *"CEFR-aligned, not certified."* No
fabricated countdowns, no invented "was" prices, no placeholder testimonials.
Scarcity must be real and derived from actual counts.

### CEFR levels come from the bot, not from here
The canonical level data is `empire-nexus/bots/discord-learning-bot/src/config.py`
`CEFR_LEVELS`. `src/curriculum/cefr.ts` mirrors it and must be re-verified against
it rather than edited freely. Note two *non-canonical* rank systems also exist in
production (the assessment app's four bands; the style guide's five empire ranks)
— neither is used on this site.

### Money code rules
- Order creation is synchronous and durable. It must fail loudly. Do **not**
  copy `EEC-MATERIAL/web/src/app/api/waitlist/route.ts`, which returns
  `{ok:true}` even when the write failed — acceptable for a lead, disqualifying
  for an order.
- The human payment-approval gate is never removed.
- Payment identifiers (the Vodafone Cash number, account details) never appear in
  publicly served markup before an order exists.
- Payment proofs are financial PII: never in `public/`, never committed.

### Git
Never push to `main`. Branch (`component/description`), commit
(`type(scope): description`), then a PR. `gh pr create` fails in the sandbox —
use `gh api repos/{owner}/{repo}/pulls`.

### Deploy
Nothing here auto-deploys yet. Target is Cloudflare Pages (precedent:
`empire-dojo`), explicitly **not** another container on the VPS — that box is a
4 GB Hetzner already running ~10 services. See design §11.2.
