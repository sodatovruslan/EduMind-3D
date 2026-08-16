/**
 * Stage S9 / Option B — Nodal Analysis circuit solver.
 *
 * SPIKE / PROTOTYPE, kept isolated from production (see
 * `electricity_stage_s9_plan.md`, S9.1). Not wired into
 * ElectricityLabScene.tsx or any production code path — the existing
 * single-loop DFS solver (`circuit-engine.ts`) remains the production
 * solver until Stage S9 explicitly selects a replacement.
 *
 * Unlike the DFS solver (which finds ONE simple loop and only supports a
 * single series contour), this builds a full nodal-conductance linear
 * system from every wired component and solves it — supporting arbitrary
 * series/parallel/mixed topologies with the SAME battery, no per-topology
 * special casing.
 *
 * How ideal components are represented (this is "plain" nodal analysis,
 * not full Modified Nodal Analysis / Option C):
 *  - There is always exactly one battery (ideal voltage source) in this
 *    domain (mirrors circuit-engine.ts's own assumption). Its "+" node is
 *    fixed at `voltageV`, its "-" node is fixed at 0V (ground) — a
 *    boundary-condition elimination, valid because there is only ever one
 *    voltage source. This avoids the extra unknown-current-per-source
 *    equations that full MNA needs for the general multi-source case.
 *  - Zero-resistance ideal elements (closed switch, ammeter, working fuse)
 *    are NOT node-merged; they're kept as ordinary conductance edges with a
 *    very small resistance (EPS_R_OHM). This keeps every component
 *    representable as one conductance stamp, so a single dense linear
 *    solve handles the whole circuit — no separate merge/collapse pass.
 *  - Open switches / blown fuses use a very large resistance (BIG_R_OHM)
 *    instead of removing the edge — same reasoning, and it lets a branch
 *    stay "electrically negligible" without changing the graph shape.
 *  - Voltmeters are excluded from the conductance system entirely (ideal —
 *    draw no current) and read back afterward as a node-potential
 *    difference, exactly like circuit-engine.ts does.
 *
 * This EPS_R_OHM/BIG_R_OHM substitution is the textbook workaround plain
 * nodal analysis uses for ideal switches — and it is also the exact
 * mechanism the roadmap's "Reject if: voltage sources cause numerical
 * instability" criterion is about: mixing ~1e-6 and ~1e9 conductances in
 * one linear system can ill-condition Gaussian elimination. Real,
 * measured numerical behavior (not a guess) is recorded in
 * `solver-spike-report.md`.
 */
import type { CircuitComponent, CircuitSolution, Connection } from "./circuit-engine";

const EPS_R_OHM = 1e-9; // stand-in for a literal 0Ω ideal conductor
const BIG_R_OHM = 1e9; // stand-in for a literal open (infinite resistance) branch
const SHORT_CIRCUIT_RESISTANCE_OHM = 0.5; // same threshold as circuit-engine.ts
const ACTIVE_CURRENT_THRESHOLD_A = 1e-6; // below this, treat as "no current flowing"
const MIN_RESISTANCE_OHM = 0.001; // floor for a literal dead-short current calc, matches the old DFS solver's constant

class UnionFind {
  private parent = new Map<string, string>();

  private find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x)!;
    if (p !== x) {
      const root = this.find(p);
      this.parent.set(x, root);
      return root;
    }
    return x;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }

  nodeOf(terminalId: string): string {
    return this.find(terminalId);
  }
}

function effectiveResistanceOhm(component: CircuitComponent): number {
  switch (component.kind) {
    case "battery":
      return 0; // handled separately as the fixed-voltage boundary condition
    case "resistor":
    case "bulb":
      return component.resistanceOhm ?? 0;
    case "switch":
      return component.isClosed ? EPS_R_OHM : BIG_R_OHM;
    case "ammeter":
      return EPS_R_OHM;
    case "fuse":
      return component.isBlown ? BIG_R_OHM : EPS_R_OHM;
    case "voltmeter":
      return Infinity; // excluded from the conductance system entirely
  }
}

interface Edge {
  component: CircuitComponent;
  nodeA: string;
  nodeB: string;
  resistanceOhm: number;
}

/** Solves Ax = b via Gaussian elimination with partial pivoting. Mutates nothing outside its own copies. */
function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (n === 0) return [];
  const M = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let pivotMagnitude = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const mag = Math.abs(M[r][col]);
      if (mag > pivotMagnitude) {
        pivotMagnitude = mag;
        pivotRow = r;
      }
    }
    if (pivotMagnitude < 1e-300) return null; // singular — no unique solution
    if (pivotRow !== col) [M[col], M[pivotRow]] = [M[pivotRow], M[col]];

    const pivotValue = M[col][col];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / pivotValue;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) {
        M[r][c] -= factor * M[col][c];
      }
    }
  }

  return M.map((row, i) => row[n] / row[i]);
}

