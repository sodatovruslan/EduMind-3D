"use client";

import { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import type { CircuitComponent, Connection } from "@/lib/circuit-engine";

/**
 * Physical World Core — Experiment State + Event System.
 * Единый источник правды для компонентов цепи, соединений, выбранного
 * компонента и журнала событий. События одновременно служат
 * Event System'ом (UI реагирует на них) и накапливаются как actions_log
 * для существующего POST /api/simulations/{id}/complete — та же схема,
 * что уже используют SimLab/GeoWorld, здесь просто формализована.
 */
export type SimEvent =
  | { type: "connected"; connectionId: string; terminals: [string, string] }
  | { type: "disconnected"; connectionId: string }
  | { type: "param_changed"; componentId: string; field: string; value: number | boolean }
  | { type: "reset" }
  | { type: "short_circuit" }
  | { type: "fuse_blown"; componentId: string }
  | { type: "component_damaged"; componentId: string };

interface ExperimentState {
  components: CircuitComponent[];
  connections: Connection[];
  selectedId: string | null;
  events: SimEvent[];
}

type Action =
  | { type: "SELECT"; id: string | null }
  | { type: "ADD_CONNECTION"; connection: Connection }
  | { type: "REMOVE_CONNECTION"; connectionId: string }
  | { type: "UPDATE_COMPONENT"; id: string; patch: Partial<CircuitComponent> }
  | { type: "LOG_EVENT"; event: SimEvent }
  | { type: "RESET_EXPERIMENT"; initialComponents: CircuitComponent[] };

function reducer(state: ExperimentState, action: Action): ExperimentState {
  switch (action.type) {
    case "SELECT":
      return { ...state, selectedId: action.id };
    case "ADD_CONNECTION": {
      const alreadyConnected = state.connections.some(
        (c) =>
          (c.terminals[0] === action.connection.terminals[0] && c.terminals[1] === action.connection.terminals[1]) ||
          (c.terminals[0] === action.connection.terminals[1] && c.terminals[1] === action.connection.terminals[0])
      );
      if (alreadyConnected) return state;
      return {
        ...state,
        connections: [...state.connections, action.connection],
        events: [
          ...state.events,
          { type: "connected", connectionId: action.connection.id, terminals: action.connection.terminals },
        ],
      };
    }
    case "REMOVE_CONNECTION":
      return {
        ...state,
        connections: state.connections.filter((c) => c.id !== action.connectionId),
        events: [...state.events, { type: "disconnected", connectionId: action.connectionId }],
      };
    case "UPDATE_COMPONENT":
      return {
        ...state,
        components: state.components.map((c) => (c.id === action.id ? { ...c, ...action.patch } : c)),
      };
    case "LOG_EVENT":
      return { ...state, events: [...state.events, action.event] };
    case "RESET_EXPERIMENT":
      return {
        components: action.initialComponents,
        connections: [],
        selectedId: null,
        events: [...state.events, { type: "reset" }],
      };
    default:
      return state;
  }
}

interface ExperimentContextValue {
  state: ExperimentState;
  select: (id: string | null) => void;
  addConnection: (connection: Connection) => void;
  removeConnection: (connectionId: string) => void;
  updateComponent: (id: string, patch: Partial<CircuitComponent>) => void;
  logEvent: (event: SimEvent) => void;
  resetExperiment: (initialComponents: CircuitComponent[]) => void;
  actionsLog: Record<string, unknown>[];
}

const ExperimentContext = createContext<ExperimentContextValue | undefined>(undefined);

export function ExperimentStateProvider({
  initialComponents,
  children,
}: {
  initialComponents: CircuitComponent[];
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, {
    components: initialComponents,
    connections: [],
    selectedId: null,
    events: [],
  });

  const select = useCallback((id: string | null) => dispatch({ type: "SELECT", id }), []);
  const addConnection = useCallback(
    (connection: Connection) => dispatch({ type: "ADD_CONNECTION", connection }),
    []
  );
  const removeConnection = useCallback(
    (connectionId: string) => dispatch({ type: "REMOVE_CONNECTION", connectionId }),
    []
  );
  const updateComponent = useCallback(
    (id: string, patch: Partial<CircuitComponent>) => dispatch({ type: "UPDATE_COMPONENT", id, patch }),
    []
  );
  const logEvent = useCallback((event: SimEvent) => dispatch({ type: "LOG_EVENT", event }), []);
  const resetExperiment = useCallback(
    (components: CircuitComponent[]) => dispatch({ type: "RESET_EXPERIMENT", initialComponents: components }),
    []
  );

  // тот же формат {action_type, ...}, что actionsLog в SimLab/GeoWorld —
  // отправляется как есть в POST /api/simulations/{id}/complete
  const actionsLog = useMemo(
    () => state.events.map((event) => ({ action_type: event.type, ...event })),
    [state.events]
  );

  const value: ExperimentContextValue = {
    state,
    select,
    addConnection,
    removeConnection,
    updateComponent,
    logEvent,
    resetExperiment,
    actionsLog,
  };

  return <ExperimentContext.Provider value={value}>{children}</ExperimentContext.Provider>;
}

export function useExperimentState(): ExperimentContextValue {
  const ctx = useContext(ExperimentContext);
  if (!ctx) throw new Error("useExperimentState должен использоваться внутри <ExperimentStateProvider>");
  return ctx;
}
