import type { CircuitComponent, CircuitSolution, Connection } from "@/lib/circuit-engine";

/**
 * Interactive Learning System — Task Validator. Чистые функции, без React/Three,
 * по тому же принципу, что и circuit-engine.ts: ничего не "зашито" заранее —
 * каждая проверка читает уже посчитанное состояние Physics Engine
 * (CircuitSolution из solveCircuit) и реальную топологию проводов
 * (Connection[]). Показания приборов, факт короткого замыкания, факт
 * перегорания предохранителя — все берется из уже существующего движка,
 * этот модуль его не пересчитывает и не подменяет.
 */

export enum TaskStatus {
  NOT_STARTED = "not_started",
  IN_PROGRESS = "in_progress",
  COMPLETED = "completed",
  FAILED = "failed",
}

export type TaskDifficulty = "easy" | "medium" | "hard";

export interface TaskError {
  code: string;
  message: string;
  // критическая ошибка -> задание переходит в FAILED, а не просто "в процессе"
  // (требует Сбросить, чтобы попробовать снова). Не критическая -> просто
  // подсказка в списке ошибок, ученик продолжает работать над задачей.
  critical?: boolean;
}

export interface TaskValidationResult {
  completed: boolean;
  errors: TaskError[];
  warnings: string[];
  measurements: Record<string, number | boolean>;
}

export interface CircuitState {
  components: CircuitComponent[];
  connections: Connection[];
  solution: CircuitSolution;
}

export interface TaskDefinition {
  id: string;
  title: string;
  description: string;
  goal: string;
  successConditions: string[];
  failureConditions: string[];
  difficulty: TaskDifficulty;
  xpReward: number;
  validate: (state: CircuitState) => TaskValidationResult;
}

// ---- топология: своя минимальная union-find, а не импорт из circuit-engine.ts
// (Circuit Engine трогать нельзя) — строит те же узлы-группы по тем же
// Connection[], что использует и solveCircuit, только здесь нужен доступ
// к группировке узлов "снаружи", а не только к итоговому решению одного контура.

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

function buildNodeGroups(connections: Connection[]): NodeUnionFind {
  const uf = new NodeUnionFind();
  for (const connection of connections) uf.union(connection.terminals[0], connection.terminals[1]);
  return uf;
}

function nodePairKey(component: CircuitComponent, uf: NodeUnionFind): string {
  return component.terminals
    .map((t) => uf.find(t))
    .sort()
    .join("::");
}

// компоненты, чьи выводы соединены ровно с той же парой узлов, что и целевой
// компонент — то есть реально включены параллельно ему в текущей проводке
function componentsOnSameNodePair(
  components: CircuitComponent[],
  uf: NodeUnionFind,
  targetId: string
): CircuitComponent[] {
  const target = components.find((c) => c.id === targetId);
  if (!target) return [];
  const key = nodePairKey(target, uf);
  return components.filter((c) => c.id !== targetId && nodePairKey(c, uf) === key);
}

function isTerminalWired(connections: Connection[], terminalId: string): boolean {
  return connections.some((c) => c.terminals[0] === terminalId || c.terminals[1] === terminalId);
}

// общие для нескольких заданий диагнозы — читают то же CircuitSolution,
// что и остальной интерфейс (панель статуса цепи использует те же поля)
function diagnoseCommonIssues(state: CircuitState): TaskError[] {
  const errors: TaskError[] = [];
  const battery = state.components.find((c) => c.kind === "battery");
  if (!battery) errors.push({ code: "no_battery", message: "отсутствует источник питания", critical: true });

  if (!state.solution.isClosedLoop) {
    errors.push({ code: "open_circuit", message: "цепь разомкнута" });
    return errors;
  }
  if (state.solution.isShortCircuit) {
    errors.push({ code: "short_circuit", message: "короткое замыкание", critical: true });
  }
  const fuse = state.components.find((c) => c.kind === "fuse");
  if (fuse?.isBlown) errors.push({ code: "fuse_blown", message: "предохранитель перегорел", critical: true });

  const openSwitch = state.components.find((c) => c.kind === "switch" && c.isClosed === false);
  if (openSwitch) errors.push({ code: "switch_open", message: "переключатель разомкнут" });

  return errors;
}

