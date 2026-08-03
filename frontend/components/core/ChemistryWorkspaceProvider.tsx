"use client";

import { createContext, useCallback, useContext, useReducer } from "react";
import {
  addSubstance,
  createEmptyContainer,
  heat as heatContainer,
  pour as pourContainer,
  type Container,
  type ContainerKind,
} from "@/lib/chemistry-engine";
import { applyReactions, type Reaction } from "@/lib/reaction-engine";
import { checkSafety } from "@/lib/chemistry-safety";
import { CONTAINER_PHYSICS, createDefaultIntegrity, type IntegrityState } from "@/lib/container-physics";
import {
  createSafeHazardResult,
  evaluateHazard,
  type AccidentLogEntry,
  type HazardCause,
  type HazardLevel,
  type HazardResult,
} from "@/lib/hazard-engine";
import { CABINET_IDS, getCabinet } from "@/lib/cabinets";
import { getInteractable } from "@/lib/interactables";
import { canStoreItemNow, findAvailableSlot, findSlotsForCabinet, getSlot, type StorageSlot } from "@/lib/storage-slots";
import { observationLogger } from "@/lib/observation-logger";

/**
 * Chemistry World — Laboratory Workspace state (Stage 5). Тот же принцип,
 * что и ExperimentStateProvider в Electricity Lab: единый источник правды
 * для расположения оборудования на столе и для данных Chemistry Engine
 * внутри каждого сосуда. Сама физика/химия считается исключительно в
 * chemistry-engine.ts/reaction-engine.ts — этот провайдер только хранит
 * результат и диспетчеризует действия ученика (перетащить/налить/нагреть).
 */
export type ContainerVisualKind = ContainerKind;
export type ToolKind = "burner" | "stand" | "pipette" | "thermometer" | "glass_rod" | "scale";

export interface PortableItemSpatialState {
  position: [number, number];
  rotationY: number;
  elevation: number;
  storageSlotId: string | null;
}

export interface ContainerItem extends PortableItemSpatialState {
  id: string;
  kind: ContainerVisualKind;
  data: Container;
  // Stage 5.5 v2 — Hazard Simulation: герметично закрыт (можно накапливать
  // давление) или открыт (пар свободно выходит)
  isSealed: boolean;
  integrity: IntegrityState;
  pressureKPa: number; // абсолютное, последнее посчитанное Pressure Engine
  hazard: HazardResult; // последний результат Hazard Engine для этого сосуда
  // температура сосуда на момент ПРЕДЫДУЩЕГО тика Hazard Engine — нужна
  // только для расчета скорости изменения температуры (thermal shock),
  // не дублирует текущую temperatureC (та по-прежнему единственный
  // источник правды в Chemistry Engine)
  lastHazardTemperatureC: number;
}

function createContainerItem(
  id: string,
  kind: ContainerVisualKind,
  position: [number, number],
  rotationY = 0,
  elevation = 0.05,
  storageSlotId: string | null = null
): ContainerItem {
  const data = createEmptyContainer(id, kind);
  const profile = CONTAINER_PHYSICS[kind];
  return {
    id,
    kind,
    position,
    rotationY,
    elevation,
    storageSlotId,
    data,
    isSealed: false,
    integrity: createDefaultIntegrity(profile),
    pressureKPa: createSafeHazardResult(data, profile).pressureKPa,
    hazard: createSafeHazardResult(data, profile),
    lastHazardTemperatureC: data.temperatureC,
  };
}

export interface EmergencyStopState {
  containerId: string;
  level: HazardLevel;
  causes: HazardCause[];
  at: number;
}

// AccidentLogEntry переиспользуется из hazard-engine.ts (см. import выше) —
// определен там, а не здесь, чтобы Chemistry Context Builder мог ссылаться
// на тот же тип без обратной зависимости lib -> components
export type { AccidentLogEntry };

const STAND_PROXIMITY_RADIUS = 0.55;
const AMBIENT_TEMPERATURE_C = 20;
const BURNER_HEATING_RATE_C_PER_SEC = 80;
const BURNER_COOLING_RATE_C_PER_SEC = 18;
const BURNER_MAX_TEMPERATURE_C = 350;

