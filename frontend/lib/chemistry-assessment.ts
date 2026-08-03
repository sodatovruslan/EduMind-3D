/**
 * Chemistry World — Stage S-6 Deterministic Assessment Engine & Evidence Builder
 *
 * Рассчитывает детерминированную оценку эксперимента на основе реальных
 * доменных событий (ChemistryObservationEvent) и итогового состояния симулятора.
 * LLM НЕ МОЖЕТ пересчитывать баллы или менять факты — результаты строго привязаны
 * к evidenceEventIds.
 */
import type { ChemistryObservationEvent } from "./observation-logger";
import type { LearningMode } from "./chemistry-lab-modes";

export type CriterionStatus = "passed" | "failed" | "incomplete";

export interface AssessmentInput {
  totalSteps: number;
  stepsCompleted: number;
  attempts: number;
  hintsUsed: number;
  safetyWarningCodesEncountered: string[];
  hazardLevelsEncountered: string[];
  isComplete: boolean;
  conclusionText: string;
  mode: LearningMode;
}

export interface AssessmentCategoryScore {
  score: number;
  explanation: string;
}

export interface AssessmentReport {
  correctProcedure: AssessmentCategoryScore;
  safety: AssessmentCategoryScore;
  understanding: AssessmentCategoryScore;
  observationQuality: AssessmentCategoryScore;
  completion: AssessmentCategoryScore;
  overallScore: number;
  summary: string;
}

export function assessExperiment(input: AssessmentInput): AssessmentReport {
  const completionScore = input.isComplete ? 100 : Math.round((input.stepsCompleted / Math.max(1, input.totalSteps)) * 100);
  const safetyScore = Math.max(0, 100 - (input.safetyWarningCodesEncountered.length + input.hazardLevelsEncountered.length) * 15);
  const overall = Math.round((completionScore + safetyScore) / 2);
  return {
    correctProcedure: { score: completionScore, explanation: "Оценка процедуры" },
    safety: { score: safetyScore, explanation: "Оценка безопасности" },
    understanding: { score: overall, explanation: "Понимание" },
    observationQuality: { score: overall, explanation: "Качество наблюдений" },
    completion: { score: completionScore, explanation: "Завершение" },
    overallScore: overall,
    summary: `Эксперимент оценен на ${overall}/100`,
  };
}

export interface CriterionResult {
  id: string;
  title: string;
  weight: number; // от 0 до 100
  status: CriterionStatus;
  scoreAwarded: number;
  maxScore: number;
  evidenceEventIds: string[];
  explanationCode: string;
  message: string;
}

export interface FinalWorkspaceSnapshot {
  containers: {
    id: string;
    kind: string;
    totalVolumeMl: number;
    totalMassG: number;
    substances: { substanceId: string; grams: number }[];
    temperatureC: number;
    storageSlotId: string | null;
  }[];
  stockBottles: {
    id: string;
    substanceId: string;
    remainingGrams: number;
    capState: "closed" | "open";
    storageSlotId: string | null;
  }[];
  cabinets: {
    id: string;
    isOpen: boolean;
  }[];
  safetyViolationsEncountered: string[];
  taskCompleted: boolean;
}

export interface DeterministicAssessmentInput {
  sessionId: string;
  simulationId: string;
  taskId: string | null;
  mode: LearningMode;
  events: readonly ChemistryObservationEvent[];
  finalSnapshot: FinalWorkspaceSnapshot;
  durationMs: number;
  hintsUsed: number;
}

export interface DeterministicAssessmentReport {
  sessionId: string;
  simulationId: string;
  taskId: string | null;
  overallScore: number; // 0..100
  isComplete: boolean;
  durationMs: number;
  criteria: CriterionResult[];
  safetyViolations: {
    code: string;
    description: string;
    evidenceEventIds: string[];
  }[];
  hintsUsed: number;
  timelineSummary: {
    sequence: number;
    timestampStr: string;
    text: string;
    evidenceEventId: string;
  }[];
  finalWorkspaceSnapshot: FinalWorkspaceSnapshot;
  allEvidenceEventIds: string[];
  generatedAt: string;
  schemaVersion: "1.0";
  assessmentSource: "client_deterministic_v1";
}