// ---- Task 1: замкнуть простую цепь батарея + переключатель + лампа

function validateTask1(state: CircuitState): TaskValidationResult {
  const errors = diagnoseCommonIssues(state);
  const warnings: string[] = [];

  if (!errors.some((e) => e.code === "open_circuit")) {
    if (state.solution.readings.switch === undefined) {
      errors.push({ code: "switch_not_in_loop", message: "переключатель не входит в главный контур" });
    }
    if (state.solution.readings.bulb === undefined) {
      errors.push({ code: "bulb_not_in_loop", message: "лампа не входит в главный контур" });
    }
  }

  const completed =
    errors.length === 0 &&
    state.solution.isCircuitActive &&
    state.solution.readings.switch !== undefined &&
    state.solution.readings.bulb !== undefined;

  const bulb = state.components.find((c) => c.id === "bulb");
  const bulbReading = state.solution.readings.bulb;
  if (completed && bulb?.ratedPowerW && bulbReading) {
    if (bulbReading.powerW < bulb.ratedPowerW * 0.15) {
      warnings.push("лампа горит очень тускло — попробуй увеличить напряжение источника");
    }
  }

  return {
    completed,
    errors,
    warnings,
    measurements: { currentA: bulbReading?.currentA ?? 0 },
  };
}

// ---- Task 2: амперметр должен стоять последовательно, а не в обход

function validateTask2(state: CircuitState): TaskValidationResult {
  const errors = diagnoseCommonIssues(state);
  const ammeterConnected = isTerminalWired(state.connections, "ammeter_a") || isTerminalWired(state.connections, "ammeter_b");
  const uf = buildNodeGroups(state.connections);
  const parallelWith = ammeterConnected ? componentsOnSameNodePair(state.components, uf, "ammeter") : [];

  if (!ammeterConnected) {
    errors.push({ code: "ammeter_missing", message: "амперметр не подключён" });
  } else if (parallelWith.length > 0) {
    errors.push({
      code: "ammeter_parallel",
      message: `амперметр подключён параллельно (шунтирует ${parallelWith[0].id}) — переподключи последовательно`,
    });
  } else if (state.solution.readings.ammeter === undefined && !errors.some((e) => e.code === "open_circuit")) {
    errors.push({ code: "ammeter_not_in_loop", message: "амперметр не входит в главный контур" });
  }

  const completed =
    errors.length === 0 &&
    ammeterConnected &&
    parallelWith.length === 0 &&
    state.solution.isCircuitActive &&
    state.solution.readings.ammeter !== undefined;

  return {
    completed,
    errors,
    warnings: [],
    measurements: { currentA: state.solution.readings.ammeter?.currentA ?? 0 },
  };
}

// ---- Task 3: вольтметр должен стоять параллельно нагрузке (лампе/резистору)

function validateTask3(state: CircuitState): TaskValidationResult {
  const errors: TaskError[] = [];
  const battery = state.components.find((c) => c.kind === "battery");
  if (!battery) errors.push({ code: "no_battery", message: "отсутствует источник питания", critical: true });
  if (!state.solution.isClosedLoop) errors.push({ code: "open_circuit", message: "цепь разомкнута" });

  const voltmeterConnected =
    isTerminalWired(state.connections, "voltmeter_a") || isTerminalWired(state.connections, "voltmeter_b");
  const uf = buildNodeGroups(state.connections);
  const parallelWith = voltmeterConnected ? componentsOnSameNodePair(state.components, uf, "voltmeter") : [];
  const matchedLoad = parallelWith.find((c) => c.kind === "bulb" || c.kind === "resistor");

  if (!voltmeterConnected) {
    errors.push({ code: "voltmeter_missing", message: "вольтметр не подключён" });
  } else if (!matchedLoad) {
    errors.push({
      code: "voltmeter_not_parallel",
      message: "вольтметр должен быть подключён параллельно нагрузке (лампе или резистору)",
    });
  }

  const completed = errors.length === 0 && voltmeterConnected && Boolean(matchedLoad);

  return {
    completed,
    errors,
    warnings: [],
    measurements: { voltageV: state.solution.readings.voltmeter?.voltageV ?? 0 },
  };
}

