import { apiFetch, ApiError } from "./api";
import { offlineSaveDB, type PendingSaveRecord } from "./offline-save-db";
import { serializeChemistrySave, type SerializeOptions } from "./chemistry-save-serializer";
import type { ChemistrySaveSnapshotV1 } from "./chemistry-save-schema";

export type AutosaveStatus = "idle" | "pending" | "saved" | "saving" | "offline_pending" | "error" | "conflict";

export interface SaveBackendResponse {
  id: string;
  user_id: string;
  simulation_id: string;
  experiment_id: string | null;
  schema_version: string;
  revision: number;
  status: string;
  idempotency_key: string | null;
  snapshot: ChemistrySaveSnapshotV1;
  created_at: string;
  updated_at: string;
  last_autosaved_at: string;
}

export type StatusListener = (status: AutosaveStatus) => void;

/**
 * Chemistry World — Stage S-8 Autosave Engine & Network Sync Manager
 */
export class AutosaveEngine {
  private saveId: string | null = null;
  private userId: string | null = null;
  private simulationId: string = "sim-chemistry-world";
  private experimentId: string | null = null;
  private currentRevision: number = 1;
  private clientSessionId: string = "";
  private createdOnServer: boolean = false;

  private isDirty: boolean = false;
  private status: AutosaveStatus = "idle";
  private listeners: Set<StatusListener> = new Set();

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private stateGetter: (() => SerializeOptions | null) | null = null;

  private requestCount: number = 0; // для метрики тестов
  private isSyncing: boolean = false; // мьютекс: flush() и retryPendingSync() не должны бежать параллельно
  private flushQueued: boolean = false; // flush() запрошен, пока мьютекс уже был занят — догнать текущим состоянием сразу после
  private pendingFinalStatus: string | null = null; // "completed" и т.п. — сохраняется через busy-очередь, чтобы не потеряться
  // Снапшот, захваченный ВЫЗЫВАЮЩИМ КОДОМ синхронно (см. finalize()), а не через
  // this.stateGetter(). Нужен для finalize-вызовов: если этот flush встанет в
  // очередь позади другой синхронизации, к моменту реального выполнения
  // stateGetter() уже может отражать состояние ПОСЛЕ выхода из эксперимента
  // (например selectedExperimentId уже сброшен) и вернуть null.
  private pendingSnapshotOverride: SerializeOptions | null = null;
  // Promise of the currently running (or about-to-run queued) sync. Callers that
  // need to know when a finalStatus has actually reached the server (e.g.
  // completeExperiment()) must await THIS, not just the flush() call they made —
  // if that particular call landed while busy, it queues and returns early.
  private syncChainPromise: Promise<void> = Promise.resolve();

  constructor() {
    this.setupWindowListeners();
  }

