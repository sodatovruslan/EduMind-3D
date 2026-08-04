/**
 * Chemistry World — Learning Modes (Stage 5.6). Чистая конфигурация трёх
 * режимов обучения. Ничего не решает про химию/опасность — только про то,
 * сколько подсказок/подсветки показывать в UI. Реальные данные (шаги,
 * причины, наблюдения) по-прежнему приходят из chemistry-lab-catalog.ts /
 * hazard-engine.ts — этот модуль только фильтрует, что из этого показать.
 */
export type LearningMode = "guided" | "practice" | "exam";

/** Режимы управления камерой (Stage S-7 v2): "orbit" (S-6) ↔ "sandbox" (S-7 FPS) */
export type CameraMode = "orbit" | "sandbox";

export type InteractionSource = "click" | "key_e";

export type InteractionReason =
  | "ok"
  | "too_far"
  | "occluded"
  | "invalid_state"
  | "target_unavailable"
  | "registry_not_ready";

export interface InteractionCheckResult {
  allowed: boolean;
  reason: InteractionReason;
  message?: string;
  distance: number;
  maxDistance: number;
}

export interface LabModeConfig {
  mode: LearningMode;
  label: string;
  showFullHints: boolean;
  showSafetyReminders: boolean;
  showAIExplanations: boolean;
  showStepHighlighting: boolean;
  showObjectivesOnly: boolean;
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
  },
  practice: {
    mode: "practice",
    label: "Практика",
    showFullHints: false,
    showSafetyReminders: true,
    showAIExplanations: true,
    showStepHighlighting: false,
    showObjectivesOnly: true,
  },
  exam: {
    mode: "exam",
    label: "Экзамен",
    showFullHints: false,
    showSafetyReminders: false,
    showAIExplanations: false,
    showStepHighlighting: false,
    showObjectivesOnly: true,
  },
};

export function getModeConfig(mode: LearningMode): LabModeConfig {
  return MODE_CONFIGS[mode];
}

export const LEARNING_MODES: LearningMode[] = ["guided", "practice", "exam"];