// ---- Task 4: подобрать ток 0.5 А выбором напряжения батареи и сопротивления

const TASK4_TARGET_CURRENT_A = 0.5;
const TASK4_TOLERANCE_A = 0.05;

function validateTask4(state: CircuitState): TaskValidationResult {
  const errors = diagnoseCommonIssues(state);
  const warnings: string[] = [];

  const currentA = state.solution.isCircuitActive ? state.solution.currentA : 0;
  const diff = Math.abs(currentA - TASK4_TARGET_CURRENT_A);
  const inRange = state.solution.isCircuitActive && diff <= TASK4_TOLERANCE_A;

  if (state.solution.isClosedLoop && !state.solution.isCircuitActive && errors.length === 0) {
    errors.push({ code: "no_current", message: "ток не течет — собери замкнутую цепь" });
  } else if (state.solution.isCircuitActive && !inRange) {
    errors.push({
      code: "current_out_of_range",
      message: `ток ${currentA.toFixed(2)} А вне диапазона ${(TASK4_TARGET_CURRENT_A - TASK4_TOLERANCE_A).toFixed(2)}–${(
        TASK4_TARGET_CURRENT_A + TASK4_TOLERANCE_A
      ).toFixed(2)} А`,
    });
    if (diff <= TASK4_TOLERANCE_A * 2) warnings.push("уже близко — подстрой напряжение или сопротивление чуть точнее");
  }

  const completed = errors.length === 0 && inRange;

  return {
    completed,
    errors,
    warnings,
    measurements: { currentA },
  };
}

// ---- Task 5: найти и устранить обрыв цепи

function validateTask5(state: CircuitState): TaskValidationResult {
  const errors: TaskError[] = [];

  if (!state.solution.isClosedLoop) {
    errors.push({ code: "open_circuit", message: "цепь разомкнута — нет пути от батареи, проверь провода" });
  } else if (!state.solution.isCircuitActive) {
    const openSwitch = state.components.find((c) => c.kind === "switch" && c.isClosed === false);
    const blownFuse = state.components.find((c) => c.kind === "fuse" && c.isBlown);
    if (openSwitch) errors.push({ code: "switch_open", message: "переключатель разомкнут — включи его" });
    if (blownFuse) errors.push({ code: "fuse_blown", message: "предохранитель перегорел — нажми Сбросить", critical: true });
    if (!openSwitch && !blownFuse) errors.push({ code: "break_unknown", message: "обрыв в контуре — проверь все соединения" });
  }

  const completed = state.solution.isClosedLoop && state.solution.isCircuitActive;

  return {
    completed,
    errors,
    warnings: [],
    measurements: { currentA: state.solution.currentA },
  };
}

// ---- Task 6: устранить короткое замыкание

function validateTask6(state: CircuitState): TaskValidationResult {
  const errors: TaskError[] = [];

  if (!state.solution.isClosedLoop) {
    errors.push({ code: "open_circuit", message: "цепь разомкнута" });
  } else if (state.solution.isShortCircuit) {
    // не critical: это и есть стартовое состояние задания, а не "провал" —
    // ученик еще работает над устранением короткого замыкания
    errors.push({
      code: "short_circuit",
      message: `короткое замыкание — сопротивление контура почти нулевое (ток ${state.solution.currentA.toFixed(1)} А)`,
    });
  } else if (!state.solution.isCircuitActive) {
    const blownFuse = state.components.find((c) => c.kind === "fuse" && c.isBlown);
    if (blownFuse) {
      errors.push({ code: "fuse_blown", message: "предохранитель перегорел — нажми Сбросить и почини проводку", critical: true });
    } else {
      errors.push({ code: "break", message: "цепь не активна — проверь переключатель и соединения" });
    }
  }

  const completed = state.solution.isClosedLoop && state.solution.isCircuitActive && !state.solution.isShortCircuit;

  return {
    completed,
    errors,
    warnings: [],
    measurements: { currentA: state.solution.currentA },
  };
}

