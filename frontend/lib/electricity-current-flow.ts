import { solveCircuit, type CircuitComponent, type CircuitSolution, type Connection } from "@/lib/circuit-engine";

/**
 * Which wires carry current right now, and in which direction — for the
 * moving "charge" beads drawn on the wires. Pure functions on top of the
 * Circuit Engine: nothing here changes or re-implements the physics.
 */

export interface WireFlow {
  /** true: current runs from terminals[1] to terminals[0] (against the wire's own order). */
  reversed: boolean;
}

const CURRENT_EPSILON_A = 1e-9;

/** A wire carries current if taking it out changes what the engine computes. */
function carriesCurrent(
  components: CircuitComponent[],
  connections: Connection[],
  solution: CircuitSolution,
  wire: Connection
): boolean {
  const without = solveCircuit(
    components,
    connections.filter((c) => c.id !== wire.id)
  );
  if (!without.isCircuitActive) return true;
  return Math.abs(without.currentA - solution.currentA) > CURRENT_EPSILON_A;
}

function conducts(component: CircuitComponent): boolean {
  if (component.kind === "battery" || component.kind === "voltmeter") return false;
  if (component.kind === "switch" && component.isClosed === false) return false;
  if (component.kind === "fuse" && component.isBlown) return false;
  return true;
}

/** Steps from the battery's "+" to every terminal, walking wires and conducting parts (never through the battery). */
function distanceFromPositive(components: CircuitComponent[], connections: Connection[]): Map<string, number> {
  const neighbours = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
    neighbours.set(b, [...(neighbours.get(b) ?? []), a]);
  };
  for (const c of connections) link(c.terminals[0], c.terminals[1]);
  for (const c of components) if (conducts(c)) link(c.terminals[0], c.terminals[1]);

  const distance = new Map<string, number>();
  const battery = components.find((c) => c.kind === "battery");
  if (!battery) return distance;
  const queue = [battery.terminals[0]];
  distance.set(battery.terminals[0], 0);
  while (queue.length > 0) {
    const terminal = queue.shift() as string;
    for (const next of neighbours.get(terminal) ?? []) {
      if (distance.has(next)) continue;
      distance.set(next, (distance.get(terminal) as number) + 1);
      queue.push(next);
    }
  }
  return distance;
}

/**
 * Flow for every current-carrying wire, keyed by connection id. Direction is
 * conventional current: away from the battery's "+" terminal, towards "−".
 * Empty when no current flows.
 */
export function computeWireFlows(
  components: CircuitComponent[],
  connections: Connection[],
  solution: CircuitSolution
): Map<string, WireFlow> {
  const flows = new Map<string, WireFlow>();
  if (!solution.isCircuitActive || solution.currentA <= CURRENT_EPSILON_A) return flows;

  const distance = distanceFromPositive(components, connections);
  for (const wire of connections) {
    if (!carriesCurrent(components, connections, solution, wire)) continue;
    const from = distance.get(wire.terminals[0]);
    const to = distance.get(wire.terminals[1]);
    if (from === undefined || to === undefined) continue;
    flows.set(wire.id, { reversed: to < from });
  }
  return flows;
}
