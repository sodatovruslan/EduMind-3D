import { Brain, Cable, Cog, Gem, Hammer, Lock, type LucideIcon, Rocket, Trophy, Wrench } from "lucide-react";

/**
 * Adaptive Learning (Stage 4) — display metadata for achievements. Which
 * achievements are actually unlocked is decided exclusively by the backend
 * (progress_service.py) from real LearningEvent history; this file decides
 * nothing. Title/description text used to be hardcoded here (a mix of
 * English/Russian, never localized) — D8 moved that copy into the i18n
 * dictionaries (`t.achievements[code]`).
 *
 * Иконки — lucide (та же библиотека, что у shadcn), НЕ эмодзи. Раньше здесь
 * жила карта `ACHIEVEMENT_EMOJI` (🔌/💎/🏆…), и система двоилась: профиль
 * рисовал достижения нормальными иконками, а дашборд — эмодзи, то есть одно
 * и то же достижение выглядело по-разному на двух экранах. Эмодзи к тому же
 * рендерятся шрифтом ОС (на Windows — цветные Segoe UI Emoji), поэтому не
 * подчиняются ни теме, ни `currentColor`, ни размеру иконок дизайн-системы.
 * Карта теперь одна на всё приложение.
 */
export const ACHIEVEMENT_ICON: Record<string, LucideIcon> = {
  first_circuit: Cable,
  first_perfect_lab: Gem,
  five_labs_completed: Trophy,
  no_hints_used: Brain,
  fast_learner: Rocket,
  electrician_beginner: Wrench,
  electrician_intermediate: Hammer,
  electrician_advanced: Cog,
};

/** Иконка нераскрытого достижения — одинаковая везде, где мы их показываем. */
export const ACHIEVEMENT_LOCKED_ICON: LucideIcon = Lock;

/** Фолбэк, если бэкенд пришлёт код, которого фронтенд ещё не знает. */
export const ACHIEVEMENT_FALLBACK_ICON: LucideIcon = Trophy;

export function achievementIcon(code: string, unlocked = true): LucideIcon {
  if (!unlocked) return ACHIEVEMENT_LOCKED_ICON;
  return ACHIEVEMENT_ICON[code] ?? ACHIEVEMENT_FALLBACK_ICON;
}

export const ALL_ACHIEVEMENT_CODES = Object.keys(ACHIEVEMENT_ICON);
