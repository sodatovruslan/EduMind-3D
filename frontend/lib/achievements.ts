/**
 * Adaptive Learning (Stage 4) — метаданные достижений только для
 * отображения (эмодзи/название/описание). Какие достижения реально
 * разблокированы — решает исключительно backend (progress_service.py),
 * на основании реальной истории LearningEvent. Этот файл ничего не решает.
 */
export interface AchievementInfo {
  emoji: string;
  title: string;
  description: string;
}

export const ACHIEVEMENTS: Record<string, AchievementInfo> = {
  first_circuit: { emoji: "🔌", title: "First Circuit", description: "Собрал первую замкнутую цепь" },
  first_perfect_lab: { emoji: "💎", title: "First Perfect Lab", description: "Прошёл лабораторную без единой ошибки" },
  five_labs_completed: { emoji: "🏆", title: "5 Labs Completed", description: "Завершил 5 лабораторных" },
  no_hints_used: { emoji: "🧠", title: "No Hints Used", description: "Прошёл лабораторную без подсказок" },
  fast_learner: { emoji: "⚡", title: "Fast Learner", description: "Прошёл все задачи с первой-второй попытки" },
  electrician_beginner: { emoji: "🔧", title: "Electrician Beginner", description: "Набрал первые очки опыта" },
  electrician_intermediate: { emoji: "🛠️", title: "Electrician Intermediate", description: "Уверенно освоил базовые цепи" },
  electrician_advanced: { emoji: "⚙️", title: "Electrician Advanced", description: "Освоил все задачи Electricity Lab" },
};

export const ALL_ACHIEVEMENT_CODES = Object.keys(ACHIEVEMENTS);