// "стоит на штативе" — не отдельное поле состояния, а производное от
// текущей позиции (совпадает со штативом в пределах небольшого радиуса).
// Так это никогда не рассинхронизируется с реальным положением сосуда.
export function isContainerOnStand(container: ContainerItem, tools: ToolItem[]): boolean {
  const stand = tools.find((t) => t.kind === "stand");
  if (!stand) return false;
  const dx = container.position[0] - stand.position[0];
  const dz = container.position[1] - stand.position[1];
  return Math.sqrt(dx * dx + dz * dz) <= STAND_PROXIMITY_RADIUS;
}

export interface ToolItem extends PortableItemSpatialState {
  id: string;
  kind: ToolKind;
  isOn?: boolean; // для горелки
  temperatureC?: number; // температура корпуса горелки; для остальных инструментов не задана
}

export type CapState = "closed" | "open";

export interface StockBottle extends PortableItemSpatialState {
  id: string;
  substanceId: string;
  // Реальный запас вещества: перенос в сосуд атомарно уменьшает это число
  // на ту же массу, которая добавляется в Chemistry Engine.
  capacityGrams: number;
  remainingGrams: number;
  capState: CapState;
  // Stage S-2 — Free Placement: поворот бутылки на столе, тот же смысл, что
  // rotationY у ContainerItem/ToolItem. Раньше отсутствовал, потому что
  // бутылки нельзя было ни повернуть, ни (из-за пробела в MOVE_ITEM ниже)
  // реально передвинуть — оба этих ограничения снимает Stage S-2.
}

export interface CabinetState {
  id: string;
  isOpen: boolean;
}

export type ItemTransform = PortableItemSpatialState;

export interface ReactionLogEntry {
  reactionId: string;
  title: string;
  containerId: string;
  at: number;
}

// Stage 5.6 — реальная запись факта переливания (не путать с ReactionLogEntry:
// переливание само по себе не реакция). Нужна Laboratory Experiment Catalog
// как точный сигнал "переливание реально произошло", а не эвристика по массе
export interface PourLogEntry {
  sourceId: string;
  targetId: string;
  at: number;
}

interface WorkspaceState {
  containers: ContainerItem[];
  tools: ToolItem[];
  stockBottles: StockBottle[];
  cabinets: CabinetState[];
  selectedItemId: string | null;
  activeContainerId: string; // сосуд, который проверяет Experiment Validator
  reactionLog: ReactionLogEntry[]; // id реакций, реально сработавших за сессию (по всем сосудам)
  pourLog: PourLogEntry[]; // реальные факты переливания за сессию
  firstAddedOrder: Record<string, string[]>; // containerId -> substanceId в порядке первого добавления (для Safety System)
  // Stage 5.5 v2 — Hazard Simulation
  emergencyStop: EmergencyStopState | null;
  accidentLog: AccidentLogEntry[];
  elapsedSeconds: number;
}

type Action =
  | { type: "SELECT"; id: string | null }
  | { type: "MOVE_ITEM"; id: string; position: [number, number] }
  | { type: "ROTATE_ITEM"; id: string }
  // Stage S-2 — Free Placement: атомарно пишет и позицию, и произвольный
  // (не дискретный) поворот в момент подтверждённого размещения — ROTATE_ITEM
  // выше умеет только шаг +45°, для размещения нужен ровно накопленный в
  // руке поворот
  | {
      type: "SET_ITEM_TRANSFORM";
      id: string;
      position: [number, number];
      rotationY: number;
      elevation?: number;
      storageSlotId?: string | null;
    }
  | { type: "RELEASE_FROM_SLOT"; id: string }
  | { type: "TOGGLE_CABINET"; id: string }
  | { type: "TOGGLE_BOTTLE_CAP"; id: string }
  | { type: "SET_BOTTLE_CAP_STATE"; id: string; capState: CapState }
  | { type: "TOGGLE_BURNER"; id: string }
  | { type: "ADD_SUBSTANCE"; containerId: string; substanceId: string; grams: number }
  | { type: "POUR_FROM_STOCK"; bottleId: string; targetId: string; grams: number }
  | { type: "POUR"; sourceId: string; targetId: string }
  | { type: "HEAT_TICK"; deltaC: number }
  | { type: "SET_ACTIVE_CONTAINER"; id: string }
  | { type: "TOGGLE_SEAL"; id: string }
  | { type: "HAZARD_TICK"; dtSeconds: number }
  | { type: "RESET_EXPERIMENT" };

