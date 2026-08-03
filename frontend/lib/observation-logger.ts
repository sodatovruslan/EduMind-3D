/**
 * Chemistry World — Stage S-6 Observation Logger & Event Log Engine
 *
 * Единый источник истины для педагогических событий ученика.
 * Изолирован от React Render Loop для предотвращения лагов в 3D WebGL (R3F).
 */

export type EventSource = "interaction" | "workspace" | "engine" | "validator";

export interface BaseObservationEvent {
  sessionId: string;
  eventId: string; // ${sessionId}:${sequence}
  sequence: number; // строго возрастающий счетчик
  occurredAt: number; // UTC timestamp ms
  monotonicMs: number; // performance.now() для точного измерения длительности
  simulationId: string;
  taskId: string | null;
  actorId: string; // "student"
  source: EventSource;
  schemaVersion: "1.0";
}

// 1. Interaction Events
export interface ItemPickedUpEvent extends BaseObservationEvent {
  eventType: "item_picked_up";
  payload: {
    objectId: string;
    objectKind: string;
    fromStorageSlotId: string | null;
  };
}

export interface ItemPlacedEvent extends BaseObservationEvent {
  eventType: "item_placed";
  payload: {
    objectId: string;
    objectKind: string;
    surface: "table" | "stand" | "cabinet";
    position: [number, number];
  };
}

export interface PickupCancelledEvent extends BaseObservationEvent {
  eventType: "pickup_cancelled";
  payload: {
    objectId: string;
    reason: string;
  };
}

export interface CabinetOpenedEvent extends BaseObservationEvent {
  eventType: "cabinet_opened";
  payload: {
    cabinetId: string;
    cabinetName: string;
  };
}

export interface CabinetClosedEvent extends BaseObservationEvent {
  eventType: "cabinet_closed";
  payload: {
    cabinetId: string;
    cabinetName: string;
  };
}

export interface ItemStoredEvent extends BaseObservationEvent {
  eventType: "item_stored";
  payload: {
    objectId: string;
    cabinetId: string;
    slotId: string;
  };
}

export interface CapOpenedEvent extends BaseObservationEvent {
  eventType: "cap_opened";
  payload: {
    objectId: string;
    bottleName: string;
  };
}

export interface CapClosedEvent extends BaseObservationEvent {
  eventType: "cap_closed";
  payload: {
    objectId: string;
    bottleName: string;
  };
}

export interface BottleTiltedEvent extends BaseObservationEvent {
  eventType: "bottle_tilted";
  payload: {
    objectId: string;
    tiltRad: number;
  };
}

export interface BottleUprightedEvent extends BaseObservationEvent {
  eventType: "bottle_uprighted";
  payload: {
    objectId: string;
  };
}

// 2. Pouring Events
export type PourBlockedReason =
  | "cap_closed"
  | "target_too_far"
  | "invalid_angle"
  | "no_valid_target"
  | "source_empty";

export interface PourStartedEvent extends BaseObservationEvent {
  eventType: "pour_started";
  payload: {
    sourceId: string;
    targetId: string;
    substanceId: string;
    initialDistanceM: number;
    initialTiltRad: number;
  };
}

export interface PourCompletedEvent extends BaseObservationEvent {
  eventType: "pour_completed";
  payload: {
    sourceId: string;
    targetId: string;
    substanceId: string;
    totalTransferredGrams: number;
    durationMs: number;
    averageFlowRateGramsPerSec: number;
    stopReason: "user_uprighted" | "empty" | "target_moved" | "completed";
  };
}

export interface PourBlockedEvent extends BaseObservationEvent {
  eventType: "pour_blocked";
  payload: {
    sourceId: string;
    targetId: string | null;
    reasonCode: PourBlockedReason;
    details: string;
  };
}

// 3. Chemistry & Safety Events
export interface SubstanceAddedEvent extends BaseObservationEvent {
  eventType: "substance_added";
  payload: {
    targetContainerId: string;
    substanceId: string;
    addedGrams: number;
    newTotalGrams: number;
  };
}

export interface HazardDetectedEvent extends BaseObservationEvent {
  eventType: "hazard_detected";
  payload: {
    containerId: string;
    hazardLevel: string;
    description: string;
  };
}

export interface SafetyViolationEvent extends BaseObservationEvent {
  eventType: "safety_violation";
  payload: {
    violationCode: string;
    description: string;
    severity: "warning" | "critical";
  };
}

export interface SafetyCheckCompletedEvent extends BaseObservationEvent {
  eventType: "safety_check_completed";
  payload: {
    violationCount: number;
    checkedRules: string[];
    finalSafetyStatus: "passed" | "violations_found";
    snapshotHash: string;
  };
}

// 4. Task Events
export interface TaskStartedEvent extends BaseObservationEvent {
  eventType: "task_started";
  payload: {
    taskId: string;
    taskTitle: string;
  };
}

export interface TaskStepCompletedEvent extends BaseObservationEvent {
  eventType: "task_step_completed";
  payload: {
    taskId: string;
    stepIndex: number;
    stepDescription: string;
  };
}

export interface TaskCompletedEvent extends BaseObservationEvent {
  eventType: "task_completed";
  payload: {
    taskId: string;
    xpEarned: number;
    durationMs: number;
  };
}

