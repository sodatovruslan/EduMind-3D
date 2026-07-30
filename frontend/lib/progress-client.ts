import { apiFetch } from "@/lib/api";

/**
 * Adaptive Learning (Stage 4) — тонкий клиент над /api/progress/*.
 * Никакой логики здесь нет: все показатели (XP/level/accuracy/streak/
 * достижения) считает backend (progress_service.py) на основании реальных
 * событий, этот файл только сериализует запросы/ответы.
 */
export interface LearningProfile {
  level: number;
  xp: number;
  completed_tasks: string[];
  completed_labs: number;
  accuracy: number;
  average_hints: number;
  average_attempts: number;
  strong_topics: string[];
  weak_topics: string[];
  recent_mistakes: string[];
  recommended_difficulty: "easy" | "medium" | "hard";
  last_completed_lab: string | null;
  achievements: string[];
  current_streak: number;
}

export interface LearningEventRecord {
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface ProgressHistory {
  profile: LearningProfile;
  events: LearningEventRecord[];
}

export interface TaskEventResult {
  profile: LearningProfile;
  new_achievements: string[];
  repeated_mistake_code: string | null;
}

export interface LabCompletedResult {
  profile: LearningProfile;
  new_achievements: string[];
  summary: string;
  recommended_next: string;
  teacher_note: string | null;
}

export function getMyProgress(): Promise<ProgressHistory> {
  return apiFetch<ProgressHistory>("/api/progress/me");
}

export function submitTaskEvent(params: {
  simulationId: string;
  taskId: string;
  difficulty: string;
  xpReward: number;
  completed: boolean;
  hintsUsed: number;
  attempts: number;
  mistakes: string[];
}): Promise<TaskEventResult> {
  return apiFetch<TaskEventResult>("/api/progress/task-event", {
    method: "POST",
    body: JSON.stringify({
      simulation_id: params.simulationId,
      task_id: params.taskId,
      difficulty: params.difficulty,
      xp_reward: params.xpReward,
      completed: params.completed,
      hints_used: params.hintsUsed,
      attempts: params.attempts,
      mistakes: params.mistakes.map((code) => ({ code })),
    }),
  });
}

export function submitLabCompleted(params: {
  simulationId: string;
  tasksCompleted: number;
  totalMistakes: number;
  totalHints: number;
  totalAttempts: number;
}): Promise<LabCompletedResult> {
  return apiFetch<LabCompletedResult>("/api/progress/lab-completed", {
    method: "POST",
    body: JSON.stringify({
      simulation_id: params.simulationId,
      tasks_completed: params.tasksCompleted,
      total_mistakes: params.totalMistakes,
      total_hints: params.totalHints,
      total_attempts: params.totalAttempts,
    }),
  });
}