function applyReactionsAndLog(container: Container, containerId: string, log: ReactionLogEntry[]): { container: Container; log: ReactionLogEntry[] } {
  const { container: reacted, occurredReactions } = applyReactions(container);
  if (occurredReactions.length === 0) return { container: reacted, log };
  const newEntries = occurredReactions.map((r: Reaction) => ({
    reactionId: r.id,
    title: r.title,
    containerId,
    at: Date.now(),
  }));
  return { container: reacted, log: [...log, ...newEntries] };
}

function reducer(state: WorkspaceState, action: Action): WorkspaceState {
  switch (action.type) {
    case "SELECT":
      return { ...state, selectedItemId: action.id };

    case "MOVE_ITEM": {
      const containers = state.containers.map((c) => (c.id === action.id ? { ...c, position: action.position } : c));
      const tools = state.tools.map((t) => (t.id === action.id ? { ...t, position: action.position } : t));
      // Stage S-2: раньше stockBottles здесь не обновлялись вовсе — бутылку
      // нельзя было реально передвинуть старым drag&drop (только визуально
      // "поднималась" при захвате). Аддитивный фикс, поведение containers/
      // tools выше не меняется ни на строку.
      const stockBottles = state.stockBottles.map((b) => (b.id === action.id ? { ...b, position: action.position } : b));
      return { ...state, containers, tools, stockBottles };
    }

    case "ROTATE_ITEM": {
      const rotate = (r: number) => (r + Math.PI / 4) % (Math.PI * 2);
      const containers = state.containers.map((c) => (c.id === action.id ? { ...c, rotationY: rotate(c.rotationY) } : c));
      const tools = state.tools.map((t) => (t.id === action.id ? { ...t, rotationY: rotate(t.rotationY) } : t));
      return { ...state, containers, tools };
    }

    // Stage S-2 — Free Placement: единственная точка, где Interaction Core
    // пишет в домен (см. ChemistryInteractionProvider.confirmPlacement) —
    // атомарно задаёт позицию и произвольный поворот, ничего не трогая в
    // data (химия) удерживаемого предмета
    case "SET_ITEM_TRANSFORM": {
      const containers = state.containers.map((c) =>
        c.id === action.id
          ? {
              ...c,
              position: action.position,
              rotationY: action.rotationY,
              elevation: action.elevation ?? c.elevation,
              storageSlotId: action.storageSlotId === undefined ? c.storageSlotId : action.storageSlotId,
            }
          : c
      );
      const tools = state.tools.map((t) =>
        t.id === action.id
          ? {
              ...t,
              position: action.position,
              rotationY: action.rotationY,
              elevation: action.elevation ?? t.elevation,
              storageSlotId: action.storageSlotId === undefined ? t.storageSlotId : action.storageSlotId,
            }
          : t
      );
      const stockBottles = state.stockBottles.map((b) =>
        b.id === action.id
          ? {
              ...b,
              position: action.position,
              rotationY: action.rotationY,
              elevation: action.elevation ?? b.elevation,
              storageSlotId: action.storageSlotId === undefined ? b.storageSlotId : action.storageSlotId,
            }
          : b
      );
      return { ...state, containers, tools, stockBottles };
    }

    case "RELEASE_FROM_SLOT": {
      const containers = state.containers.map((item) =>
        item.id === action.id ? { ...item, storageSlotId: null } : item
      );
      const tools = state.tools.map((item) =>
        item.id === action.id ? { ...item, storageSlotId: null } : item
      );
      const stockBottles = state.stockBottles.map((item) =>
        item.id === action.id ? { ...item, storageSlotId: null } : item
      );
      return { ...state, containers, tools, stockBottles };
    }

    case "TOGGLE_CABINET": {
      const targetCabinet = state.cabinets.find((c) => c.id === action.id);
      if (targetCabinet?.isOpen) {
        const slotsInCabinet = new Set(findSlotsForCabinet(action.id).map((s) => s.id));
        const hasOpenBottle = state.stockBottles.some(
          (b) => b.storageSlotId !== null && slotsInCabinet.has(b.storageSlotId) && b.capState === "open"
        );
        if (hasOpenBottle) return state;
      }
      return {
        ...state,
        cabinets: state.cabinets.map((cabinet) =>
          cabinet.id === action.id ? { ...cabinet, isOpen: !cabinet.isOpen } : cabinet
        ),
      };
    }

    case "TOGGLE_BOTTLE_CAP":
      return {
        ...state,
        stockBottles: state.stockBottles.map((b) =>
          b.id === action.id ? { ...b, capState: b.capState === "open" ? "closed" : "open" } : b
        ),
      };

    case "SET_BOTTLE_CAP_STATE":
      return {
        ...state,
        stockBottles: state.stockBottles.map((b) =>
          b.id === action.id ? { ...b, capState: action.capState } : b
        ),
      };

    case "TOGGLE_BURNER": {
      // Emergency Stop блокирует новый нагрев, но не блокирует его выключение —
      // выключить горелку разрешено всегда
      if (state.emergencyStop) {
        const tool = state.tools.find((t) => t.id === action.id);
        if (tool && !tool.isOn) return state; // нельзя ВКЛЮЧИТЬ горелку во время аварии
      }
      return { ...state, tools: state.tools.map((t) => (t.id === action.id ? { ...t, isOn: !t.isOn } : t)) };
    }

    case "ADD_SUBSTANCE": {
      if (state.emergencyStop) return state;
      const target = state.containers.find((c) => c.id === action.containerId);
      if (!target) return state;
      const updatedData = addSubstance(target.data, action.substanceId, action.grams);
      const { container: reacted, log } = applyReactionsAndLog(updatedData, action.containerId, state.reactionLog);

      const existingOrder = state.firstAddedOrder[action.containerId] ?? [];
      const newOrder = existingOrder.includes(action.substanceId) ? existingOrder : [...existingOrder, action.substanceId];

      return {
        ...state,
        containers: state.containers.map((c) => (c.id === action.containerId ? { ...c, data: reacted } : c)),
        reactionLog: log,
        firstAddedOrder: { ...state.firstAddedOrder, [action.containerId]: newOrder },
      };
    }

    case "POUR_FROM_STOCK": {
      if (state.emergencyStop) return state;
      const bottle = state.stockBottles.find((b) => b.id === action.bottleId);
      const target = state.containers.find((c) => c.id === action.targetId);
      if (!bottle || !target || action.grams <= 0 || bottle.remainingGrams <= 0 || bottle.capState !== "open") return state;

      const transferredGrams = Math.min(action.grams, bottle.remainingGrams);
      const updatedData = addSubstance(target.data, bottle.substanceId, transferredGrams);
      const { container: reacted, log } = applyReactionsAndLog(updatedData, action.targetId, state.reactionLog);
      const existingOrder = state.firstAddedOrder[action.targetId] ?? [];
      const newOrder = existingOrder.includes(bottle.substanceId)
        ? existingOrder
        : [...existingOrder, bottle.substanceId];

      return {
        ...state,
        containers: state.containers.map((c) => (c.id === action.targetId ? { ...c, data: reacted } : c)),
        stockBottles: state.stockBottles.map((b) =>
          b.id === action.bottleId ? { ...b, remainingGrams: b.remainingGrams - transferredGrams } : b
        ),
        reactionLog: log,
        firstAddedOrder: { ...state.firstAddedOrder, [action.targetId]: newOrder },
      };
    }

    case "POUR": {
      if (state.emergencyStop) return state;
      const source = state.containers.find((c) => c.id === action.sourceId);
      const target = state.containers.find((c) => c.id === action.targetId);
      if (!source || !target) return state;
      const { source: newSourceData, target: newTargetData } = pourContainer(source.data, target.data, 1);
      const { container: reacted, log } = applyReactionsAndLog(newTargetData, action.targetId, state.reactionLog);

      const sourceOrder = state.firstAddedOrder[action.sourceId] ?? [];
      const existingTargetOrder = state.firstAddedOrder[action.targetId] ?? [];
      const mergedOrder = [...existingTargetOrder, ...sourceOrder.filter((id) => !existingTargetOrder.includes(id))];

      return {
        ...state,
        containers: state.containers.map((c) => {
          if (c.id === action.sourceId) return { ...c, data: newSourceData };
          if (c.id === action.targetId) return { ...c, data: reacted };
          return c;
        }),
        reactionLog: log,
        pourLog: [...state.pourLog, { sourceId: action.sourceId, targetId: action.targetId, at: Date.now() }],
        firstAddedOrder: { ...state.firstAddedOrder, [action.targetId]: mergedOrder },
      };
    }

    case "HEAT_TICK": {
      const burnerOn = state.tools.some((t) => t.kind === "burner" && t.isOn);
      if (!burnerOn) return state;
      let log = state.reactionLog;
      const containers = state.containers.map((c) => {
        if (!isContainerOnStand(c, state.tools)) return c;
        const heated = heatContainer(c.data, action.deltaC);
        const result = applyReactionsAndLog(heated, c.id, log);
        log = result.log;
        return { ...c, data: result.container };
      });
      return { ...state, containers, reactionLog: log };
    }

    case "SET_ACTIVE_CONTAINER":
      return { ...state, activeContainerId: action.id };

    case "TOGGLE_SEAL": {
      if (state.emergencyStop) return state;
      return {
        ...state,
        containers: state.containers.map((c) => (c.id === action.id ? { ...c, isSealed: !c.isSealed } : c)),
      };
    }

    // Контролируемый шаг симуляции Hazard Engine — вызывается с фиксированной
    // частотой (см. ChemistryWorldScene), НЕ каждый кадр рендера. Реальный
    // расчет физики (heatTick/addSubstance/pour) уже произошел раньше —
    // здесь только оценка опасности по уже посчитанному состоянию.
    case "HAZARD_TICK": {
      let accidentLog = state.accidentLog;
      let emergencyStop = state.emergencyStop;

      // Температура корпуса горелки — реальное runtime-состояние для общего
      // pickup guard. Тот же контролируемый тик работает и при выключенной
      // горелке, поэтому после гашения корпус постепенно остывает.
      const thermallyUpdatedTools = state.tools.map((tool) => {
        if (tool.kind !== "burner") return tool;
        const current = tool.temperatureC ?? AMBIENT_TEMPERATURE_C;
        const temperatureC = tool.isOn
          ? Math.min(BURNER_MAX_TEMPERATURE_C, current + BURNER_HEATING_RATE_C_PER_SEC * action.dtSeconds)
          : Math.max(AMBIENT_TEMPERATURE_C, current - BURNER_COOLING_RATE_C_PER_SEC * action.dtSeconds);
        return { ...tool, temperatureC };
      });

      const containers = state.containers.map((c) => {
        const profile = CONTAINER_PHYSICS[c.kind];
        const hasHeatSource = isContainerOnStand(c, thermallyUpdatedTools) && thermallyUpdatedTools.some((t) => t.kind === "burner" && t.isOn);
        const safetyWarnings = checkSafety({ container: c.data, firstAddedOrder: state.firstAddedOrder[c.id] });
        const reactionLogForContainer = state.reactionLog
          .filter((e) => e.containerId === c.id)
          .map((e) => ({ reactionId: e.reactionId, title: e.title, at: e.at }));

        const hazard = evaluateHazard({
          container: c.data,
          profile,
          isSealed: c.isSealed,
          hasHeatSource,
          safetyWarnings,
          reactionLog: reactionLogForContainer,
          previousIntegrity: c.integrity,
          previousPressureKPa: c.pressureKPa,
          previousTemperatureC: c.lastHazardTemperatureC,
          dtSeconds: action.dtSeconds,
        });

        if (hazard.level !== c.hazard.level) {
          accidentLog = [
            ...accidentLog,
            {
              at: Date.now(),
              containerId: c.id,
              level: hazard.level,
              causes: hazard.causes,
              temperatureC: hazard.temperatureC,
              pressureKPa: hazard.pressureKPa,
              integrityLevel: hazard.containerIntegrity.level,
              event: `Уровень опасности: ${c.hazard.level} → ${hazard.level}`,
            },
          ];
        }

        if (hazard.shouldStopExperiment && !emergencyStop) {
          emergencyStop = { containerId: c.id, level: hazard.level, causes: hazard.causes, at: Date.now() };
        }

        return {
          ...c,
          integrity: hazard.containerIntegrity,
          pressureKPa: hazard.pressureKPa,
          hazard,
          lastHazardTemperatureC: hazard.temperatureC,
        };
      });

      // аварийная остановка гасит активный нагрев ровно в тот тик, когда сработала
      const justTriggered = emergencyStop !== null && emergencyStop !== state.emergencyStop;
      const tools = justTriggered
        ? thermallyUpdatedTools.map((t) => (t.kind === "burner" ? { ...t, isOn: false } : t))
        : thermallyUpdatedTools;

      return {
        ...state,
        containers,
        tools,
        accidentLog,
        emergencyStop,
        elapsedSeconds: state.elapsedSeconds + action.dtSeconds,
      };
    }

    case "RESET_EXPERIMENT":
      return createInitialState();

    default:
      return state;
  }
}

