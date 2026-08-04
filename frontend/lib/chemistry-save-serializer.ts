import type {
  ChemistrySaveSnapshotV1,
  ValidationResult,
} from "./chemistry-save-schema";

/**
 * Chemistry World — Stage S-8 Serializer, Hydrator & Schema Migrator
 */

export interface SerializeOptions {
  saveId: string;
  userId: string;
  simulationId: string;
  experimentId: string | null;
  revision: number;
  createdAt?: string;
  updatedAt?: string;

  workspace: {
    containers: any[];
    stockBottles: any[];
    burners: any[];
    cabinets?: any[];
    itemTransforms?: any[];
  };

  experiment: {
    mode: "guided" | "learning" | "practice" | "exam";
    currentStepIndex: number;
    completedStepIds: string[];
    taskStatus: "in_progress" | "completed" | "failed";
    startedAt: string | number;
    elapsedMs: number;
    hintsUsed: number;
    conclusionDraft: string;
  };

  progress: {
    xp: number;
    achievements: string[];
    completedExperimentIds: string[];
  };

  observation: {
    sessionId: string;
    lastSequence: number;
    events: any[];
  };

  teacherReport?: {
    latestReportId: string | null;
    pendingSyncKeys: string[];
  };
}

/**
 * Валидация структуры и бизнес-инвариантов snapshot
 */
