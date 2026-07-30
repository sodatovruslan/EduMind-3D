"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CircuitComponent, CircuitSolution, Connection } from "@/lib/circuit-engine";
import { TASKS, TaskStatus, deriveTaskStatus, validateTask, type TaskDefinition, type TaskValidationResult } from "@/lib/task-engine";
import { getMyProgress, submitTaskEvent, type LearningProfile } from "@/lib/progress-client";

/**
 * Владение состоянием прогресса заданий (текущее задание/XP), вынесенное
 * из TaskPanel.tsx, чтобы то же состояние было доступно и AI Teacher
 * (Stage 3) для сборки AI Context — без задваивания currentTaskIndex/XP
 * в двух разных местах. Сама валидация по-прежнему целиком делегируется
 * task-engine.ts (validateTask/deriveTaskStatus) — этот провайдер не
 * содержит собственной логики "выполнено/не выполнено".
 *
 * Stage 4 (Adaptive Learning): при завершении каждой задачи отправляет
 * РЕАЛЬНЫЕ счетчики (сколько раз менялась схема — attempts, сколько
 * сообщений AI-преподавателю было отправлено — hints, какие коды ошибок
 * реально встретились — mistakes) на /api/progress/task-event. Все числа
 * берутся из фактического поведения ученика в этой сессии, ничего не
 * придумывается на фронтенде — итоговый Learning Profile целиком считает
 * backend (progress_service.py).
 */
interface SessionTotals {
  hints: number;
  mistakes: number;
  attempts: number;
  tasksCompleted: number;
}

interface TaskProgressContextValue {
  taskIndex: number;
  task: TaskDefinition;
  totalXp: number;
  status: TaskStatus;
  result: TaskValidationResult;
  isLastTask: boolean;
  advance: () => void;
  learningProfile: LearningProfile | null;
  newAchievements: string[];
  clearNewAchievements: () => void;
  repeatedMistakeCode: string | null;
  dismissRepeatedMistake: () => void;
  recordHintUsed: () => void;
  sessionTotals: SessionTotals;
}

const TaskProgressContext = createContext<TaskProgressContextValue | undefined>(undefined);

export function TaskProgressProvider({
  simulationId,
  components,
  connections,
  solution,
  children,
}: {
  simulationId: string;
  components: CircuitComponent[];
  connections: Connection[];
  solution: CircuitSolution;
  children: React.ReactNode;
}) {
  const [taskIndex, setTaskIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [totalXp, setTotalXp] = useState(0);
  const [learningProfile, setLearningProfile] = useState<LearningProfile | null>(null);
  const [newAchievements, setNewAchievements] = useState<string[]>([]);
  const [repeatedMistakeCode, setRepeatedMistakeCode] = useState<string | null>(null);

  const task = TASKS[taskIndex];
  const hasStarted = connections.length > 0;

  const result = useMemo(
    () => validateTask(task, { components, connections, solution }),
    [task, components, connections, solution]
  );
  const status = deriveTaskStatus(result, hasStarted);

  // рабочие счетчики по ТЕКУЩЕЙ задаче — сбрасываются при смене задачи
  const hintsThisTaskRef = useRef(0);
  const mistakeCodesThisTaskRef = useRef<Set<string>>(new Set());
  const attemptsThisTaskRef = useRef(0);
  const prevConnectionsRef = useRef(connections);
  const prevTaskIdRef = useRef(task.id);

  // накопительные итоги за всю лабораторную сессию — для /lab-completed
  const sessionHintsRef = useRef(0);
  const sessionMistakesRef = useRef(0);
  const sessionAttemptsRef = useRef(0);
  const sessionTasksCompletedRef = useRef(0);

  useEffect(() => {
    getMyProgress()
      .then((history) => setLearningProfile(history.profile))
      .catch(() => {
        // отсутствие профиля (например, первый визит до первого события)
        // не должно ломать лабораторию — просто нет данных для AI пока что
      });
  }, []);

  useEffect(() => {
    if (prevTaskIdRef.current !== task.id) {
      hintsThisTaskRef.current = 0;
      mistakeCodesThisTaskRef.current = new Set();
      attemptsThisTaskRef.current = 0;
      prevTaskIdRef.current = task.id;
      prevConnectionsRef.current = connections;
    }
  }, [task.id, connections]);

  useEffect(() => {
    if (prevConnectionsRef.current !== connections) {
      attemptsThisTaskRef.current += 1;
      prevConnectionsRef.current = connections;
    }
  }, [connections]);

  useEffect(() => {
    for (const e of result.errors) mistakeCodesThisTaskRef.current.add(e.code);
  }, [result.errors]);

  useEffect(() => {
    if (status !== TaskStatus.COMPLETED || completedIds.has(task.id)) return;

    setCompletedIds((prev) => new Set(prev).add(task.id));
    setTotalXp((prev) => prev + task.xpReward);

    const mistakes = Array.from(mistakeCodesThisTaskRef.current);
    const hintsUsed = hintsThisTaskRef.current;
    const attempts = attemptsThisTaskRef.current;

    sessionHintsRef.current += hintsUsed;
    sessionMistakesRef.current += mistakes.length;
    sessionAttemptsRef.current += attempts;
    sessionTasksCompletedRef.current += 1;

    submitTaskEvent({
      simulationId,
      taskId: task.id,
      difficulty: task.difficulty,
      xpReward: task.xpReward,
      completed: true,
      hintsUsed,
      attempts,
      mistakes,
    })
      .then((res) => {
        setLearningProfile(res.profile);
        if (res.new_achievements.length > 0) {
          setNewAchievements((prev) => [...prev, ...res.new_achievements]);
        }
        if (res.repeated_mistake_code) setRepeatedMistakeCode(res.repeated_mistake_code);
      })
      .catch(() => {
        // сеть недоступна — прогресс в этой сессии (XP/статус) уже виден
        // ученику локально, потеряется только серверная синхронизация
      });
  }, [status, task, completedIds, simulationId]);

  const value: TaskProgressContextValue = {
    taskIndex,
    task,
    totalXp,
    status,
    result,
    isLastTask: taskIndex === TASKS.length - 1,
    advance: () => setTaskIndex((i) => Math.min(i + 1, TASKS.length - 1)),
    learningProfile,
    newAchievements,
    clearNewAchievements: () => setNewAchievements([]),
    repeatedMistakeCode,
    dismissRepeatedMistake: () => setRepeatedMistakeCode(null),
    recordHintUsed: () => {
      hintsThisTaskRef.current += 1;
    },
    sessionTotals: {
      hints: sessionHintsRef.current,
      mistakes: sessionMistakesRef.current,
      attempts: sessionAttemptsRef.current,
      tasksCompleted: sessionTasksCompletedRef.current,
    },
  };

  return <TaskProgressContext.Provider value={value}>{children}</TaskProgressContext.Provider>;
}

export function useTaskProgress(): TaskProgressContextValue {
  const ctx = useContext(TaskProgressContext);
  if (!ctx) throw new Error("useTaskProgress должен использоваться внутри <TaskProgressProvider>");
  return ctx;
}
