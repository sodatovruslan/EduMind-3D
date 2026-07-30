/**
 * Chemistry World — Learning Modes (Stage 5.6). Чистая конфигурация трёх
 * режимов обучения. Ничего не решает про химию/опасность — только про то,
 * сколько подсказок/подсветки показывать в UI. Реальные данные (шаги,
 * причины, наблюдения) по-прежнему приходят из chemistry-lab-catalog.ts /
 * hazard-engine.ts — этот модуль только фильтрует, что из этого показать.
 */
export type LearningMode = "guided" | "practice" | "exam";

export interface LabModeConfig {
  mode: LearningMode;
  label: string;
  showFullHints: boolean;
  showSafetyReminders: boolean;
  showAIExplanations: boolean;
  showStepHighlighting: boolean;
  showObjectivesOnly: boolean;
  allowDirectAIAnswers: boolean;
  showAssessmentDuringExperiment: boolean;
}

const MODE_CONFIGS: Record<LearningMode, LabModeConfig> = {
  guided: {
    mode: "guided",
    label: "Обучение",
    showFullHints: true,
    showSafetyReminders: true,
    showAIExplanations: true,
    showStepHighlighting: true,
    showObjectivesOnly: false,
    allowDirectAIAnswers: false,
    showAssessmentDuringExperiment: true,
  },
  practice: {
    mode: "practice",
    label: "Практика",
    showFullHints: false,
    showSafetyReminders: true,
    showAIExplanations: true,
    showStepHighlighting: false,
    showObjectivesOnly: true,
    allowDirectAIAnswers: false,
    showAssessmentDuringExperiment: false,
  },
  exam: {
    mode: "exam",
    label: "Экзамен",
    showFullHints: false,
    showSafetyReminders: false,
    showAIExplanations: false,
    showStepHighlighting: false,
    showObjectivesOnly: true,
    allowDirectAIAnswers: false,
    showAssessmentDuringExperiment: false,
  },
};

export function getModeConfig(mode: LearningMode): LabModeConfig {
  return MODE_CONFIGS[mode];
}

export const LEARNING_MODES: LearningMode[] = ["guided", "practice", "exam"];
