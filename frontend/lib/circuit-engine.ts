/**
 * Physical World Core — физика электрической цепи. Чистые функции, без
 * Three.js/React: считает реальный ток по закону Ома, короткое замыкание,
 * перегорание предохранителя и показания приборов. Рендер (ElectricityLabScene)
 * только отображает то, что здесь посчитано — никаких случайных чисел и
 * "зашитых" в анимацию результатов.
 *
 * Stage S9.2: `solveCircuit` теперь делегирует в nodal-analysis-solver.ts
 * (Option B, выбран по результатам спайка — см. solver-spike-report.md и
 * electricity_stage_s9_plan.md). Публичный контракт (сигнатура, типы,
 * поведение на всех прежних series-сценариях) не изменился — это чистая
 * замена внутренней реализации, а не новый API. Ограничение "только один
 * последовательный контур" снято: теперь поддерживаются произвольные
 * series/parallel/mixed/bridge-топологии с той же батареей.
 */
import { solveCircuitNodal } from "./nodal-analysis-solver";

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

/**
 * Публичный контракт не изменился: тот же вход, тот же CircuitSolution.
 * Внутри — Nodal Analysis (Option B, см. nodal-analysis-solver.ts), которая
 * решает произвольную топологию (series/parallel/mixed/bridge) вместо
 * прежнего однопутевого DFS. Полная обратная совместимость на всех
 * существующих сценариях (series, разрыв, короткое замыкание, предохранитель,
 * вольтметр) подтверждена как отдельными parity-тестами солвера
 * (nodal-analysis-solver.test.ts), так и прогоном ЭТОГО файла (см.
 * circuit-engine.test.ts — не менялся ни на строчку ради этой интеграции).
 */
export function solveCircuit(components: CircuitComponent[], connections: Connection[]): CircuitSolution {
  return solveCircuitNodal(components, connections);
}

// яркость лампы 0..1, нормированная по номинальной мощности — реальная
// физика (P=I^2R), а не декоративная анимация
export function bulbBrightness(reading: ComponentReading | undefined, ratedPowerW: number): number {
  if (!reading || ratedPowerW <= 0) return 0;
  return Math.max(0, Math.min(1, reading.powerW / ratedPowerW));
}
