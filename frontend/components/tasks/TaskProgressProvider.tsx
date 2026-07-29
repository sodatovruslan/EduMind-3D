"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CircuitComponent, CircuitSolution, Connection } from "@/lib/circuit-engine";
import { TASKS, TaskStatus, deriveTaskStatus, validateTask, type TaskDefinition, type TaskValidationResult } from "@/lib/task-engine";

/**
 * Владение состоянием прогресса заданий (текущее задание/XP), вынесенное
 * из TaskPanel.tsx, чтобы то же состояние было доступно и AI Teacher
 * (Stage 3) для сборки AI Context — без задваивания currentTaskIndex/XP
 * в двух разных местах. Сама валидация по-прежнему целиком делегируется
 * task-engine.ts (validateTask/deriveTaskStatus) — этот провайдер не
 * содержит собственной логики "выполнено/не выполнено".
 */
interface TaskProgressContextValue {
  taskIndex: number;
  task: TaskDefinition;
  totalXp: number;
  status: TaskStatus;
  result: TaskValidationResult;
  isLastTask: boolean;
  advance: () => void;
}

const TaskProgressContext = createContext<TaskProgressContextValue | undefined>(undefined);

export function TaskProgressProvider({
  components,
  connections,
  solution,
  children,
}: {
  components: CircuitComponent[];
  connections: Connection[];
  solution: CircuitSolution;
  children: React.ReactNode;
}) {
  const [taskIndex, setTaskIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [totalXp, setTotalXp] = useState(0);

  const task = TASKS[taskIndex];
  const hasStarted = connections.length > 0;

  const result = useMemo(
    () => validateTask(task, { components, connections, solution }),
    [task, components, connections, solution]
  );
  const status = deriveTaskStatus(result, hasStarted);

  useEffect(() => {
    if (status === TaskStatus.COMPLETED && !completedIds.has(task.id)) {
      setCompletedIds((prev) => new Set(prev).add(task.id));
      setTotalXp((prev) => prev + task.xpReward);
    }
  }, [status, task, completedIds]);

  const value: TaskProgressContextValue = {
    taskIndex,
    task,
    totalXp,
    status,
    result,
    isLastTask: taskIndex === TASKS.length - 1,
    advance: () => setTaskIndex((i) => Math.min(i + 1, TASKS.length - 1)),
  };

  return <TaskProgressContext.Provider value={value}>{children}</TaskProgressContext.Provider>;
}

export function useTaskProgress(): TaskProgressContextValue {
  const ctx = useContext(TaskProgressContext);
  if (!ctx) throw new Error("useTaskProgress должен использоваться внутри <TaskProgressProvider>");
  return ctx;
}