function createInitialState(): WorkspaceState {
  const beaker = createContainerItem("beaker-1", "beaker", [0, 0]);
  const testTube = createContainerItem("test-tube-1", "test_tube", [-1.2, 0.6]);
  const flaskSlot = getSlot("cabinet-left-inner-slot-1");
  if (!flaskSlot) throw new Error("Missing initial flask storage slot");
  const flask = createContainerItem(
    "flask-1",
    "flask",
    flaskSlot.position,
    flaskSlot.rotationY,
    flaskSlot.elevation,
    flaskSlot.id
  );

  const stockBottles: StockBottle[] = [
    { id: "stock-water", substanceId: "water", position: [-3.2, -1.6], rotationY: 0, elevation: 0.16, storageSlotId: null, capacityGrams: 500, remainingGrams: 500, capState: "closed" },
    { id: "stock-nacl", substanceId: "nacl", position: [-2.1, -1.6], rotationY: 0, elevation: 0.16, storageSlotId: null, capacityGrams: 500, remainingGrams: 500, capState: "closed" },
    { id: "stock-hcl", substanceId: "hcl", position: [-1.0, -1.6], rotationY: 0, elevation: 0.16, storageSlotId: null, capacityGrams: 500, remainingGrams: 500, capState: "closed" },
    { id: "stock-naoh", substanceId: "naoh", position: [0.1, -1.6], rotationY: 0, elevation: 0.16, storageSlotId: null, capacityGrams: 500, remainingGrams: 500, capState: "closed" },
    { id: "stock-cuso4", substanceId: "cuso4", position: [1.2, -1.6], rotationY: 0, elevation: 0.16, storageSlotId: null, capacityGrams: 500, remainingGrams: 500, capState: "closed" },
    { id: "stock-agno3", substanceId: "agno3", position: [2.3, -1.6], rotationY: 0, elevation: 0.16, storageSlotId: null, capacityGrams: 500, remainingGrams: 500, capState: "closed" },
  ];

  const tools: ToolItem[] = [
    { id: "burner-1", kind: "burner", position: [2.6, 1.4], rotationY: 0, elevation: 0, storageSlotId: null, isOn: false, temperatureC: 20 },
    { id: "stand-1", kind: "stand", position: [2.6, 1.4], rotationY: 0, elevation: 0, storageSlotId: null },
    { id: "pipette-1", kind: "pipette", position: [-2.6, 1.4], rotationY: 0, elevation: 0.05, storageSlotId: null },
    { id: "thermometer-1", kind: "thermometer", position: [0, 1.4], rotationY: 0, elevation: 0.05, storageSlotId: null },
    { id: "glass-rod-1", kind: "glass_rod", position: [-1.8, 1.4], rotationY: 0, elevation: 0.05, storageSlotId: null },
    { id: "scale-1", kind: "scale", position: [1.5, -0.4], rotationY: 0, elevation: 0, storageSlotId: null },
  ];

  return {
    containers: [beaker, testTube, flask],
    tools,
    stockBottles,
    cabinets: CABINET_IDS.map((id) => ({ id, isOpen: false })),
    selectedItemId: null,
    activeContainerId: beaker.id,
    reactionLog: [],
    pourLog: [],
    firstAddedOrder: {},
    emergencyStop: null,
    accidentLog: [],
    elapsedSeconds: 0,
  };
}

