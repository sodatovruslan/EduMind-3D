/**
 * Physical World Core — физика электрической цепи. Чистые функции, без
 * Three.js/React: считает реальный ток по закону Ома, короткое замыкание,
 * перегорание предохранителя и показания приборов. Рендер (ElectricityLabScene)
 * только отображает то, что здесь посчитано — никаких случайных чисел и
 * "зашитых" в анимацию результатов.
 *
 * MVP-ограничение: поддерживается только один последовательный контур
 * (без параллельных ветвей). Для реального параллельного расчета нужен
 * полноценный узловой анализ (Kirchhoff/matrix) — за рамками v1, см. план.
 */

export type ComponentKind = "battery" | "resistor" | "bulb" | "switch" | "ammeter" | "fuse" | "voltmeter";

export interface CircuitComponent {
  id: string;
  kind: ComponentKind;
  terminals: [string, string];
  voltageV?: number; // battery
  resistanceOhm?: number; // resistor / bulb (номинальное сопротивление)
  ratedPowerW?: number; // bulb — мощность при номинальном напряжении, для нормировки яркости
  isClosed?: boolean; // switch
  ratedCurrentA?: number; // fuse — порог срабатывания
  isBlown?: boolean; // fuse — текущее состояние (мутируется вызывающим кодом между расчетами)
}

export interface Connection {
  id: string;
  terminals: [string, string];
}

export interface ComponentReading {
  componentId: string;
  currentA: number;
  voltageV: number;
  powerW: number;
}

export interface CircuitSolution {
  isClosedLoop: boolean; // контур через батарею вообще найден
  isCircuitActive: boolean; // контур замкнут И ток реально течет (нет разрыва)
  currentA: number;
  isShortCircuit: boolean;
  fuseToBlowId: string | null; // предохранитель, который должен перегореть по итогам ЭТОГО расчета
  readings: Record<string, ComponentReading>;
  nodePotentialV: Record<string, number>;
}

const SHORT_CIRCUIT_RESISTANCE_OHM = 0.5;
const MIN_RESISTANCE_OHM = 0.001;

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

function resistanceOf(component: CircuitComponent): number {
  switch (component.kind) {
    case "battery":
      return 0;
    case "resistor":
    case "bulb":
      return component.resistanceOhm ?? 0;
    case "switch":
      return component.isClosed ? 0 : Infinity;
    case "ammeter":
      return 0;
    case "fuse":
      return component.isBlown ? Infinity : 0;
    case "voltmeter":
      return Infinity; // идеальный вольтметр не проводит ток
  }
}

interface PathStep {
  component: CircuitComponent;
  toNode: string;
}

// DFS от узла battery+ до узла battery- через все НЕ-battery/НЕ-voltmeter
// компоненты. Возвращает первый найденный путь — для MVP предполагается,
// что схема, собранная учеником, образует ровно один простой контур.
function findLoopPath(
  startNode: string,
  goalNode: string,
  adjacency: Map<string, Array<{ toNode: string; component: CircuitComponent }>>
): PathStep[] | null {
  const visitedComponents = new Set<string>();

  function dfs(node: string): PathStep[] | null {
    if (node === goalNode) return [];
    const edges = adjacency.get(node) ?? [];
    for (const edge of edges) {
      if (visitedComponents.has(edge.component.id)) continue;
      visitedComponents.add(edge.component.id);
      const rest = dfs(edge.toNode);
      if (rest !== null) return [{ component: edge.component, toNode: edge.toNode }, ...rest];
      visitedComponents.delete(edge.component.id);
    }
    return null;
  }

  return dfs(startNode);
}

