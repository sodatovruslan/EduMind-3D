/**
 * Electricity Lab — Autosave Engine (Stage S9.7). Тот же ПАТТЕРН, что и
 * Chemistry World's autosave-engine.ts (debounce + dirty-detection +
 * status-подписка + periodic safety net + flush при закрытии вкладки), но
 * НЕ тот же код: Chemistry's движок написан вокруг сетевого backend API
 * (optimistic concurrency/409-конфликты/offline-очередь через IndexedDB) —
 * у Electricity Lab по явному архитектурному решению S9.7 сохранение идёт
 * ТОЛЬКО в localStorage (см. electricity-save-schema.ts), поэтому запись
 * синхронна и не нуждается в сетевой mutex/retry-логике. `revision`
 * по-прежнему инкрементируется на каждом сохранении — это подготавливает
 * схему к возможной будущей синхронизации с backend без изменения формы.
 */
import {
  serializeElectricitySave,
  validateElectricitySaveSnapshot,
  type SerializeElectricitySaveOptions,
} from "./electricity-save-serializer";
import type { ElectricitySaveSnapshotV1 } from "./electricity-save-schema";

export type ElectricityAutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 1500;
const PERIODIC_SAFETY_NET_MS = 20000;

function storageKey(simulationId: string): string {
  return `edumind_electricity_save_${simulationId}`;
}

export function loadElectricitySave(simulationId: string): ElectricitySaveSnapshotV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(simulationId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return validateElectricitySaveSnapshot(parsed).isValid ? (parsed as ElectricitySaveSnapshotV1) : null;
  } catch {
    return null;
  }
}

function writeElectricitySave(simulationId: string, snapshot: ElectricitySaveSnapshotV1): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(simulationId), JSON.stringify(snapshot));
  } catch {
    // переполнение/недоступность localStorage не должно ломать лабораторию
  }
}

export function clearElectricitySave(simulationId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(storageKey(simulationId));
  } catch {
    // ignore
  }
}

type StateGetter = () => Omit<SerializeElectricitySaveOptions, "saveId" | "simulationId" | "revision"> | null;

class ElectricityAutosaveEngine {
  private status: ElectricityAutosaveStatus = "idle";
  private readonly listeners = new Set<(status: ElectricityAutosaveStatus) => void>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private periodicTimer: ReturnType<typeof setInterval> | null = null;
  private isDirty = false;
  private saveId: string | null = null;
  private simulationId: string | null = null;
  private revision = 0;
  private stateGetter: StateGetter | null = null;

  getStatus(): ElectricityAutosaveStatus {
    return this.status;
  }

  subscribe(listener: (status: ElectricityAutosaveStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: ElectricityAutosaveStatus) {
    this.status = status;
    this.listeners.forEach((l) => l(status));
  }

  // вызывается один раз при selectExperiment()/resumeSave() — активирует
  // движок для конкретной сессии; markDirty() до init() — no-op
  init(saveId: string, simulationId: string, initialRevision: number, stateGetter: StateGetter) {
    this.saveId = saveId;
    this.simulationId = simulationId;
    this.revision = initialRevision;
    this.stateGetter = stateGetter;
    this.isDirty = false;
    this.setStatus("idle");
    if (this.periodicTimer) clearInterval(this.periodicTimer);
    this.periodicTimer = setInterval(() => {
      if (this.isDirty) this.flush();
    }, PERIODIC_SAFETY_NET_MS);
  }

  // держит геттер актуальным на каждый рендер (та же необходимость, что и
  // Chemistry's updateStateGetter — замыкание должно видеть свежий stepContext)
  updateStateGetter(stateGetter: StateGetter) {
    this.stateGetter = stateGetter;
  }

  // debounce — реальные ре-рендеры физики (перетаскивание слайдера, каждое
  // изменение соединения) не должны бить в localStorage на каждый кадр;
  // серия быстрых изменений схлопывается в одну запись через DEBOUNCE_MS
  // после последнего изменения
  markDirty() {
    if (!this.saveId) return;
    this.isDirty = true;
    this.setStatus("pending");
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  // синхронная запись — localStorage не асинхронен, поэтому в отличие от
  // Chemistry's flush() здесь не нужен mutex/flushQueued: повторный вызов
  // flush() пока предыдущий выполняется невозможен (JS однопоточен, тело
  // ниже не содержит await)
  flush(): boolean {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (!this.saveId || !this.simulationId || !this.stateGetter) return false;
    const partial = this.stateGetter();
    if (!partial) return false;

    this.setStatus("saving");
    try {
      this.revision += 1;
      const snapshot = serializeElectricitySave({
        ...partial,
        saveId: this.saveId,
        simulationId: this.simulationId,
        revision: this.revision,
      });
      writeElectricitySave(this.simulationId, snapshot);
      this.isDirty = false;
      this.setStatus("saved");
      return true;
    } catch {
      this.revision -= 1; // не расходовать номер ревизии на неудачную попытку
      this.setStatus("error");
      return false;
    }
  }

  flushIfDirty() {
    if (this.isDirty) this.flush();
  }

  // вызывается при выходе из сессии (успешное завершение эксперимента,
  // Start Over, размонтирование) — останавливает таймеры, возвращает idle;
  // НЕ трогает уже записанный в localStorage снимок (это явная
  // ответственность вызывающего кода — completeExperiment чистит его сам)
  uninit() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.periodicTimer) clearInterval(this.periodicTimer);
    this.debounceTimer = null;
    this.periodicTimer = null;
    this.saveId = null;
    this.simulationId = null;
    this.isDirty = false;
    this.setStatus("idle");
  }

  destroy() {
    this.uninit();
    this.listeners.clear();
  }
}

export const electricityAutosaveEngine = new ElectricityAutosaveEngine();

// финальный best-effort flush при закрытии/сворачивании вкладки — запись в
// localStorage синхронна, поэтому (в отличие от Chemistry's sendBeacon)
// достаточно обычного синхронного вызова внутри этих событий
if (typeof window !== "undefined") {
  const flushOnUnload = () => electricityAutosaveEngine.flushIfDirty();
  window.addEventListener("beforeunload", flushOnUnload);
  window.addEventListener("pagehide", flushOnUnload);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnUnload();
  });
}
