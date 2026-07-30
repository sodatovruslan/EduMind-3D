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

/**
 * Chemistry World — Laboratory Workspace state (Stage 5). Тот же принцип,
 * что и ExperimentStateProvider в Electricity Lab: единый источник правды
 * для расположения оборудования на столе и для данных Chemistry Engine
 * внутри каждого сосуда. Сама физика/химия считается исключительно в
 * chemistry-engine.ts/reaction-engine.ts — этот провайдер только хранит
 * результат и диспетчеризует действия ученика (перетащить/налить/нагреть).
 */
export type ContainerVisualKind = ContainerKind;
export type ToolKind = "burner" | "stand" | "pipette" | "thermometer" | "scale";

export interface ContainerItem {
  id: string;
  kind: ContainerVisualKind;
  position: [number, number];
  rotationY: number;
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

function createContainerItem(id: string, kind: ContainerVisualKind, position: [number, number], rotationY = 0): ContainerItem {
  const data = createEmptyContainer(id, kind);
  const profile = CONTAINER_PHYSICS[kind];
  return {
    id,
    kind,
    position,
    rotationY,
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

export interface ToolItem {
  id: string;
  kind: ToolKind;
  position: [number, number];
  rotationY: number;
  isOn?: boolean; // для горелки
}

export interface StockBottle {
  id: string;
  substanceId: string;
  position: [number, number];
}

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
  | { type: "TOGGLE_BURNER"; id: string }
  | { type: "ADD_SUBSTANCE"; containerId: string; substanceId: string; grams: number }
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
      return { ...state, containers, tools };
    }

    case "ROTATE_ITEM": {
      const rotate = (r: number) => (r + Math.PI / 4) % (Math.PI * 2);
      const containers = state.containers.map((c) => (c.id === action.id ? { ...c, rotationY: rotate(c.rotationY) } : c));
      const tools = state.tools.map((t) => (t.id === action.id ? { ...t, rotationY: rotate(t.rotationY) } : t));
      return { ...state, containers, tools };
    }

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

      const containers = state.containers.map((c) => {
        const profile = CONTAINER_PHYSICS[c.kind];
        const hasHeatSource = isContainerOnStand(c, state.tools) && state.tools.some((t) => t.kind === "burner" && t.isOn);
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
      const tools = justTriggered ? state.tools.map((t) => (t.kind === "burner" ? { ...t, isOn: false } : t)) : state.tools;

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
  const flask = createContainerItem("flask-1", "flask", [1.2, 0.6]);

  const stockBottles: StockBottle[] = [
    { id: "stock-water", substanceId: "water", position: [-3.2, -1.6] },
    { id: "stock-nacl", substanceId: "nacl", position: [-2.1, -1.6] },
    { id: "stock-hcl", substanceId: "hcl", position: [-1.0, -1.6] },
    { id: "stock-naoh", substanceId: "naoh", position: [0.1, -1.6] },
    { id: "stock-cuso4", substanceId: "cuso4", position: [1.2, -1.6] },
    { id: "stock-agno3", substanceId: "agno3", position: [2.3, -1.6] },
  ];

  const tools: ToolItem[] = [
    { id: "burner-1", kind: "burner", position: [2.6, 1.4], rotationY: 0, isOn: false },
    { id: "stand-1", kind: "stand", position: [2.6, 1.4], rotationY: 0 },
    { id: "pipette-1", kind: "pipette", position: [-2.6, 1.4], rotationY: 0 },
    { id: "thermometer-1", kind: "thermometer", position: [0, 1.4], rotationY: 0 },
    { id: "scale-1", kind: "scale", position: [1.5, -0.4], rotationY: 0 },
  ];

  return {
    containers: [beaker, testTube, flask],
    tools,
    stockBottles,
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
  toggleBurner: (id: string) => void;
  addSubstanceToContainer: (containerId: string, substanceId: string, grams: number) => void;
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

  const value: WorkspaceContextValue = {
    state,
    select: useCallback((id) => dispatch({ type: "SELECT", id }), []),
    moveItem: useCallback((id, position) => dispatch({ type: "MOVE_ITEM", id, position }), []),
    rotateItem: useCallback((id) => dispatch({ type: "ROTATE_ITEM", id }), []),
    toggleBurner: useCallback((id) => dispatch({ type: "TOGGLE_BURNER", id }), []),
    addSubstanceToContainer: useCallback(
      (containerId, substanceId, grams) => dispatch({ type: "ADD_SUBSTANCE", containerId, substanceId, grams }),
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