  private setupWindowListeners() {
    if (typeof window === "undefined") return;

    window.addEventListener("online", () => {
      this.retryPendingSync();
    });

    const handleUnload = () => {
      if (this.isDirty) {
        this.flushSyncBeacon();
      }
    };

    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("beforeunload", handleUnload);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && this.isDirty) {
        this.flushSyncBeacon();
      }
    });
  }

  public init(
    saveId: string,
    userId: string,
    simulationId: string,
    experimentId: string | null,
    initialRevision: number,
    stateGetter: () => SerializeOptions | null
  ) {
    this.saveId = saveId;
    this.userId = userId;
    this.simulationId = simulationId;
    this.experimentId = experimentId;
    this.currentRevision = initialRevision;
    this.stateGetter = stateGetter;
    this.isDirty = false;
    this.setStatus("saved");
    this.clientSessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    this.createdOnServer = false;

    // Запуск 30s периодического таймера
    if (this.periodicTimer) clearInterval(this.periodicTimer);
    this.periodicTimer = setInterval(() => {
      if (this.isDirty) {
        this.flush();
      }
    }, 30000);
  }

  public updateStateGetter(stateGetter: () => SerializeOptions | null) {
    this.stateGetter = stateGetter;
  }

  /** Вызывается при выходе из эксперимента — сбрасывает бадж в нейтральный «idle» */
  public uninit() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.isDirty = false;
    this.saveId = null;
    this.stateGetter = null;
    this.setStatus("idle");
  }

  public destroy() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.periodicTimer) clearInterval(this.periodicTimer);
    this.listeners.clear();
  }

  public getStatus(): AutosaveStatus {
    return this.status;
  }

  public getRequestCount(): number {
    return this.requestCount;
  }

  public subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: AutosaveStatus) {
    this.status = status;
    this.listeners.forEach((l) => l(status));
  }

  /**
   * Вызывается при доменном действии (pickup/place/pour/heat/step complete).
   * Запускает 2s debounce таймер.
   */
  public markDirty() {
    this.isDirty = true;

    // Переходим в «pending» сразу, чтобы пользователь видел реакцию немедленно
    if (this.status !== "saving") {
      this.setStatus("pending");
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, 2000);
  }

  /**
   * Сброс всех изменений на сервер.
   *
   * @param finalStatus Если передан (например "completed"), сервер переведёт
   * ChemistrySave в этот статус вместе с этим сохранением — используется при
   * завершении эксперимента, чтобы GET /api/chemistry/saves (status="active")
   * больше не считал его незавершённым резюмируемым сохранением.
   * @param snapshotOverride Явно захваченный вызывающим кодом снапшот вместо
   * ленивого this.stateGetter(). Обязателен для finalStatus-вызовов, которые
   * могут встать в очередь: к моменту фактического выполнения stateGetter()
   * может уже отражать состояние после выхода из эксперимента.
   */
  public flush(finalStatus?: string, snapshotOverride?: SerializeOptions): Promise<void> {
    if (finalStatus) this.pendingFinalStatus = finalStatus;
    if (snapshotOverride) this.pendingSnapshotOverride = snapshotOverride;
    if (this.isSyncing) {
      // A sync is already in flight (periodic timer, retry, or another flush).
      // Don't fire a second concurrent request racing on the same revision —
      // queue a follow-up flush so the state captured *after* this call isn't
      // silently lost once the in-flight request settles. pendingFinalStatus
      // (set above) survives the queue and is applied by that follow-up run.
      // Callers awaiting this promise still get the *actual* completion —
      // syncChainPromise chains through the queued follow-up too.
      this.flushQueued = true;
      return this.syncChainPromise;
    }
    this.syncChainPromise = this.runSync();
    return this.syncChainPromise;
  }

  private async runSync(): Promise<void> {
    if (!this.saveId || !this.userId) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const override = this.pendingSnapshotOverride;
    this.pendingSnapshotOverride = null;
    const stateOpts = override ?? (this.stateGetter ? this.stateGetter() : null);
    if (!stateOpts) return;

    this.isSyncing = true;
    this.setStatus("saving");
    const snapshot = serializeChemistrySave(stateOpts);
    const idempotencyKey = `${this.saveId}:${this.clientSessionId}:rev:${this.currentRevision}`;
    const statusToApply = this.pendingFinalStatus;
    this.pendingFinalStatus = null;

    try {
      this.requestCount++;
      let res: SaveBackendResponse;

      if (!this.createdOnServer) {
        // Первичное сохранение (POST)
        res = await apiFetch<SaveBackendResponse>("/api/chemistry/saves", {
          method: "POST",
          body: JSON.stringify({
            simulation_id: this.simulationId,
            experiment_id: this.experimentId,
            schema_version: snapshot.schemaVersion,
            status: statusToApply ?? "active",
            idempotency_key: idempotencyKey,
            snapshot,
          }),
        });
        this.createdOnServer = true;
      } else {
        // Обновление существующего (PUT с expected_revision)
        res = await apiFetch<SaveBackendResponse>(`/api/chemistry/saves/${this.saveId}`, {
          method: "PUT",
          body: JSON.stringify({
            expected_revision: this.currentRevision,
            snapshot,
            ...(statusToApply ? { status: statusToApply } : {}),
          }),
        });
      }

      this.saveId = res.id;
      this.currentRevision = res.revision;
      this.isDirty = false;
      this.setStatus("saved");
      await offlineSaveDB.removePending(this.saveId);
    } catch (err: any) {
      // Retain the completion intent so a later retry (online reconnect,
      // next dirty flush) still finalizes the status instead of silently
      // leaving the save "active" forever.
      if (statusToApply) this.pendingFinalStatus = statusToApply;

      if (err?.status === 409 || (err instanceof ApiError && err.status === 409)) {
        // 409 Revision Conflict
        console.warn("[Autosave] Revision conflict detected on server.");
        this.setStatus("conflict");
        await offlineSaveDB.savePending({
          saveId: this.saveId,
          idempotencyKey,
          revision: this.currentRevision,
          snapshot,
          syncStatus: "revision_conflict",
          updatedAt: new Date().toISOString(),
        });
        return;
      }

      // Сетевая ошибка или оффлайн
      console.warn("[Autosave] Network failed, saving offline locally:", err);
      this.setStatus("offline_pending");
      await offlineSaveDB.savePending({
        saveId: this.saveId,
        idempotencyKey,
        revision: this.currentRevision,
        snapshot,
        syncStatus: "pending",
        updatedAt: new Date().toISOString(),
      });
    } finally {
      this.isSyncing = false;
      if (this.flushQueued) {
        this.flushQueued = false;
        this.syncChainPromise = this.runSync();
        await this.syncChainPromise;
      }
    }
  }

  /**
   * Повторная попытка синхронизации при появлении сети
   */
  public async retryPendingSync(): Promise<void> {
    if (!this.saveId) return;
    if (this.isSyncing) return;
    const pending = await offlineSaveDB.getPending(this.saveId);
    if (!pending || pending.syncStatus !== "pending") return;
    if (this.isSyncing) return; // re-check: flush() may have started during the getPending() await

    console.log("[Autosave] Network restored! Retrying pending save sync...");
    this.isSyncing = true;
    this.setStatus("saving");
    const statusToApply = this.pendingFinalStatus;
    this.pendingFinalStatus = null;

    try {
      this.requestCount++;
      const res = await apiFetch<SaveBackendResponse>(`/api/chemistry/saves/${pending.saveId}`, {
        method: "PUT",
        body: JSON.stringify({
          expected_revision: pending.revision,
          snapshot: pending.snapshot,
          ...(statusToApply ? { status: statusToApply } : {}),
        }),
      });

      this.currentRevision = res.revision;
      this.isDirty = false;
      this.setStatus("saved");
      await offlineSaveDB.removePending(pending.saveId);
    } catch (err) {
      if (statusToApply) this.pendingFinalStatus = statusToApply;
      console.error("[Autosave] Offline retry sync failed:", err);
      this.setStatus("offline_pending");
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Best-effort flush при закрытии/переходе страницы через sendBeacon / fetch keepalive
   */
  private flushSyncBeacon() {
    if (!this.stateGetter || !this.saveId || !this.userId) return;
    const stateOpts = this.stateGetter();
    if (!stateOpts) return;

    const snapshot = serializeChemistrySave(stateOpts);
    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

    const payload = JSON.stringify({
      expected_revision: this.currentRevision,
      snapshot,
    });

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(`${API_URL}/api/chemistry/saves/${this.saveId}`, blob);
    } else if (typeof fetch !== "undefined") {
      fetch(`${API_URL}/api/chemistry/saves/${this.saveId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  }
}

export const autosaveEngine = new AutosaveEngine();