export function solveCircuit(components: CircuitComponent[], connections: Connection[]): CircuitSolution {
  const uf = new UnionFind();
  for (const conn of connections) {
    uf.union(conn.terminals[0], conn.terminals[1]);
  }

  const battery = components.find((c) => c.kind === "battery");
  const emptySolution: CircuitSolution = {
    isClosedLoop: false,
    isCircuitActive: false,
    currentA: 0,
    isShortCircuit: false,
    fuseToBlowId: null,
    readings: {},
    nodePotentialV: {},
  };
  if (!battery) return emptySolution;

  const adjacency = new Map<string, Array<{ toNode: string; component: CircuitComponent }>>();
  const addEdge = (nodeA: string, nodeB: string, component: CircuitComponent) => {
    if (!adjacency.has(nodeA)) adjacency.set(nodeA, []);
    adjacency.get(nodeA)!.push({ toNode: nodeB, component });
  };
  for (const component of components) {
    if (component.kind === "battery" || component.kind === "voltmeter") continue;
    const [tA, tB] = component.terminals;
    const nodeA = uf.nodeOf(tA);
    const nodeB = uf.nodeOf(tB);
    addEdge(nodeA, nodeB, component);
    addEdge(nodeB, nodeA, component);
  }

  const startNode = uf.nodeOf(battery.terminals[0]);
  const goalNode = uf.nodeOf(battery.terminals[1]);
  const path = findLoopPath(startNode, goalNode, adjacency);

  if (path === null) return emptySolution;

  const breakIndex = path.findIndex((step) => resistanceOf(step.component) === Infinity);
  const isCircuitActive = breakIndex === -1;

  const nodePotentialV: Record<string, number> = { [startNode]: battery.voltageV ?? 0 };
  const readings: Record<string, ComponentReading> = {};

  if (!isCircuitActive) {
    // разрыв где-то в контуре: до разрыва потенциал = V (нет тока -> нет падения),
    // сам разрыв "принимает" на себя всю ЭДС, после разрыва потенциал = 0
    let node = startNode;
    let potential = battery.voltageV ?? 0;
    for (let i = 0; i < path.length; i++) {
      const step = path[i];
      readings[step.component.id] = { componentId: step.component.id, currentA: 0, voltageV: 0, powerW: 0 };
      if (i === breakIndex) potential = 0;
      node = step.toNode;
      nodePotentialV[node] = potential;
    }
    for (const component of components) {
      if (component.kind !== "voltmeter") continue;
      const pA = nodePotentialV[uf.nodeOf(component.terminals[0])] ?? 0;
      const pB = nodePotentialV[uf.nodeOf(component.terminals[1])] ?? 0;
      readings[component.id] = { componentId: component.id, currentA: 0, voltageV: pA - pB, powerW: 0 };
    }
    return {
      isClosedLoop: true,
      isCircuitActive: false,
      currentA: 0,
      isShortCircuit: false,
      fuseToBlowId: null,
      readings,
      nodePotentialV,
    };
  }

  const rawResistanceTotal = path.reduce((sum, step) => sum + resistanceOf(step.component), 0);
  const isShortCircuit = rawResistanceTotal < SHORT_CIRCUIT_RESISTANCE_OHM;
  const resistanceTotal = Math.max(rawResistanceTotal, MIN_RESISTANCE_OHM);
  const currentA = (battery.voltageV ?? 0) / resistanceTotal;

  let fuseToBlowId: string | null = null;
  let potential = battery.voltageV ?? 0;
  for (const step of path) {
    const r = resistanceOf(step.component);
    const voltageV = currentA * r;
    readings[step.component.id] = { componentId: step.component.id, currentA, voltageV, powerW: currentA * currentA * r };
    potential -= voltageV;
    nodePotentialV[step.toNode] = potential;

    if (step.component.kind === "fuse" && step.component.ratedCurrentA !== undefined && !step.component.isBlown) {
      if (currentA > step.component.ratedCurrentA) fuseToBlowId = step.component.id;
    }
  }

  for (const component of components) {
    if (component.kind !== "voltmeter") continue;
    const pA = nodePotentialV[uf.nodeOf(component.terminals[0])] ?? 0;
    const pB = nodePotentialV[uf.nodeOf(component.terminals[1])] ?? 0;
    readings[component.id] = { componentId: component.id, currentA: 0, voltageV: pA - pB, powerW: 0 };
  }

  return {
    isClosedLoop: true,
    isCircuitActive: true,
    currentA,
    isShortCircuit,
    fuseToBlowId,
    readings,
    nodePotentialV,
  };
}

// яркость лампы 0..1, нормированная по номинальной мощности — реальная
// физика (P=I^2R), а не декоративная анимация
export function bulbBrightness(reading: ComponentReading | undefined, ratedPowerW: number): number {
  if (!reading || ratedPowerW <= 0) return 0;
  return Math.max(0, Math.min(1, reading.powerW / ratedPowerW));
}
