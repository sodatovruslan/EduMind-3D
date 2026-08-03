/**
 * Chemistry World — Stage S-6 Pending Teacher Report Sync & LocalStorage Persistence
 *
 * Сохраняет несохраненные отчёты (pending) в persistent localStorage (edumind_pending_teacher_reports)
 * с ключом идемпотентности idempotencyKey, счетчиком попыток retryCount и датой последней попытки.
 * При перезагрузке страницы отчёты восстанавливаются и повторно отправляются на бэкенд.
 */

export interface PendingReportItem {
  idempotencyKey: string;
  simulationId: string;
  reportPayload: Record<string, unknown>;
  syncStatus: "pending" | "synced" | "failed";
  retryCount: number;
  lastAttemptAt: string;
  createdAt: string;
}

const STORAGE_KEY = "edumind_pending_teacher_reports";

export class TeacherReportSyncManager {
  public savePendingReport(simulationId: string, idempotencyKey: string, reportPayload: Record<string, unknown>): PendingReportItem {
    const items = this.getPendingReports();
    const existing = items.find((i) => i.idempotencyKey === idempotencyKey);
    if (existing) return existing;

    const newItem: PendingReportItem = {
      idempotencyKey,
      simulationId,
      reportPayload,
      syncStatus: "pending",
      retryCount: 0,
      lastAttemptAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    items.push(newItem);
    this.writeStorage(items);
    return newItem;
  }

  public getPendingReports(): PendingReportItem[] {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.error("Failed to read pending teacher reports from localStorage:", err);
      return [];
    }
  }

  public markReportSynced(idempotencyKey: string) {
    const items = this.getPendingReports().filter((i) => i.idempotencyKey !== idempotencyKey);
    this.writeStorage(items);
  }

  public incrementRetry(idempotencyKey: string) {
    const items = this.getPendingReports().map((item) => {
      if (item.idempotencyKey === idempotencyKey) {
        return {
          ...item,
          retryCount: item.retryCount + 1,
          lastAttemptAt: new Date().toISOString(),
          syncStatus: "failed" as const,
        };
      }
      return item;
    });
    this.writeStorage(items);
  }

  private writeStorage(items: PendingReportItem[]) {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.error("Failed to write pending teacher reports to localStorage:", err);
    }
  }

  public clearAll() {
    if (typeof window === "undefined" || typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("Failed to clear pending teacher reports in localStorage:", err);
    }
  }
}

export const teacherReportSyncManager = new TeacherReportSyncManager();