export interface HintRequestedEvent extends BaseObservationEvent {
  eventType: "hint_requested";
  payload: {
    prompt: string;
    response: string;
  };
}

export type ChemistryObservationEvent =
  | ItemPickedUpEvent
  | ItemPlacedEvent
  | PickupCancelledEvent
  | CabinetOpenedEvent
  | CabinetClosedEvent
  | ItemStoredEvent
  | CapOpenedEvent
  | CapClosedEvent
  | BottleTiltedEvent
  | BottleUprightedEvent
  | PourStartedEvent
  | PourCompletedEvent
  | PourBlockedEvent
  | SubstanceAddedEvent
  | HazardDetectedEvent
  | SafetyViolationEvent
  | SafetyCheckCompletedEvent
  | TaskStartedEvent
  | TaskStepCompletedEvent
  | TaskCompletedEvent
  | HintRequestedEvent;

export type EventType = ChemistryObservationEvent["eventType"];

type Listener = (event: ChemistryObservationEvent) => void;

const MAX_EVENT_LOG_SIZE = 500;

class ObservationLoggerStore {
  private sessionId: string = "";
  private simulationId: string = "";
  private taskId: string | null = null;
  private sequence: number = 0;
  private events: ChemistryObservationEvent[] = [];
  private listeners: Set<Listener> = new Set();
  private activePourSession: {
    sourceId: string;
    targetId: string;
    substanceId: string;
    startMonotonicMs: number;
    startOccurredAt: number;
    accumulatedGrams: number;
    initialDistanceM: number;
    initialTiltRad: number;
    startEventId: string;
  } | null = null;

  public initSession(sessionId: string, simulationId: string, taskId: string | null = null) {
    this.sessionId = sessionId;
    this.simulationId = simulationId;
    this.taskId = taskId;
    this.sequence = 0;
    this.events = [];
    this.activePourSession = null;
  }

  public getSessionId(): string {
    return this.sessionId;
  }

  public appendEvent<T extends ChemistryObservationEvent>(
    eventType: T["eventType"],
    source: EventSource,
    payload: T["payload"]
  ): T {
    if (!this.sessionId) {
      this.sessionId = `session-${Date.now()}`;
    }

    this.sequence += 1;
    const sequence = this.sequence;
    const eventId = `${this.sessionId}:${sequence}`;
    const occurredAt = Date.now();
    const monotonicMs = typeof performance !== "undefined" ? performance.now() : occurredAt;

    const base: BaseObservationEvent = {
      sessionId: this.sessionId,
      eventId,
      sequence,
      occurredAt,
      monotonicMs,
      simulationId: this.simulationId || "sim-default",
      taskId: this.taskId,
      actorId: "student",
      source,
      schemaVersion: "1.0",
    };

    const event = {
      ...base,
      eventType,
      payload,
    } as unknown as T;

    if (this.events.length >= MAX_EVENT_LOG_SIZE) {
      this.events.shift(); // FIFO trim
    }
    this.events.push(event);

    // Notify listeners outside react render loop
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (err) {
        console.error("ObservationListener error:", err);
      }
    });

    return event;
  }

  // Aggregate continuous pouring into single start + completed/stopped event
  public handlePourProgress(
    sourceId: string,
    targetId: string,
    substanceId: string,
    deltaGrams: number,
    distanceM: number,
    tiltRad: number
  ) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (!this.activePourSession || this.activePourSession.sourceId !== sourceId || this.activePourSession.targetId !== targetId) {
      // End previous if any
      if (this.activePourSession) {
        this.endPourSession("target_moved");
      }
      // Start new pour session
      const startEvent = this.appendEvent<PourStartedEvent>("pour_started", "workspace", {
        sourceId,
        targetId,
        substanceId,
        initialDistanceM: distanceM,
        initialTiltRad: tiltRad,
      });

      this.activePourSession = {
        sourceId,
        targetId,
        substanceId,
        startMonotonicMs: now,
        startOccurredAt: Date.now(),
        accumulatedGrams: deltaGrams,
        initialDistanceM: distanceM,
        initialTiltRad: tiltRad,
        startEventId: startEvent.eventId,
      };
      return;
    }

    // Accumulate
    this.activePourSession.accumulatedGrams += deltaGrams;
  }

  public endPourSession(stopReason: PourCompletedEvent["payload"]["stopReason"] = "completed") {
    if (!this.activePourSession) return;
    const s = this.activePourSession;
    this.activePourSession = null;

    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const durationMs = Math.max(16, now - s.startMonotonicMs);
    const averageFlowRateGramsPerSec = (s.accumulatedGrams / durationMs) * 1000;

    this.appendEvent<PourCompletedEvent>("pour_completed", "workspace", {
      sourceId: s.sourceId,
      targetId: s.targetId,
      substanceId: s.substanceId,
      totalTransferredGrams: s.accumulatedGrams,
      durationMs: Math.round(durationMs),
      averageFlowRateGramsPerSec: Number(averageFlowRateGramsPerSec.toFixed(2)),
      stopReason,
    });
  }

  public getEvents(): readonly ChemistryObservationEvent[] {
    return this.events;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public resetSession() {
    this.sequence = 0;
    this.events = [];
    this.activePourSession = null;
  }
}

export const observationLogger = new ObservationLoggerStore();