interface WorkspaceContextValue {
  state: WorkspaceState;
  select: (id: string | null) => void;
  moveItem: (id: string, position: [number, number]) => void;
  rotateItem: (id: string) => void;
  setItemTransform: (
    id: string,
    position: [number, number],
    rotationY: number,
    options?: { elevation?: number; storageSlotId?: string | null }
  ) => void;
  releaseItemFromSlot: (id: string) => void;
  toggleCabinet: (id: string) => void;
  toggleBottleCap: (id: string) => void;
  setBottleCapState: (id: string, capState: CapState) => void;
  findAvailableStorageSlot: (id: string, cabinetId: string) => StorageSlot | null;
  storeItemInCabinet: (id: string, cabinetId: string) => boolean;
  toggleBurner: (id: string) => void;
  addSubstanceToContainer: (containerId: string, substanceId: string, grams: number) => void;
  pourFromStockBottle: (bottleId: string, targetId: string, grams: number) => void;
  pourInto: (sourceId: string, targetId: string) => void;
  heatTick: (deltaC: number) => void;
  setActiveContainer: (id: string) => void;
  toggleSeal: (id: string) => void;
  hazardTick: (dtSeconds: number) => void;
  resetExperiment: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function ChemistryWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);

  const findAvailableStorageSlot = useCallback(
    (id: string, cabinetId: string): StorageSlot | null => {
      const item = [...state.containers, ...state.stockBottles, ...state.tools].find((item) => item.id === id);
      if (!item || !canStoreItemNow(item)) return null;
      const capability = getInteractable(id);
      if (!capability) return null;
      const occupied = new Set(
        [...state.containers, ...state.stockBottles, ...state.tools]
          .filter((i) => i.id !== id && i.storageSlotId !== null)
          .map((i) => i.storageSlotId as string)
      );
      return findAvailableSlot(cabinetId, capability, occupied);
    },
    [state.containers, state.stockBottles, state.tools]
  );

  const toggleCabinet = useCallback(
    (id: string) => {
      const cab = state.cabinets.find((c) => c.id === id);
      const cabConfig = getCabinet(id);
      dispatch({ type: "TOGGLE_CABINET", id });
      if (cab) {
        if (!cab.isOpen) {
          observationLogger.appendEvent("cabinet_opened", "workspace", {
            cabinetId: id,
            cabinetName: cabConfig?.displayName ?? "Шкаф",
          });
        } else {
          observationLogger.appendEvent("cabinet_closed", "workspace", {
            cabinetId: id,
            cabinetName: cabConfig?.displayName ?? "Шкаф",
          });
        }
      }
    },
    [state.cabinets]
  );

  const toggleBottleCap = useCallback(
    (id: string) => {
      const bottle = state.stockBottles.find((b) => b.id === id);
      dispatch({ type: "TOGGLE_BOTTLE_CAP", id });
      if (bottle) {
        if (bottle.capState === "closed") {
          observationLogger.appendEvent("cap_opened", "workspace", {
            objectId: id,
            bottleName: bottle.substanceId,
          });
        } else {
          observationLogger.appendEvent("cap_closed", "workspace", {
            objectId: id,
            bottleName: bottle.substanceId,
          });
        }
      }
    },
    [state.stockBottles]
  );

  const storeItemInCabinet = useCallback(
    (id: string, cabinetId: string): boolean => {
      const cabinet = state.cabinets.find((entry) => entry.id === cabinetId);
      if (!cabinet?.isOpen) return false;
      const slot = findAvailableStorageSlot(id, cabinetId);
      if (!slot) return false;
      dispatch({
        type: "SET_ITEM_TRANSFORM",
        id,
        position: slot.position,
        rotationY: slot.rotationY,
        elevation: slot.elevation,
        storageSlotId: slot.id,
      });
      observationLogger.appendEvent("item_stored", "workspace", {
        objectId: id,
        cabinetId,
        slotId: slot.id,
      });
      return true;
    },
    [findAvailableStorageSlot, state.cabinets]
  );

  const pourFromStockBottle = useCallback(
    (bottleId: string, targetId: string, grams: number) => {
      const bottle = state.stockBottles.find((b) => b.id === bottleId);
      if (bottle && bottle.capState === "closed") {
        observationLogger.appendEvent("pour_blocked", "workspace", {
          sourceId: bottleId,
          targetId,
          reasonCode: "cap_closed",
          details: "Крышка бутылки закрыта",
        });
        return;
      }
      dispatch({ type: "POUR_FROM_STOCK", bottleId, targetId, grams });
      if (bottle) {
        observationLogger.handlePourProgress(bottleId, targetId, bottle.substanceId, grams, 0.2, Math.PI / 3);
      }
    },
    [state.stockBottles]
  );

  const addSubstanceToContainer = useCallback((containerId: string, substanceId: string, grams: number) => {
    dispatch({ type: "ADD_SUBSTANCE", containerId, substanceId, grams });
    const target = state.containers.find((c) => c.id === containerId);
    const existing = target?.data.contents.find((c) => c.substanceId === substanceId)?.grams ?? 0;
    observationLogger.appendEvent("substance_added", "workspace", {
      targetContainerId: containerId,
      substanceId,
      addedGrams: grams,
      newTotalGrams: existing + grams,
    });
  }, [state.containers]);

  const value: WorkspaceContextValue = {
    state,
    select: useCallback((id) => dispatch({ type: "SELECT", id }), []),
    moveItem: useCallback((id, position) => dispatch({ type: "MOVE_ITEM", id, position }), []),
    rotateItem: useCallback((id) => dispatch({ type: "ROTATE_ITEM", id }), []),
    setItemTransform: useCallback(
      (id, position, rotationY, options) =>
        dispatch({
          type: "SET_ITEM_TRANSFORM",
          id,
          position,
          rotationY,
          elevation: options?.elevation,
          storageSlotId: options?.storageSlotId,
        }),
      []
    ),
    releaseItemFromSlot: useCallback((id) => dispatch({ type: "RELEASE_FROM_SLOT", id }), []),
    toggleCabinet: useCallback((id) => dispatch({ type: "TOGGLE_CABINET", id }), []),
    toggleBottleCap: useCallback((id) => dispatch({ type: "TOGGLE_BOTTLE_CAP", id }), []),
    setBottleCapState: useCallback((id, capState) => dispatch({ type: "SET_BOTTLE_CAP_STATE", id, capState }), []),
    findAvailableStorageSlot,
    storeItemInCabinet,
    toggleBurner: useCallback((id) => dispatch({ type: "TOGGLE_BURNER", id }), []),
    addSubstanceToContainer: useCallback(
      (containerId, substanceId, grams) => dispatch({ type: "ADD_SUBSTANCE", containerId, substanceId, grams }),
      []
    ),
    pourFromStockBottle: useCallback(
      (bottleId, targetId, grams) => dispatch({ type: "POUR_FROM_STOCK", bottleId, targetId, grams }),
      []
    ),
    pourInto: useCallback((sourceId, targetId) => dispatch({ type: "POUR", sourceId, targetId }), []),
    heatTick: useCallback((deltaC) => dispatch({ type: "HEAT_TICK", deltaC }), []),
    setActiveContainer: useCallback((id) => dispatch({ type: "SET_ACTIVE_CONTAINER", id }), []),
    toggleSeal: useCallback((id) => dispatch({ type: "TOGGLE_SEAL", id }), []),
    hazardTick: useCallback((dtSeconds) => dispatch({ type: "HAZARD_TICK", dtSeconds }), []),
    resetExperiment: useCallback(() => dispatch({ type: "RESET_EXPERIMENT" }), []),
  };

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useChemistryWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useChemistryWorkspace должен использоваться внутри <ChemistryWorkspaceProvider>");
  return ctx;
}