export function validateSnapshot(raw: any): ValidationResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { isValid: false, errors: ["Snapshot is not an object"] };
  }

  if (raw.schemaVersion !== "1.0") {
    return { isValid: false, errors: [`Unsupported schema version: ${raw.schemaVersion}`] };
  }

  if (!raw.saveId || !raw.userId || !raw.simulationId) {
    errors.push("Missing core metadata fields (saveId, userId, simulationId)");
  }

  const ws = raw.workspace;
  if (!ws || typeof ws !== "object") {
    errors.push("Missing workspace object");
  } else {
    // 1. Проверка масс и температур в containers
    if (Array.isArray(ws.containers)) {
      const occupiedSlots = new Set<string>();

      for (const c of ws.containers) {
        if (typeof c.temperatureC === "number" && (c.temperatureC < -273.15 || c.temperatureC > 5000)) {
          errors.push(`Invalid temperature range in container ${c.id}: ${c.temperatureC}°C`);
        }

        if (Array.isArray(c.contents)) {
          for (const s of c.contents) {
            if (typeof s.grams === "number" && s.grams < 0) {
              errors.push(`Negative substance mass in container ${c.id}`);
            }
          }
        }

        // Инвариант уникальности слота
        if (c.storageSlotId) {
          if (occupiedSlots.has(c.storageSlotId)) {
            errors.push(`Duplicate storage slot occupancy detected: ${c.storageSlotId}`);
          }
          occupiedSlots.add(c.storageSlotId);
        }
      }
    }

    // 2. Проверка остатка масс в stockBottles
    if (Array.isArray(ws.stockBottles)) {
      for (const b of ws.stockBottles) {
        if (typeof b.remainingGrams === "number" && b.remainingGrams < 0) {
          errors.push(`Negative remaining mass in bottle ${b.id}`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Миграция устаревших версий snapshot к последней версии 1.0
 */
export function migrateSnapshot(raw: any): ChemistrySaveSnapshotV1 {
  const val = validateSnapshot(raw);
  if (!val.isValid) {
    throw new Error(`Cannot migrate invalid snapshot: ${val.errors.join("; ")}`);
  }
  return raw as ChemistrySaveSnapshotV1;
}

/**
 * Детерминированная сериализация состояния рабочего стола и эксперимента в JSON-safe snapshot.
 * Все массивы предметов сортируются по ID для детерминированного результатного JSON.
 */
export function serializeChemistrySave(options: SerializeOptions): ChemistrySaveSnapshotV1 {
  const now = new Date().toISOString();

  // 1. Containers (сортировка по ID)
  const containers = (options.workspace.containers || [])
    .map((c) => ({
      id: c.id,
      kind: c.kind,
      position: (c.position ? [Number(c.position[0]), Number(c.position[1])] : [0, 0]) as [number, number],
      rotationY: c.rotationY || 0,
      elevation: c.elevation || 0,
      storageSlotId: c.storageSlotId || null,
      heatingSourceId: c.heatingSourceId || null,
      isSealed: Boolean(c.isSealed),
      pressureKPa: c.pressureKPa || 101.3,
      contents: Array.isArray(c.data?.contents || c.contents)
        ? (c.data?.contents || c.contents).map((s: any) => ({
            substanceId: s.substanceId,
            grams: s.grams ?? s.massGrams ?? 0,
          }))
        : [],
      temperatureC: c.data?.temperatureC ?? c.temperatureC ?? 20.0,
      aggregateState: c.data?.aggregateState || c.aggregateState || "liquid",
      precipitate: Array.isArray(c.data?.precipitate || c.precipitate)
        ? (c.data?.precipitate || c.precipitate).map((p: any) => ({
            substanceId: p.substanceId,
            grams: p.grams ?? p.massGrams ?? 0,
          }))
        : [],
      hazardLevel: c.hazard?.level || c.hazardLevel || "none",
      capState: c.capState || "closed",
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // 2. Stock Bottles (сортировка по ID)
  const stockBottles = (options.workspace.stockBottles || [])
    .map((b) => ({
      id: b.id,
      substanceId: b.substanceId,
      substanceName: b.substanceName,
      remainingGrams: b.remainingGrams ?? 500,
      capState: b.capState || "closed",
      position: (b.position ? [Number(b.position[0]), Number(b.position[1])] : [0, 0]) as [number, number],
      rotationY: b.rotationY || 0,
      elevation: b.elevation || 0,
      storageSlotId: b.storageSlotId || null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // 3. Burners (сортировка по ID)
  const burners = (options.workspace.burners || [])
    .map((b) => ({
      id: b.id,
      isOn: Boolean(b.isOn),
      position: (b.position ? [Number(b.position[0]), Number(b.position[1])] : [0, 0]) as [number, number],
      rotationY: b.rotationY || 0,
      elevation: b.elevation || 0,
      storageSlotId: b.storageSlotId || null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // 4. Cabinets
  const cabinets = (options.workspace.cabinets || [])
    .map((c) => ({
      id: c.id,
      position: (c.position ? [Number(c.position[0]), Number(c.position[1])] : [0, 0]) as [number, number],
      rotationY: c.rotationY || 0,
      isOpen: Boolean(c.isOpen),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  // 5. Item Transforms (сортировка по ID)
  const itemTransforms = (options.workspace.itemTransforms || [])
    .map((t) => ({
      id: t.id,
      position: (t.position ? [Number(t.position[0]), Number(t.position[1]), Number(t.position[2])] : [0, 0, 0]) as [number, number, number],
      rotationY: t.rotationY || 0,
      elevation: t.elevation || 0,
      storageSlotId: t.storageSlotId || null,
      heatingSourceId: t.heatingSourceId || null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const completedStepIds = [...(options.experiment.completedStepIds || [])].sort();
  const achievements = [...(options.progress.achievements || [])].sort();
  const completedExperimentIds = [...(options.progress.completedExperimentIds || [])].sort();

  return {
    schemaVersion: "1.0",
    saveId: options.saveId,
    userId: options.userId,
    simulationId: options.simulationId,
    experimentId: options.experimentId,
    createdAt: options.createdAt || now,
    updatedAt: options.updatedAt || now,
    revision: options.revision,
    workspace: {
      containers,
      stockBottles,
      burners,
      cabinets,
      itemTransforms,
    },
    experiment: {
      mode: options.experiment.mode,
      currentStepIndex: options.experiment.currentStepIndex,
      completedStepIds,
      taskStatus: options.experiment.taskStatus,
      startedAt: typeof options.experiment.startedAt === "number"
        ? new Date(options.experiment.startedAt).toISOString()
        : options.experiment.startedAt,
      elapsedMs: options.experiment.elapsedMs,
      hintsUsed: options.experiment.hintsUsed,
      conclusionDraft: options.experiment.conclusionDraft || "",
    },
    progress: {
      xp: options.progress.xp || 0,
      achievements,
      completedExperimentIds,
    },
    observation: {
      sessionId: options.observation.sessionId,
      lastSequence: options.observation.lastSequence,
      events: options.observation.events || [],
    },
    teacherReport: {
      latestReportId: options.teacherReport?.latestReportId || null,
      pendingSyncKeys: [...(options.teacherReport?.pendingSyncKeys || [])].sort(),
    },
  };
}

export interface HydratedState {
  workspace: {
    containers: any[];
    stockBottles: any[];
    burners: any[];
    itemTransforms: any[];
  };
  experiment: {
    mode: "guided" | "learning" | "practice" | "exam";
    currentStepIndex: number;
    completedStepIds: string[];
    taskStatus: "in_progress" | "completed" | "failed";
    startedAt: string;
    elapsedMs: number;
    hintsUsed: number;
    conclusionDraft: string;
  };
  progress: {
    xp: number;
    achievements: string[];
    completedExperimentIds: string[];
  };
  observation: {
    sessionId: string;
    lastSequence: number;
    events: any[];
  };
  runtimeDefaults: {
    cameraMode: "orbit";
    heldId: null;
    draggingId: null;
    placementCandidate: null;
    activePour: false;
  };
}

/**
 * Атомарная гидратация snapshot в готовую структуру состояния domain state.
 */
export function hydrateChemistrySave(snapshot: ChemistrySaveSnapshotV1): HydratedState {
  const validation = validateSnapshot(snapshot);
  if (!validation.isValid) {
    throw new Error(`Hydration failed due to invalid snapshot: ${validation.errors.join("; ")}`);
  }

  const ws = snapshot.workspace;

  // Восстановление контейнеров с безопасной логической привязкой к нагревателю
  const containers = (ws.containers || []).map((c) => ({
    id: c.id,
    kind: c.kind,
    position: c.position,
    rotationY: c.rotationY,
    elevation: c.elevation,
    storageSlotId: c.storageSlotId,
    heatingSourceId: c.heatingSourceId, // логический ID нагревателя
    isSealed: c.isSealed,
    pressureKPa: c.pressureKPa,
    data: {
      id: c.id,
      kind: c.kind,
      contents: c.contents.map((s) => ({ ...s })),
      temperatureC: c.temperatureC,
      aggregateState: c.aggregateState,
      precipitate: c.precipitate.map((p) => ({ ...p })),
    },
    hazard: {
      level: c.hazardLevel,
      cause: null,
      message: "",
    },
    capState: c.capState || "closed",
  }));

  const stockBottles = (ws.stockBottles || []).map((b) => ({ ...b }));
  const burners = (ws.burners || []).map((b) => ({ ...b }));
  const itemTransforms = (ws.itemTransforms || []).map((t) => ({ ...t }));

  return {
    workspace: {
      containers,
      stockBottles,
      burners,
      itemTransforms,
    },
    experiment: {
      mode: snapshot.experiment.mode,
      currentStepIndex: snapshot.experiment.currentStepIndex,
      completedStepIds: [...snapshot.experiment.completedStepIds],
      taskStatus: snapshot.experiment.taskStatus,
      startedAt: snapshot.experiment.startedAt,
      elapsedMs: snapshot.experiment.elapsedMs,
      hintsUsed: snapshot.experiment.hintsUsed,
      conclusionDraft: snapshot.experiment.conclusionDraft,
    },
    progress: {
      xp: snapshot.progress.xp,
      achievements: [...snapshot.progress.achievements],
      completedExperimentIds: [...snapshot.progress.completedExperimentIds],
    },
    observation: {
      sessionId: snapshot.observation.sessionId,
      lastSequence: snapshot.observation.lastSequence,
      events: [...snapshot.observation.events],
    },
    runtimeDefaults: {
      cameraMode: "orbit",
      heldId: null,
      draggingId: null,
      placementCandidate: null,
      activePour: false,
    },
  };
}
