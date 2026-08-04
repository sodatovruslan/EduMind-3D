import { apiFetch, ApiError } from "./api";
import { offlineSaveDB, type PendingSaveRecord } from "./offline-save-db";
import { serializeChemistrySave, type SerializeOptions } from "./chemistry-save-serializer";
import type { ChemistrySaveSnapshotV1 } from "./chemistry-save-schema";

export type AutosaveStatus = "saved" | "saving" | "offline_pending" | "error" | "conflict";

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

  private isDirty: boolean = false;
  private status: AutosaveStatus = "saved";
  private listeners: Set<StatusListener> = new Set();

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private stateGetter: (() => SerializeOptions | null) | null = null;

  private requestCount: number = 0; // для метрики тестов

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

    // Запуск 30s периодического таймера
    if (this.periodicTimer) clearInterval(this.periodicTimer);
    this.periodicTimer = setInterval(() => {
      if (this.isDirty) {
        this.flush();
      }
    }, 30000);
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

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.flush();
    }, 2000);
  }

  /**
   * Сброс всех изменений на сервер
   */
  public async flush(): Promise<void> {
    if (!this.stateGetter || !this.saveId || !this.userId) return;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    const stateOpts = this.stateGetter();
    if (!stateOpts) return;

    this.setStatus("saving");
    const snapshot = serializeChemistrySave(stateOpts);
    const idempotencyKey = `${this.saveId}:rev:${this.currentRevision}`;

    try {
      this.requestCount++;
      let res: SaveBackendResponse;

      if (this.currentRevision === 1) {
        // Первичное сохранение (POST)
        res = await apiFetch<SaveBackendResponse>("/api/chemistry/saves", {
          method: "POST",
          body: JSON.stringify({
            simulation_id: this.simulationId,
            experiment_id: this.experimentId,
            schema_version: snapshot.schemaVersion,
            status: "active",
            idempotency_key: idempotencyKey,
            snapshot,
          }),
        });
      } else {
        // Обновление существующего (PUT с expected_revision)
        res = await apiFetch<SaveBackendResponse>(`/api/chemistry/saves/${this.saveId}`, {
          method: "PUT",
          body: JSON.stringify({
            expected_revision: this.currentRevision,
            snapshot,
          }),
        });
      }

      this.currentRevision = res.revision;
      this.isDirty = false;
      this.setStatus("saved");
      await offlineSaveDB.removePending(this.saveId);
    } catch (err: any) {
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
    }
  }

  /**
   * Повторная попытка синхронизации при появлении сети
   */
  public async retryPendingSync(): Promise<void> {
    if (!this.saveId) return;
    const pending = await offlineSaveDB.getPending(this.saveId);
    if (!pending || pending.syncStatus !== "pending") return;

    console.log("[Autosave] Network restored! Retrying pending save sync...");
    this.setStatus("saving");

    try {
      this.requestCount++;
      const res = await apiFetch<SaveBackendResponse>(`/api/chemistry/saves/${pending.saveId}`, {
        method: "PUT",
        body: JSON.stringify({
          expected_revision: pending.revision,
          snapshot: pending.snapshot,
        }),
      });

      this.currentRevision = res.revision;
      this.isDirty = false;
      this.setStatus("saved");
      await offlineSaveDB.removePending(pending.saveId);
    } catch (err) {
      console.error("[Autosave] Offline retry sync failed:", err);
      this.setStatus("offline_pending");
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
