"use client";

import { TaskStatus } from "@/lib/task-engine";
import { useTaskProgress } from "@/components/tasks/TaskProgressProvider";
import { useLocale } from "@/lib/locale-context";
import TaskCompleteBanner from "@/components/lab/TaskCompleteBanner";

/** Electricity Lab: the "task completed" banner, fed from TaskProgressProvider. */
export default function TaskCompleteOverlay() {
  const { t } = useLocale();
  const p = t.electricity.panel;
  const { task, status, isLastTask, advance, goToTask } = useTaskProgress();

  return (
    <TaskCompleteBanner
      visible={status === TaskStatus.COMPLETED}
      taskId={task.id}
      isLast={isLastTask}
      title={isLastTask ? p.allDoneTitle : p.completeTitle}
      subtitle={isLastTask ? p.allDoneText : task.title}
      xpReward={task.xpReward}
      nextLabel={p.nextButton}
      restartLabel={p.restartButton}
      onNext={advance}
      onRestart={() => goToTask(0)}
    />
  );
}