export function computeDeterministicAssessment(
  input: DeterministicAssessmentInput
): DeterministicAssessmentReport {
  const { events, finalSnapshot, durationMs, hintsUsed, sessionId, simulationId, taskId } = input;

  const criteria: CriterionResult[] = [];
  const safetyViolationsMap: Map<string, { code: string; description: string; evidenceEventIds: string[] }> = new Map();

  // 1. Criterion: Task Procedure Completion
  const taskCompletedEvents = events.filter((e) => e.eventType === "task_completed");
  const procedureEvidence = taskCompletedEvents.map((e) => e.eventId);

  if (finalSnapshot.taskCompleted || taskCompletedEvents.length > 0) {
    criteria.push({
      id: "task_completion",
      title: "Выполнение цели эксперимента",
      weight: 35,
      status: "passed",
      scoreAwarded: 35,
      maxScore: 35,
      evidenceEventIds: procedureEvidence,
      explanationCode: "TASK_COMPLETED_SUCCESSFULLY",
      message: "Цель эксперимента полностью достигнута и подтверждена симулятором.",
    });
  } else {
    criteria.push({
      id: "task_completion",
      title: "Выполнение цели эксперимента",
      weight: 35,
      status: "incomplete",
      scoreAwarded: 0,
      maxScore: 35,
      evidenceEventIds: [],
      explanationCode: "TASK_INCOMPLETE",
      message: "Эксперимент не завершён: не все обязательные химические условия выполнены.",
    });
  }

  // 2. Criterion: Stock Bottle Cap Safety
  const openBottlesAtEnd = finalSnapshot.stockBottles.filter((b) => b.capState === "open");
  const capClosedEvents = events.filter((e) => e.eventType === "cap_closed");
  const capEvidence = capClosedEvents.map((e) => e.eventId);

  const blockedPourEvents = events.filter((e) => e.eventType === "pour_blocked" && e.payload.reasonCode === "cap_closed");

  if (blockedPourEvents.length > 0) {
    blockedPourEvents.forEach((e) => {
      if (e.eventType === "pour_blocked") {
        safetyViolationsMap.set("pour_attempted_closed_cap", {
          code: "pour_attempted_closed_cap",
          description: "Попытка наливания при закрытой крышке бутылки.",
          evidenceEventIds: [e.eventId],
        });
      }
    });
  }

  if (openBottlesAtEnd.length === 0) {
    criteria.push({
      id: "bottle_caps_closed",
      title: "Соблюдение правил закрытия крышек",
      weight: 20,
      status: "passed",
      scoreAwarded: 20,
      maxScore: 20,
      evidenceEventIds: capEvidence,
      explanationCode: "ALL_CAPS_CLOSED",
      message: "Все склянки с реагентами плотно закрыты после использования.",
    });
  } else {
    const openEvidence = events
      .filter((e) => e.eventType === "cap_opened" && openBottlesAtEnd.some((b) => b.id === e.payload.objectId))
      .map((e) => e.eventId);

    openBottlesAtEnd.forEach((b) => {
      safetyViolationsMap.set(`unclosed_cap_${b.id}`, {
        code: "unclosed_cap",
        description: `Склянка ${b.id} оставлена открытой после завершения работы.`,
        evidenceEventIds: openEvidence,
      });
    });

    criteria.push({
      id: "bottle_caps_closed",
      title: "Соблюдение правил закрытия крышек",
      weight: 20,
      status: "failed",
      scoreAwarded: 0,
      maxScore: 20,
      evidenceEventIds: openEvidence,
      explanationCode: "UNCLOSED_BOTTLE_CAPS",
      message: `${openBottlesAtEnd.length} склянка(и) оставлена(ы) открытой(ыми).`,
    });
  }

  // 3. Criterion: Equipment Return to Cabinets / Storage
  const unreturnedItems = [
    ...finalSnapshot.stockBottles.filter((b) => b.storageSlotId === null),
    ...finalSnapshot.containers.filter((c) => c.storageSlotId === null),
  ];
  const itemStoredEvents = events.filter((e) => e.eventType === "item_stored");
  const storageEvidence = itemStoredEvents.map((e) => e.eventId);

  if (unreturnedItems.length === 0 || finalSnapshot.stockBottles.every((b) => b.storageSlotId !== null)) {
    criteria.push({
      id: "equipment_returned",
      title: "Возврат реагентов и посуды в шкафы",
      weight: 20,
      status: "passed",
      scoreAwarded: 20,
      maxScore: 20,
      evidenceEventIds: storageEvidence,
      explanationCode: "EQUIPMENT_RETURNED",
      message: "Все используемые реагенты и оборудование убраны в шкаф хранения.",
    });
  } else {
    criteria.push({
      id: "equipment_returned",
      title: "Возврат реагентов и посуды в шкафы",
      weight: 20,
      status: "incomplete",
      scoreAwarded: 10,
      maxScore: 20,
      evidenceEventIds: storageEvidence,
      explanationCode: "EQUIPMENT_NOT_RETURNED",
      message: "Реагенты или лабораторная посуда оставлены на столе после эксперимента.",
    });
  }

  // 4. Criterion: Safety Violations & Hazard Handling
  const safetyEvents = events.filter((e) => e.eventType === "safety_violation" || e.eventType === "hazard_detected");
  const safetyCheckEvents = events.filter((e) => e.eventType === "safety_check_completed");

  safetyEvents.forEach((e) => {
    if (e.eventType === "safety_violation") {
      safetyViolationsMap.set(e.payload.violationCode, {
        code: e.payload.violationCode,
        description: e.payload.description,
        evidenceEventIds: [e.eventId],
      });
    } else if (e.eventType === "hazard_detected") {
      safetyViolationsMap.set(`hazard_${e.payload.hazardLevel}`, {
        code: `hazard_${e.payload.hazardLevel}`,
        description: e.payload.description,
        evidenceEventIds: [e.eventId],
      });
    }
  });

  const safetyViolations = Array.from(safetyViolationsMap.values());
  const safetyEvidence = [
    ...safetyEvents.map((e) => e.eventId),
    ...safetyCheckEvents.map((e) => e.eventId),
  ];

  if (safetyViolations.length === 0 && safetyCheckEvents.length > 0) {
    criteria.push({
      id: "safety_compliance",
      title: "Техника безопасности в лаборатории",
      weight: 25,
      status: "passed",
      scoreAwarded: 25,
      maxScore: 25,
      evidenceEventIds: safetyEvidence,
      explanationCode: "SAFETY_PERFECT",
      message: "Техника безопасности соблюдена идеально — нарушений не зафиксировано.",
    });
  } else if (safetyViolations.length > 0) {
    criteria.push({
      id: "safety_compliance",
      title: "Техника безопасности в лаборатории",
      weight: 25,
      status: "failed",
      scoreAwarded: Math.max(0, 25 - safetyViolations.length * 10),
      maxScore: 25,
      evidenceEventIds: safetyEvidence,
      explanationCode: "SAFETY_VIOLATIONS_PRESENT",
      message: `Зафиксировано ${safetyViolations.length} нарушение(й) техники безопасности.`,
    });
  } else {
    criteria.push({
      id: "safety_compliance",
      title: "Техника безопасности в лаборатории",
      weight: 25,
      status: "incomplete",
      scoreAwarded: 0,
      maxScore: 25,
      evidenceEventIds: [],
      explanationCode: "SAFETY_CHECK_MISSING",
      message: "Проверка техники безопасности не была выполнена или доказательства отсутствуют.",
    });
  }

  // Strict Evidence Completeness Check: any passed/failed status MUST have evidence IDs
  criteria.forEach((c) => {
    if ((c.status === "passed" || c.status === "failed") && c.evidenceEventIds.length === 0) {
      c.status = "incomplete";
      c.scoreAwarded = 0;
      c.message = `${c.message} (Отклонено: отсутствуют доказательства сессии).`;
    }
  });

  // Calculate Overall Score
  const overallScore = Math.min(100, Math.max(0, criteria.reduce((sum, c) => sum + c.scoreAwarded, 0)));

  // Timeline Summary Generation
  const timelineSummary = events
    .filter(
      (e) =>
        e.eventType === "cabinet_opened" ||
        e.eventType === "cabinet_closed" ||
        e.eventType === "item_picked_up" ||
        e.eventType === "cap_opened" ||
        e.eventType === "cap_closed" ||
        e.eventType === "pour_completed" ||
        e.eventType === "pour_blocked" ||
        e.eventType === "substance_added" ||
        e.eventType === "item_stored" ||
        e.eventType === "task_completed"
    )
    .map((e) => {
      const date = new Date(e.occurredAt);
      const timestampStr = `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}:${date.getSeconds().toString().padStart(2, "0")}`;
      let text = "";

      switch (e.eventType) {
        case "cabinet_opened":
          text = `Открыт шкаф "${e.payload.cabinetName}"`;
          break;
        case "cabinet_closed":
          text = `Закрыт шкаф "${e.payload.cabinetName}"`;
          break;
        case "item_picked_up":
          text = `Взят предмет в руку: ${e.payload.objectId}`;
          break;
        case "cap_opened":
          text = `Открыта крышка: ${e.payload.bottleName}`;
          break;
        case "cap_closed":
          text = `Закрыта крышка: ${e.payload.bottleName}`;
          break;
        case "pour_completed":
          text = `Перелито ${e.payload.totalTransferredGrams.toFixed(1)} г (${e.payload.substanceId}) из ${e.payload.sourceId} в ${e.payload.targetId}`;
          break;
        case "pour_blocked":
          text = `Наливание заблокировано (${e.payload.reasonCode}): ${e.payload.details}`;
          break;
        case "substance_added":
          text = `Добавлено ${e.payload.addedGrams.toFixed(1)} г (${e.payload.substanceId}) в ${e.payload.targetContainerId}`;
          break;
        case "item_stored":
          text = `Предмет ${e.payload.objectId} убран в шкаф ${e.payload.cabinetId}`;
          break;
        case "task_completed":
          text = `Задание "${e.payload.taskId}" успешно выполнено (+${e.payload.xpEarned} XP)`;
          break;
        default:
          text = (e as { eventType: string }).eventType;
          break;
      }

      return {
        sequence: e.sequence,
        timestampStr,
        text,
        evidenceEventId: e.eventId,
      };
    });

  const allEvidenceEventIds = events.map((e) => e.eventId);

  return {
    sessionId,
    simulationId,
    taskId,
    overallScore,
    isComplete: finalSnapshot.taskCompleted || taskCompletedEvents.length > 0,
    durationMs,
    criteria,
    safetyViolations,
    hintsUsed,
    timelineSummary,
    finalWorkspaceSnapshot: finalSnapshot,
    allEvidenceEventIds,
    generatedAt: new Date().toISOString(),
    schemaVersion: "1.0",
    assessmentSource: "client_deterministic_v1",
  };
}
