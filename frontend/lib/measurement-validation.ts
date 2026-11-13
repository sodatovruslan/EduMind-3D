import type { CircuitComponent, CircuitSolution, Connection } from "./circuit-engine";

/**
 * Stage S9.3 — Measurement Tools placement validation. Чистые функции, без
 * React/Three, тот же принцип, что и circuit-engine.ts/task-engine.ts:
 * ничего не пересчитывает физику заново, только читает уже посчитанный
 * CircuitSolution (production Nodal Analysis solver, см. circuit-engine.ts)
 * и реальную топологию проводов (Connection[]).
 *
 * Топологические примитивы (NodeUnionFind/nodePairKey/componentsOnSameNodePair/
 * isTerminalWired) перенесены сюда ИЗ task-engine.ts, который раньше держал
 * свою собственную копию — единый источник правды для "что с чем реально
 * электрически соединено", используемый и заданиями (Task 2/3), и
 * показаниями приборов на самой сцене (реальный варн вместо мгновенного
 * значения при неправильном подключении).
 */

class NodeUnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
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
}

export function buildNodeGroups(connections: Connection[]): NodeUnionFind {
  const uf = new NodeUnionFind();
  for (const connection of connections) uf.union(connection.terminals[0], connection.terminals[1]);
  return uf;
}

export function nodePairKey(component: CircuitComponent, uf: NodeUnionFind): string {
  return component.terminals
    .map((t) => uf.find(t))
    .sort()
    .join("::");
}

// компоненты, чьи выводы соединены ровно с той же парой узлов, что и целевой
// компонент — то есть реально включены параллельно ему в текущей проводке
export function componentsOnSameNodePair(
  components: CircuitComponent[],
  uf: NodeUnionFind,
  targetId: string
): CircuitComponent[] {
  const target = components.find((c) => c.id === targetId);
  if (!target) return [];
  const key = nodePairKey(target, uf);
  return components.filter((c) => c.id !== targetId && nodePairKey(c, uf) === key);
}

export function isTerminalWired(connections: Connection[], terminalId: string): boolean {
  return connections.some((c) => c.terminals[0] === terminalId || c.terminals[1] === terminalId);
}

export type AmmeterPlacementStatus = "not_connected" | "parallel_invalid" | "not_in_loop" | "valid";

export interface AmmeterPlacementCheck {
  status: AmmeterPlacementStatus;
  shuntedComponentId?: string;
}

/**
 * Амперметр — идеально малое сопротивление (см. effectiveResistanceOhm в
 * nodal-analysis-solver.ts), поэтому подключение параллельно любому другому
 * компоненту физически шунтирует его: solveCircuit() честно посчитает
 * огромный ток через амперметр (он и правда потечёт в реальной жизни), но
 * педагогически это НЕ "ток через цепь", который хотел измерить ученик —
 * это тот же диагноз, что уже существовал в Task 2 (task-engine.ts), теперь
 * доступный приборной панели самой сцены в реальном времени.
 */
export function checkAmmeterPlacement(
  components: CircuitComponent[],
  connections: Connection[],
  solution: CircuitSolution,
  ammeterId = "ammeter"
): AmmeterPlacementCheck {
  const terminals = components.find((c) => c.id === ammeterId)?.terminals;
  const connected = terminals
    ? isTerminalWired(connections, terminals[0]) || isTerminalWired(connections, terminals[1])
    : false;
  if (!connected) return { status: "not_connected" };

  const uf = buildNodeGroups(connections);
  const parallelWith = componentsOnSameNodePair(components, uf, ammeterId);
  if (parallelWith.length > 0) {
    return { status: "parallel_invalid", shuntedComponentId: parallelWith[0].id };
  }
  if (solution.readings[ammeterId] === undefined) {
    return { status: "not_in_loop" };
  }
  return { status: "valid" };
}

export type VoltmeterPlacementStatus = "not_connected" | "series_invalid" | "valid";

export interface VoltmeterPlacementCheck {
  status: VoltmeterPlacementStatus;
}

/**
 * Вольтметр — идеально большое сопротивление, поэтому если он оказался
 * ЕДИНСТВЕННЫМ мостом между двумя иначе не связанными группами узлов (его
 * пара узлов не совпадает ни с одним другим компонентом), он фактически
 * встроен ПОСЛЕДОВАТЕЛЬНО и своим огромным сопротивлением блокирует ток —
 * solveCircuit() уже честно посчитает isCircuitActive=false из-за этого,
 * но студенту нужно объяснение, а не просто "цепь не активна".
 */
export function checkVoltmeterPlacement(
  components: CircuitComponent[],
  connections: Connection[],
  _solution: CircuitSolution,
  voltmeterId = "voltmeter"
): VoltmeterPlacementCheck {
  const terminals = components.find((c) => c.id === voltmeterId)?.terminals;
  const connected = terminals
    ? isTerminalWired(connections, terminals[0]) || isTerminalWired(connections, terminals[1])
    : false;
  if (!connected) return { status: "not_connected" };

  const uf = buildNodeGroups(connections);
  const target = components.find((c) => c.id === voltmeterId)!;
  const nodeA = uf.find(target.terminals[0]);
  const nodeB = uf.find(target.terminals[1]);
  if (nodeA === nodeB) return { status: "valid" }; // напрямую замкнут проводом — корректно читает 0В

  const parallelWith = componentsOnSameNodePair(components, uf, voltmeterId);
  if (parallelWith.length === 0) {
    return { status: "series_invalid" };
  }
  return { status: "valid" };
}

/** Понятное ученику объяснение вместо технического кода ошибки — null, если подключение верное. */
export function ammeterPlacementMessage(check: AmmeterPlacementCheck): string | null {
  switch (check.status) {
    case "not_connected":
      return null; // отсутствие подключения — не ошибка размещения, просто нечего мерить
    case "parallel_invalid":
      return `Амперметр подключён параллельно — он шунтирует ${check.shuntedComponentId}. Переподключи амперметр последовательно (в разрыв провода).`;
    case "not_in_loop":
      return "Амперметр не входит в главный контур — проверь, что цепь замкнута.";
    case "valid":
      return null;
  }
}

export function voltmeterPlacementMessage(check: VoltmeterPlacementCheck): string | null {
  switch (check.status) {
    case "not_connected":
      return null;
    case "series_invalid":
      return "Вольтметр подключён последовательно — из-за большого сопротивления он размыкает цепь. Подключи его параллельно нагрузке (лампе или резистору), не разрывая основной провод.";
    case "valid":
      return null;
  }
}
