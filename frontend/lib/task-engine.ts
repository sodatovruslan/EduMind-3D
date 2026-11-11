import type { CircuitComponent, CircuitSolution, Connection } from "@/lib/circuit-engine";
import { buildNodeGroups, componentsOnSameNodePair, isTerminalWired } from "@/lib/measurement-validation";

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

// Топологические примитивы (union-find по узлам/парам клемм) перенесены в
// measurement-validation.ts — единый источник правды, которым теперь
// пользуются и задания здесь, и показания приборов прямо на сцене
// (Stage S9.3). Circuit Engine (circuit-engine.ts) по-прежнему не тронут.

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

// ---- Яркость лампы: довести мощность на лампе до рабочей зоны
//
// Рабочая зона — 75–100% номинальной мощности лампы: ярко, но без перегрева.
// Мощность берётся из уже посчитанного Circuit Engine (readings.bulb.powerW),
// ученик меняет только напряжение источника и сопротивление резистора.

export const BRIGHTNESS_TARGET_MIN = 0.75;
export const BRIGHTNESS_TARGET_MAX = 1;
// запас на погрешность вычислений с плавающей точкой: ровно 100% — это успех
const BRIGHTNESS_EPSILON = 0.005;

/** Мощность на лампе в долях от номинальной (1 = 100%); 0, если ток не течёт. */
export function bulbPowerRatio(state: CircuitState): number {
  const bulb = state.components.find((c) => c.kind === "bulb");
  const reading = bulb ? state.solution.readings[bulb.id] : undefined;
  if (!bulb?.ratedPowerW || !reading || !state.solution.isCircuitActive) return 0;
  return reading.powerW / bulb.ratedPowerW;
}

function validateBrightness(state: CircuitState): TaskValidationResult {
  const errors = diagnoseCommonIssues(state);
  const warnings: string[] = [];
  const ratio = bulbPowerRatio(state);
  const percent = Math.round(ratio * 100);

  const bulbInLoop = state.solution.readings.bulb !== undefined;
  if (state.solution.isClosedLoop && !bulbInLoop) {
    errors.push({ code: "bulb_not_in_loop", message: "лампа не входит в главный контур" });
  }

  const inZone = ratio >= BRIGHTNESS_TARGET_MIN - BRIGHTNESS_EPSILON && ratio <= BRIGHTNESS_TARGET_MAX + BRIGHTNESS_EPSILON;

  if (errors.length === 0 && state.solution.isCircuitActive && !inZone) {
    if (ratio < BRIGHTNESS_TARGET_MIN) {
      errors.push({
        code: "bulb_too_dim",
        message: `лампа горит слабо (${percent}%) — увеличь напряжение или уменьши сопротивление`,
      });
    } else {
      errors.push({
        code: "bulb_overpowered",
        message: `лампа перегревается (${percent}%) — уменьши напряжение или увеличь сопротивление`,
      });
    }
    const distance = ratio < BRIGHTNESS_TARGET_MIN ? BRIGHTNESS_TARGET_MIN - ratio : ratio - BRIGHTNESS_TARGET_MAX;
    if (distance <= 0.15) warnings.push("уже близко — сдвинь ползунок ещё чуть-чуть");
  }

  return {
    completed: errors.length === 0 && state.solution.isCircuitActive && inZone,
    errors,
    warnings,
    measurements: { brightnessRatio: ratio, currentA: state.solution.isCircuitActive ? state.solution.currentA : 0 },
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

const closeLoopTask: TaskDefinition = {
  id: "task-1-close-loop",
  title: "Зажги лампу",
  description: "Соедини проводами батарею, переключатель и лампу в одно кольцо. Ток пойдёт по кругу — и лампа загорится.",
  goal: "Лампа горит: ток течёт по замкнутой цепи.",
  successConditions: [
    "Батарея, переключатель и лампа соединены в один контур",
    "Переключатель замкнут",
    "Нет короткого замыкания",
  ],
  failureConditions: ["Цепь разомкнута", "Переключатель разомкнут", "Короткое замыкание", "Лампа не входит в контур"],
  difficulty: "easy",
  xpReward: 10,
  validate: validateTask1,
};

const brightnessTask: TaskDefinition = {
  id: "task-2-lamp-brightness",
  title: "Управляй яркостью",
  description:
    "Лампа любит свою мощность: мало тока — горит тускло, слишком много — перегревается. Двигай ползунки напряжения и сопротивления и следи за лампой.",
  goal: "Яркость лампы в зелёной зоне: 75–100% от номинальной.",
  successConditions: ["Лампа входит в контур и ток течёт", "Мощность на лампе 75–100% от номинальной"],
  failureConditions: ["Лампа горит слабо", "Лампа перегревается", "Цепь разомкнута"],
  difficulty: "medium",
  xpReward: 15,
  validate: validateBrightness,
};

const findBreakTask: TaskDefinition = {
  id: "task-5-find-break",
  title: "Найди поломку",
  description:
    "Лампа погасла: из цепи пропал один провод. Пройди по цепи от «+» батареи до «−», найди разрыв и протяни недостающий провод.",
  goal: "Лампа снова горит: цепь замкнута, ток течёт.",
  successConditions: ["Цепь замкнута и активна"],
  failureConditions: ["Цепь разомкнута", "Переключатель разомкнут", "Предохранитель перегорел"],
  difficulty: "hard",
  xpReward: 20,
  validate: validateTask5,
};

/**
 * Задания, которые видит ученик: три, от простого к сложному. Остальные
 * (ARCHIVED_TASKS) пока скрыты — их проверки и тесты остаются рабочими,
 * чтобы вернуть задание, достаточно перенести его в TASKS.
 */
export const TASKS: TaskDefinition[] = [closeLoopTask, brightnessTask, findBreakTask];

export const ARCHIVED_TASKS: TaskDefinition[] = [
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
    id: "task-6-fix-short",
    title: "Исправь короткое замыкание",
    description: "Лаборатория добавила лишний провод, который пускает ток в обход лампы и резистора — это короткое замыкание. Найди этот провод и удали его (клик по проводу).",
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