export const TASKS: TaskDefinition[] = [
  {
    id: "task-1-close-loop",
    title: "Собери замкнутую цепь",
    description: "Соедини батарею, переключатель и лампу так, чтобы образовался единый замкнутый контур.",
    goal: "Ток должен течь через лампу, переключатель замкнут, короткого замыкания нет.",
    successConditions: [
      "Батарея, переключатель и лампа соединены в один контур",
      "Переключатель замкнут",
      "Нет короткого замыкания",
    ],
    failureConditions: ["Цепь разомкнута", "Переключатель разомкнут", "Короткое замыкание", "Лампа не входит в контур"],
    difficulty: "easy",
    xpReward: 10,
    validate: validateTask1,
  },
  {
    id: "task-2-ammeter-series",
    title: "Подключи амперметр правильно",
    description: "Амперметр должен стоять последовательно в разрыве цепи, а не в обход другого компонента.",
    goal: "Ток через амперметр совпадает с общим током цепи.",
    successConditions: ["Амперметр включён последовательно в главный контур", "Ток течёт"],
    failureConditions: ["Амперметр подключён параллельно", "Амперметр не подключён", "Цепь разомкнута"],
    difficulty: "medium",
    xpReward: 15,
    validate: validateTask2,
  },
  {
    id: "task-3-voltmeter-parallel",
    title: "Подключи вольтметр параллельно нагрузке",
    description: "Вольтметр измеряет напряжение на нагрузке — подключи его параллельно лампе или резистору.",
    goal: "Вольтметр стоит на тех же двух узлах, что и нагрузка.",
    successConditions: ["Вольтметр подключён параллельно лампе или резистору"],
    failureConditions: ["Вольтметр не подключён", "Вольтметр подключён не параллельно нагрузке"],
    difficulty: "medium",
    xpReward: 15,
    validate: validateTask3,
  },
  {
    id: "task-4-target-current",
    title: "Настрой ток 0.5 А",
    description: "Выбери напряжение батареи и сопротивление резистора так, чтобы ток в цепи был 0.5 А.",
    goal: "Расчётный ток находится в диапазоне 0.45–0.55 А.",
    successConditions: ["Ток в диапазоне 0.45–0.55 А"],
    failureConditions: ["Ток вне диапазона", "Цепь не собрана"],
    difficulty: "hard",
    xpReward: 20,
    validate: validateTask4,
  },
  {
    id: "task-5-find-break",
    title: "Найди обрыв цепи",
    description: "В цепи есть обрыв — переключатель разомкнут или потерян провод. Найди и исправь его.",
    goal: "Цепь снова замкнута и активна, ток течёт.",
    successConditions: ["Цепь замкнута и активна"],
    failureConditions: ["Цепь разомкнута", "Переключатель разомкнут", "Предохранитель перегорел"],
    difficulty: "medium",
    xpReward: 15,
    validate: validateTask5,
  },
  {
    id: "task-6-fix-short",
    title: "Исправь короткое замыкание",
    description: "Где-то в цепи почти нулевое сопротивление. Перепроводи цепь так, чтобы ток шёл через нагрузку.",
    goal: "Ток течёт через нормальное сопротивление, короткого замыкания нет.",
    successConditions: ["Нет короткого замыкания", "Ток течёт через цепь"],
    failureConditions: ["Короткое замыкание", "Предохранитель перегорел"],
    difficulty: "hard",
    xpReward: 20,
    validate: validateTask6,
  },
];

export function validateTask(task: TaskDefinition, state: CircuitState): TaskValidationResult {
  return task.validate(state);
}

export function deriveTaskStatus(result: TaskValidationResult, hasStarted: boolean): TaskStatus {
  if (result.completed) return TaskStatus.COMPLETED;
  if (result.errors.some((e) => e.critical)) return TaskStatus.FAILED;
  return hasStarted ? TaskStatus.IN_PROGRESS : TaskStatus.NOT_STARTED;
}
