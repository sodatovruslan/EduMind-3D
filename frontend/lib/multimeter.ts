import { solveCircuit, type CircuitComponent, type Connection } from "./circuit-engine";

export type MultimeterMode = "voltage" | "current" | "resistance";
export type MultimeterStatus = "ok" | "disconnected" | "wrong_mode" | "overload";

export interface MultimeterReading {
  mode: MultimeterMode;
  status: MultimeterStatus;
  value: number | null;
  unit: "V" | "A" | "Ω";
}

export function multimeterComponent(mode: MultimeterMode): CircuitComponent {
  return {
    id: "multimeter",
    kind: mode === "current" ? "ammeter" : "voltmeter",
    terminals: ["multimeter_red", "multimeter_black"],
    meterMode: mode,
  };
}

function probesConnected(connections: Connection[]): boolean {
  return ["multimeter_red", "multimeter_black"].every((terminal) =>
    connections.some((connection) => connection.terminals.includes(terminal))
  );
}

function connectedToLiveSource(components: CircuitComponent[], connections: Connection[]): boolean {
  const adjacency = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    if (!adjacency.has(b)) adjacency.set(b, new Set());
    adjacency.get(a)!.add(b);
    adjacency.get(b)!.add(a);
  };
  connections.forEach((connection) => link(...connection.terminals));
  components.filter((component) => component.kind !== "battery" && component.id !== "multimeter").forEach((component) => link(...component.terminals));
  const targets = new Set(components.filter((component) => component.kind === "battery" && (component.voltageV ?? 0) !== 0).flatMap((component) => component.terminals));
  const queue = ["multimeter_red", "multimeter_black"];
  const seen = new Set(queue);
  while (queue.length) {
    const terminal = queue.shift()!;
    if (targets.has(terminal)) return true;
    for (const next of adjacency.get(terminal) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  }
  return false;
}

export function readMultimeter(
  mode: MultimeterMode,
  components: CircuitComponent[],
  connections: Connection[]
): MultimeterReading {
  const unit = mode === "voltage" ? "V" : mode === "current" ? "A" : "Ω";
  if (!probesConnected(connections)) return { mode, status: "disconnected", value: null, unit };

  if (mode === "resistance") {
    if (connectedToLiveSource(components, connections)) return { mode, status: "wrong_mode", value: null, unit };
    const passive = components.filter((component) => component.kind !== "battery" && component.id !== "multimeter" && component.kind !== "ammeter" && component.kind !== "voltmeter");
    const testSource: CircuitComponent = { id: "multimeter_test_source", kind: "battery", terminals: ["multimeter_red", "multimeter_black"], voltageV: 1 };
    const solution = solveCircuit([testSource, ...passive], connections);
    if (!solution.isCircuitActive || solution.currentA <= 1e-9) return { mode, status: "disconnected", value: null, unit };
    return { mode, status: "ok", value: 1 / solution.currentA, unit };
  }

  const meter = multimeterComponent(mode);
  const solution = solveCircuit([...components.filter((component) => component.id !== "multimeter"), meter], connections);
  const reading = solution.readings.multimeter;
  if (!reading) return { mode, status: "disconnected", value: null, unit };
  if (mode === "current" && (solution.isShortCircuit || Math.abs(reading.currentA) > 10)) {
    return { mode, status: "overload", value: reading.currentA, unit };
  }
  return { mode, status: "ok", value: mode === "voltage" ? reading.voltageV : reading.currentA, unit };
}
