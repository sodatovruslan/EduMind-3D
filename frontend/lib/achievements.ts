/**
 * Adaptive Learning (Stage 4) — emoji-only display metadata for
 * achievements. Which achievements are actually unlocked is decided
 * exclusively by the backend (progress_service.py) from real LearningEvent
 * history; this file decides nothing. Title/description text used to be
 * hardcoded here (a mix of English/Russian, never localized) — D8 moved
 * that copy into the i18n dictionaries (`t.achievements[code]`) so it's
 * real RU/EN/TG, not just here for the emoji.
 */
export const ACHIEVEMENT_EMOJI: Record<string, string> = {
  first_circuit: "🔌",
  first_perfect_lab: "💎",
  five_labs_completed: "🏆",
  no_hints_used: "🧠",
  fast_learner: "⚡",
  electrician_beginner: "🔧",
  electrician_intermediate: "🛠️",
  electrician_advanced: "⚙️",
};

export const ALL_ACHIEVEMENT_CODES = Object.keys(ACHIEVEMENT_EMOJI);
