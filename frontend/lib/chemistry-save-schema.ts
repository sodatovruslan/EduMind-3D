import type { ContainerKind } from "@/lib/chemistry-engine";

/**
 * Chemistry World — Stage S-8 Save Snapshot Schema V1.0
 * Единые строго типизированные интерфесы для версионированного сохранения.
 */

export interface ContainerSnapshotV1 {
  id: string;
  kind: ContainerKind;
  position: [number, number];
  rotationY: number;
  elevation: number;
  storageSlotId: string | null;
  heatingSourceId: string | null;
  isSealed: boolean;
  pressureKPa: number;
  contents: {
    substanceId: string;
    grams: number;
  }[];
  temperatureC: number;
  aggregateState?: "solid" | "liquid" | "gas";
  precipitate: {
    substanceId: string;
    grams: number;
  }[];
  hazardLevel: "none" | "caution" | "warning" | "danger" | "critical";
  capState?: "closed" | "open" | "missing";
}

export interface StockBottleSnapshotV1 {
  id: string;
  substanceId: string;
  substanceName: string;
  remainingGrams: number;
  capState: "closed" | "open";
  position: [number, number];
  rotationY: number;
  elevation: number;
  storageSlotId: string | null;
}

export interface BurnerSnapshotV1 {
  id: string;
  isOn: boolean;
  position: [number, number];
  rotationY: number;
  elevation: number;
  storageSlotId: string | null;
}

export interface CabinetSnapshotV1 {
  id: string;
  position: [number, number];
  rotationY: number;
  isOpen: boolean;
}

export interface ItemTransformSnapshotV1 {
  id: string;
  position: [number, number, number];
  rotationY: number;
  elevation: number;
  storageSlotId: string | null;
  heatingSourceId: string | null;
}

export interface ChemistryWorkspaceSnapshotV1 {
  containers: ContainerSnapshotV1[];
  stockBottles: StockBottleSnapshotV1[];
  burners: BurnerSnapshotV1[];
  cabinets: CabinetSnapshotV1[];
  itemTransforms: ItemTransformSnapshotV1[];
}

export interface ChemistryExperimentSnapshotV1 {
  mode: "guided" | "learning" | "practice" | "exam";
  currentStepIndex: number;
  completedStepIds: string[];
  taskStatus: "in_progress" | "completed" | "failed";
  startedAt: string;
  elapsedMs: number;
  hintsUsed: number;
  conclusionDraft: string;
}

export interface ChemistryProgressSnapshotV1 {
  xp: number;
  achievements: string[];
  completedExperimentIds: string[];
}

export interface ChemistryObservationSnapshotV1 {
  sessionId: string;
  lastSequence: number;
  events: any[]; // DomainObservationEvent[]
}

export interface ChemistryTeacherReportSnapshotV1 {
  latestReportId: string | null;
  pendingSyncKeys: string[];
}

export interface ChemistrySaveSnapshotV1 {
  schemaVersion: "1.0";
  saveId: string;
  userId: string;
  simulationId: string;
  experimentId: string | null;

  createdAt: string;
  updatedAt: string;
  revision: number;

  workspace: ChemistryWorkspaceSnapshotV1;
  experiment: ChemistryExperimentSnapshotV1;
  progress: ChemistryProgressSnapshotV1;
  observation: ChemistryObservationSnapshotV1;
  teacherReport?: ChemistryTeacherReportSnapshotV1;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}
