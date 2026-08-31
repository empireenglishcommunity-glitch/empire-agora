/**
 * CEFR levels — MIRRORED FROM THE LIVE BOT. Do not invent values here.
 *
 * Canonical source:
 *   empire-nexus/bots/discord-learning-bot/src/config.py  →  CEFR_LEVELS
 *   (verified 2026-08-31 at config.py:295-349)
 *
 * The `cefr_curriculum` flag was RETIRED on 2026-08-28 once all six levels went
 * live, so this curriculum is unconditional in production. A member's
 * `member.level` is a CEFR key (A1–C2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THREE RANK SYSTEMS EXIST IN PRODUCTION. THIS SITE USES THIS ONE.
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. THIS ONE (canonical, live in the bot): six CEFR levels A1–C2 carrying the
 *    official CEFR titles plus Arabic names. Owner-confirmed 2026-08-31 as the
 *    system to adopt.
 * 2. The assessment app (`assessment.empireenglish.online`): four bands —
 *    Recruit / Initiate / Warrior / Champion. Those are placement-test outcome
 *    bands, not a learning ladder. NOT used here.
 * 3. `EEC-MATERIAL/materials/_style/empire-style-guide.md` §2: five "empire
 *    ranks" — Recruit / Citizen / Legionary / Confident / Sovereign — mapped to
 *    A1–C1. These exist in no code anywhere, and the ladder stops at C1 while
 *    the live system has six levels including C2. NOT used here.
 *
 * Reconciling 2 and 3 is tracked in tasks.md Phase 9.6. Until then, the only
 * safe public-facing vocabulary is the CEFR code plus the Arabic name.
 *
 * Student-facing wording is ALWAYS "CEFR-aligned, not certified"
 * (empire-chronicle/STATUS.md:143). Never imply accreditation.
 */

export type CefrCode = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface CefrLevel {
  code: CefrCode;
  /** The official Council of Europe descriptor for this level. */
  title: string;
  /** Plain-English name. */
  nameEn: string;
  /** Arabic name — as used by the bot, so the site and Discord agree. */
  nameAr: string;
  emoji: string;
  /** Hex colour from the bot's embed colour, for visual continuity. */
  color: string;
  /** Display order, 0-based. */
  order: number;
  /** Expected weeks to complete this level. */
  weeks: number;
  /** Cumulative vocabulary target at this level. */
  vocabTarget: number;
  /** Target uninterrupted speaking time, in seconds. */
  speakingTargetSeconds: number;
  /** Score needed on the exit exam to advance. */
  advancementScore: number;
}

export const CEFR_LEVELS: readonly CefrLevel[] = [
  {
    code: "A1",
    title: "Breakthrough",
    nameEn: "Beginner",
    nameAr: "مبتدئ",
    emoji: "🌱",
    color: "#A8E6CF",
    order: 0,
    weeks: 10,
    vocabTarget: 750,
    speakingTargetSeconds: 60,
    advancementScore: 70,
  },
  {
    code: "A2",
    title: "Waystage",
    nameEn: "Elementary",
    nameAr: "أساسي",
    emoji: "🌿",
    color: "#2ECC71",
    order: 1,
    weeks: 12,
    vocabTarget: 1_500,
    speakingTargetSeconds: 90,
    advancementScore: 72,
  },
  {
    code: "B1",
    title: "Threshold",
    nameEn: "Intermediate",
    nameAr: "متوسط",
    emoji: "🚀",
    color: "#3498DB",
    order: 2,
    weeks: 14,
    vocabTarget: 3_250,
    speakingTargetSeconds: 120,
    advancementScore: 75,
  },
  {
    code: "B2",
    title: "Vantage",
    nameEn: "Upper-Intermediate",
    nameAr: "فوق المتوسط",
    emoji: "💪",
    color: "#9B59B6",
    order: 3,
    weeks: 16,
    vocabTarget: 5_000,
    speakingTargetSeconds: 180,
    advancementScore: 75,
  },
  {
    code: "C1",
    title: "Effective Operational Proficiency",
    nameEn: "Advanced",
    nameAr: "متقدّم",
    emoji: "🏆",
    color: "#E67E22",
    order: 4,
    weeks: 18,
    vocabTarget: 8_000,
    speakingTargetSeconds: 240,
    advancementScore: 78,
  },
  {
    code: "C2",
    title: "Mastery",
    nameEn: "Proficiency",
    nameAr: "إتقان",
    emoji: "👑",
    color: "#C0392B",
    order: 5,
    weeks: 20,
    vocabTarget: 10_000,
    speakingTargetSeconds: 300,
    advancementScore: 80,
  },
] as const;

export const CEFR_ORDER: readonly CefrCode[] = [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
] as const;

/** Legacy level keys still present in older data. From config.py's LEGACY_LEVEL_MAP. */
export const LEGACY_LEVEL_MAP: Record<string, CefrCode> = {
  L0: "A1",
  L1: "A2",
  L2: "B1",
  L3: "B2",
};

export function getLevel(code: CefrCode): CefrLevel {
  const level = CEFR_LEVELS.find((l) => l.code === code);
  if (!level) throw new Error(`Unknown CEFR level: ${code}`);
  return level;
}

/**
 * Total weeks from the bottom of the ladder to the top: 90.
 *
 * Derived, not asserted — this is the kind of number that belongs on a sales
 * page precisely because it can be recomputed and checked.
 */
export function totalWeeks(): number {
  return CEFR_LEVELS.reduce((sum, l) => sum + l.weeks, 0);
}

/** Weeks from a starting level to the end of a target level, inclusive. */
export function weeksBetween(from: CefrCode, to: CefrCode): number {
  const a = getLevel(from).order;
  const b = getLevel(to).order;
  if (b < a) throw new Error(`${to} is below ${from}`);
  return CEFR_LEVELS.filter((l) => l.order >= a && l.order <= b).reduce(
    (sum, l) => sum + l.weeks,
    0,
  );
}