export function solveCircuitNodal(components: CircuitComponent[], connections: Connection[]): CircuitSolution {
  const emptySolution: CircuitSolution = {
    isClosedLoop: false,
    isCircuitActive: false,
    currentA: 0,
    isShortCircuit: false,
    fuseToBlowId: null,
    readings: {},
    nodePotentialV: {},
  };

  const battery = components.find((c) => c.kind === "battery");
  if (!battery) return emptySolution;

  const uf = new UnionFind();
  for (const conn of connections) uf.union(conn.terminals[0], conn.terminals[1]);

  const groundNode = uf.nodeOf(battery.terminals[1]);
  const sourceNode = uf.nodeOf(battery.terminals[0]);
  const batteryV = battery.voltageV ?? 0;

  const edges: Edge[] = [];
  const voltmeters: CircuitComponent[] = [];
  for (const component of components) {
    if (component.kind === "battery") continue;
    if (component.kind === "voltmeter") {
      voltmeters.push(component);
      continue;
    }
    const [tA, tB] = component.terminals;
    edges.push({
      component,
      nodeA: uf.nodeOf(tA),
      nodeB: uf.nodeOf(tB),
      resistanceOhm: effectiveResistanceOhm(component),
    });
  }

  // Degenerate dead short: battery+ and battery- wired directly together
  // (no component between them at all), so union-find already collapsed
  // them into ONE node before any resistive edge is considered. This can't
  // go through the general boundary-condition solve below (source and
  // ground would be the same fixed node with two conflicting voltages) —
  // handle it explicitly, matching the old DFS solver's behavior for the
  // same input (its startNode===goalNode check returns an empty path,
  // i.e. zero resistance, immediately). A real production consumer
  // (task-engine.ts's Stage-E "close a short directly across the battery"
  // tasks) depends on exactly this.
  if (sourceNode === groundNode) {
    const currentA = Math.abs(batteryV) / MIN_RESISTANCE_OHM;
    const nodePotentialV: Record<string, number> = { [groundNode]: 0 };
    const readings: Record<string, CircuitSolution["readings"][string]> = {};
    for (const vm of voltmeters) {
      const pA = nodePotentialV[uf.nodeOf(vm.terminals[0])] ?? 0;
      const pB = nodePotentialV[uf.nodeOf(vm.terminals[1])] ?? 0;
      readings[vm.id] = { componentId: vm.id, currentA: 0, voltageV: pA - pB, powerW: 0 };
    }
    return {
      isClosedLoop: true,
      isCircuitActive: true,
      currentA,
      isShortCircuit: true,
      fuseToBlowId: null,
      readings,
      nodePotentialV,
    };
  }

  // isClosedLoop: battery +/- reachable at all through wired components,
  // regardless of open/closed state (mirrors circuit-engine.ts's semantics
  // — a physically wired-but-open circuit is still "isClosedLoop").
  const topologyAdjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!topologyAdjacency.has(edge.nodeA)) topologyAdjacency.set(edge.nodeA, []);
    if (!topologyAdjacency.has(edge.nodeB)) topologyAdjacency.set(edge.nodeB, []);
    topologyAdjacency.get(edge.nodeA)!.push(edge.nodeB);
    topologyAdjacency.get(edge.nodeB)!.push(edge.nodeA);
  }
  const isClosedLoop = isReachable(sourceNode, groundNode, topologyAdjacency);
  if (!isClosedLoop) return emptySolution;

  // Build the nodal system: ground=0V, source=batteryV are fixed; every
  // other node reachable from either of them via SOME edge is an unknown.
  const reachableNodes = collectReachable([sourceNode, groundNode], topologyAdjacency);
  const unknownNodes = [...reachableNodes].filter((n) => n !== groundNode && n !== sourceNode);
  const indexOf = new Map(unknownNodes.map((n, i) => [n, i]));

  const knownV = new Map<string, number>([
    [groundNode, 0],
    [sourceNode, batteryV],
  ]);

  const n = unknownNodes.length;
  const A: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const b: number[] = new Array(n).fill(0);

  const relevantEdges = edges.filter((e) => reachableNodes.has(e.nodeA) && reachableNodes.has(e.nodeB) && e.nodeA !== e.nodeB);

  for (const edge of relevantEdges) {
    const g = 1 / edge.resistanceOhm;
    const ia = indexOf.get(edge.nodeA);
    const ib = indexOf.get(edge.nodeB);

    if (ia !== undefined) A[ia][ia] += g;
    if (ib !== undefined) A[ib][ib] += g;
    if (ia !== undefined && ib !== undefined) {
      A[ia][ib] -= g;
      A[ib][ia] -= g;
    }
    // one side fixed, one unknown -> move the known contribution to b
    if (ia !== undefined && ib === undefined) b[ia] += g * (knownV.get(edge.nodeB) ?? 0);
    if (ib !== undefined && ia === undefined) b[ib] += g * (knownV.get(edge.nodeA) ?? 0);
  }

  const solved = n === 0 ? [] : solveLinearSystem(A, b);
  if (solved === null) return emptySolution; // singular system — treat as unsolved rather than guess

  const nodePotentialV: Record<string, number> = {};
  nodePotentialV[groundNode] = 0;
  nodePotentialV[sourceNode] = batteryV;
  unknownNodes.forEach((node, i) => {
    nodePotentialV[node] = solved[i];
  });

  const vOf = (node: string) => nodePotentialV[node] ?? 0;

  const readings: Record<string, CircuitSolution["readings"][string]> = {};
  for (const edge of edges) {
    const vDrop = vOf(edge.nodeA) - vOf(edge.nodeB);
    const currentA = vDrop / edge.resistanceOhm;
    readings[edge.component.id] = {
      componentId: edge.component.id,
      currentA,
      voltageV: vDrop,
      powerW: currentA * vDrop,
    };
  }
  for (const vm of voltmeters) {
    const pA = vOf(uf.nodeOf(vm.terminals[0]));
    const pB = vOf(uf.nodeOf(vm.terminals[1]));
    readings[vm.id] = { componentId: vm.id, currentA: 0, voltageV: pA - pB, powerW: 0 };
  }

  // Battery current: total current leaving the source node into the
  // resolved network (KCL) — a genuinely derived quantity, not assumed.
  let batteryCurrentA = 0;
  for (const edge of relevantEdges) {
    if (edge.nodeA === sourceNode) batteryCurrentA += (vOf(edge.nodeA) - vOf(edge.nodeB)) / edge.resistanceOhm;
    else if (edge.nodeB === sourceNode) batteryCurrentA += (vOf(edge.nodeB) - vOf(edge.nodeA)) / edge.resistanceOhm;
  }

  const isCircuitActive = Math.abs(batteryCurrentA) > ACTIVE_CURRENT_THRESHOLD_A;
  if (!isCircuitActive) {
    // Same "no current, before-break potential" semantics as circuit-engine.ts's
    // inactive branch: report 0 for every component reading, keep node
    // potentials as solved (they still reflect the physically negligible
    // leakage, effectively the correct "before/after the break" shape for
    // arbitrary topologies since BIG_R_OHM already pins the open side near 0V drop).
    const inactiveReadings: Record<string, CircuitSolution["readings"][string]> = {};
    for (const id of Object.keys(readings)) {
      inactiveReadings[id] = { ...readings[id], currentA: 0, powerW: 0 };
    }
    return {
      isClosedLoop: true,
      isCircuitActive: false,
      currentA: 0,
      isShortCircuit: false,
      fuseToBlowId: null,
      readings: inactiveReadings,
      nodePotentialV,
    };
  }

  const isShortCircuit = Math.abs(batteryV) > 0 && Math.abs(batteryV / batteryCurrentA) < SHORT_CIRCUIT_RESISTANCE_OHM;

  let fuseToBlowId: string | null = null;
  for (const edge of edges) {
    const c = edge.component;
    if (c.kind === "fuse" && c.ratedCurrentA !== undefined && !c.isBlown) {
      if (Math.abs(readings[c.id].currentA) > c.ratedCurrentA) fuseToBlowId = c.id;
    }
  }

  return {
    isClosedLoop: true,
    isCircuitActive: true,
    currentA: Math.abs(batteryCurrentA),
    isShortCircuit,
    fuseToBlowId,
    readings,
    nodePotentialV,
  };
}

function isReachable(start: string, goal: string, adjacency: Map<string, string[]>): boolean {
  if (start === goal) return true;
  const visited = new Set<string>([start]);
  const stack = [start];
  while (stack.length > 0) {
    const node = stack.pop()!;
    for (const next of adjacency.get(node) ?? []) {
      if (next === goal) return true;
      if (!visited.has(next)) {
        visited.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

function collectReachable(starts: string[], adjacency: Map<string, string[]>): Set<string> {
  const visited = new Set<string>(starts);
  const stack = [...starts];
  while (stack.length > 0) {
    const node = stack.pop()!;
    for (const next of adjacency.get(node) ?? []) {
      if (!visited.has(next)) {
        visited.add(next);
        stack.push(next);
      }
    }
  }
  return visited;
}
