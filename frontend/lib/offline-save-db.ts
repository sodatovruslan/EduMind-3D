import type { ChemistrySaveSnapshotV1 } from "./chemistry-save-schema";

/**
 * Chemistry World — Stage S-8 Offline Pending Save Storage (IndexedDB + LocalStorage + Memory fallback)
 * Безопасное локальное хранение несинхронизированных дампов при оффлайне или сбоях сети.
 */

export interface PendingSaveRecord {
  saveId: string;
  idempotencyKey: string;
  revision: number;
  snapshot: ChemistrySaveSnapshotV1;
  syncStatus: "pending" | "synced" | "revision_conflict";
  updatedAt: string;
}

const DB_NAME = "edumind_chemistry_saves_db";
const STORE_NAME = "pending_saves";
const LOCAL_STORAGE_KEY = "edumind_pending_save_fallback";

class OfflineSaveDB {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private memoryMap: Map<string, PendingSaveRecord> = new Map();

  private getDB(): Promise<IDBDatabase | null> {
    if (typeof window === "undefined" || typeof indexedDB === "undefined" || !indexedDB) {
      return Promise.resolve(null);
    }

    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve) => {
        try {
          const req = indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME, { keyPath: "saveId" });
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }

    return this.dbPromise;
  }

  public async savePending(record: PendingSaveRecord): Promise<void> {
    this.memoryMap.set(record.saveId, record);

    const db = await this.getDB();
    if (db) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(record));
      }
    } catch (err) {
      console.warn("LocalStorage save fallback failed:", err);
    }
  }

  public async getPending(saveId?: string): Promise<PendingSaveRecord | null> {
    const db = await this.getDB();
    if (db) {
      return new Promise((resolve) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        if (saveId) {
          const req = store.get(saveId);
          req.onsuccess = () => resolve(req.result || null);
          req.onerror = () => resolve(null);
        } else {
          const req = store.getAll();
          req.onsuccess = () => {
            const records: PendingSaveRecord[] = req.result || [];
            const pending = records.filter((r) => r.syncStatus === "pending");
            resolve(pending.length > 0 ? pending[pending.length - 1] : null);
          };
          req.onerror = () => resolve(null);
        }
      });
    }

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (raw) {
          const rec: PendingSaveRecord = JSON.parse(raw);
          if (!saveId || rec.saveId === saveId) return rec;
        }
      }
    } catch {
      // ignore
    }

    if (saveId) {
      return this.memoryMap.get(saveId) || null;
    }
    const memRecords = Array.from(this.memoryMap.values());
    const pendingMem = memRecords.filter((r) => r.syncStatus === "pending");
    return pendingMem.length > 0 ? pendingMem[pendingMem.length - 1] : null;
  }

  public async removePending(saveId: string): Promise<void> {
    this.memoryMap.delete(saveId);

    const db = await this.getDB();
    if (db) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(saveId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }
}

export const offlineSaveDB = new OfflineSaveDB();
