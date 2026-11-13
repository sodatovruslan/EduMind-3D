/**
 * Electricity Lab — Safety System (Stage S9.4). Тот же принцип, что и
 * Chemistry World's chemistry-safety.ts: чистая функция от уже посчитанного
 * состояния (production Nodal Analysis solver, circuit-engine.ts), ничего
 * не решает AI и ничего не пересчитывает физику заново.
 *
 * `SafetyWarning` — тот же самый тип, что и в Chemistry World (импортирован,
 * не продублирован), чтобы обе лаборатории использовали один визуальный
 * язык (severity "warning"/"danger") и один компонент-баннер мог бы (в
 * будущем) отрисовывать предупреждения любого модуля без адаптера.
 *
 * Размещение приборов (unsafe_measurement) переиспользует
 * measurement-validation.ts напрямую — здесь нет собственной копии
 * топологических проверок.
 */
import type { CircuitComponent, CircuitSolution, Connection } from "./circuit-engine";
import type { SafetyWarning } from "./chemistry-safety";
import {
  ammeterPlacementMessage,
  checkAmmeterPlacement,
  checkVoltmeterPlacement,
  isTerminalWired,
  voltmeterPlacementMessage,
} from "./measurement-validation";

export type { SafetyWarning };

// доля от номинального тока предохранителя, начиная с которой предупреждаем
// ДО фактического перегорания — "warning before permanent failure"
const FUSE_OVERLOAD_WARNING_RATIO = 0.8;
// current считается "пренебрежимо малым" относительно общего тока цепи —
// используется, чтобы отличить "предохранитель реально не в цепи" от
// "предохранитель в цепи, но через него течёт < 5% общего тока"
const NEGLIGIBLE_CURRENT_FRACTION = 0.05;
const MIN_MEANINGFUL_CURRENT_A = 1e-6;

export interface ElectricalSafetyInput {
  components: CircuitComponent[];
  connections: Connection[];
  solution: CircuitSolution;
}

/**
 * 1. Short Circuit Detection — прямое замыкание батареи И опасно низкое
 * сопротивление контура уже унифицированы production-солвером в одном
 * флаге isShortCircuit (см. nodal-analysis-solver.ts) — здесь не
 * пересчитывается, только читается и объясняется.
 */
function checkShortCircuit(solution: CircuitSolution): SafetyWarning[] {
  if (!solution.isShortCircuit) return [];
  return [
    {
      code: "short_circuit",
      message: `Короткое замыкание! Сопротивление контура почти нулевое — расчётный ток ${solution.currentA.toFixed(
        1
      )} А. В реальной цепи это вызывает перегрев проводов и может привести к пожару.`,
      severity: "danger",
    },
  ];
}

/**
 * 2 + 3. Fuse Behaviour + Overload Detection — перегоревший предохранитель
 * (fuse_blown) и предупреждение ДО перегорания (overload), когда ток уже
 * приближается к номиналу, но предохранитель ещё цел. Оба варианта читают
 * уже посчитанные solution.readings/component.isBlown, не переизобретают
 * порог срабатывания (тот же ratedCurrentA, что и в самом солвере).
 */
function checkFuseAndOverload(components: CircuitComponent[], solution: CircuitSolution): SafetyWarning[] {
  const warnings: SafetyWarning[] = [];

  for (const component of components) {
    if (component.kind !== "fuse") continue;

    if (component.isBlown) {
      warnings.push({
        code: "fuse_blown",
        message: `Предохранитель перегорел — цепь разорвана. Это защита от перегрузки: ток превысил допустимые ${
          component.ratedCurrentA ?? "?"
        } А. Нажми «Сбросить», чтобы заменить предохранитель.`,
        severity: "danger",
      });
      continue;
    }

    if (component.ratedCurrentA === undefined) continue;
    const reading = solution.readings[component.id];
    if (!reading) continue;
    const currentA = Math.abs(reading.currentA);
    if (currentA >= component.ratedCurrentA * FUSE_OVERLOAD_WARNING_RATIO && currentA < component.ratedCurrentA) {
      warnings.push({
        code: "overload",
        message: `Ток ${currentA.toFixed(1)} А приближается к пределу предохранителя (${component.ratedCurrentA} А). Ещё немного — и он перегорит. Снизь напряжение или увеличь сопротивление.`,
        severity: "warning",
      });
    }
  }

  // мощность на лампе выше номинальной — сама лампа в этой симуляции не
  // "перегорает" физически (в отличие от предохранителя), но в реальной
  // жизни это сокращает срок службы/сжигает нить — чисто образовательное
  // предупреждение, ничего не меняет в физике
  const bulb = components.find((c) => c.kind === "bulb");
  const bulbReading = bulb ? solution.readings[bulb.id] : undefined;
  // 0.5% запаса: ровно номинальная мощность — это рабочий режим, а не перегрузка
  if (bulb?.ratedPowerW !== undefined && bulbReading && bulbReading.powerW > bulb.ratedPowerW * 1.005) {
    warnings.push({
      code: "overload",
      message: `Мощность на лампе (${bulbReading.powerW.toFixed(1)} Вт) превышает номинал (${bulb.ratedPowerW} Вт). В реальности лампа перегорела бы — снизь напряжение источника.`,
      severity: "warning",
    });
  }

  return warnings;
}

/**
 * 4a. unsafe_measurement — переиспользует measurement-validation.ts
 * целиком (никакой собственной топологии): амперметр в обход другого
 * компонента реально шунтирует его и вызывает опасный скачок тока через
 * сам прибор (danger); вольтметр, воткнутый в разрыв провода, не опасен
 * физически, но ломает измерение (warning).
 */
function checkUnsafeMeasurement(components: CircuitComponent[], connections: Connection[], solution: CircuitSolution): SafetyWarning[] {
  const warnings: SafetyWarning[] = [];

  const ammeterCheck = checkAmmeterPlacement(components, connections, solution);
  if (ammeterCheck.status === "parallel_invalid") {
    warnings.push({
      code: "unsafe_measurement",
      message: ammeterPlacementMessage(ammeterCheck) ?? "Амперметр подключён неправильно.",
      severity: "danger",
    });
  }

  const voltmeterCheck = checkVoltmeterPlacement(components, connections, solution);
  if (voltmeterCheck.status === "series_invalid") {
    warnings.push({
      code: "unsafe_measurement",
      message: voltmeterPlacementMessage(voltmeterCheck) ?? "Вольтметр подключён неправильно.",
      severity: "warning",
    });
  }

  return warnings;
}

/**
 * 4b. unsafe_connection — ток течёт по цепи в обход предохранителя (тот
 * есть среди компонентов и подключён проводами где-то, но несёт
 * пренебрежимо малую долю общего тока) — то есть цепь работает БЕЗ
 * защиты от перегрузки. Единственный новый топологический признак в этом
 * файле — переиспользует isTerminalWired из measurement-validation.ts,
 * не заводит собственный union-find.
 */
function checkUnsafeConnection(components: CircuitComponent[], connections: Connection[], solution: CircuitSolution): SafetyWarning[] {
  if (!solution.isCircuitActive || solution.currentA < MIN_MEANINGFUL_CURRENT_A) return [];

  const fuse = components.find((c) => c.kind === "fuse");
  if (!fuse) return [];

  const wired = isTerminalWired(connections, fuse.terminals[0]) || isTerminalWired(connections, fuse.terminals[1]);
  const fuseCurrentA = Math.abs(solution.readings[fuse.id]?.currentA ?? 0);
  const bypassesTheFuse = !wired || fuseCurrentA < solution.currentA * NEGLIGIBLE_CURRENT_FRACTION;

  if (!bypassesTheFuse) return [];
  return [
    {
      code: "unsafe_connection",
      message: `Ток течёт в обход предохранителя — цепь работает без защиты от перегрузки. В реальности при коротком замыкании или перегрузке это может привести к пожару.`,
      severity: "danger",
    },
  ];
}

/**
 * Единая точка входа — объединяет все проверки. Порядок в возвращаемом
 * массиве значим для UI (короткое замыкание/перегоревший предохранитель —
 * самые критичные — идут первыми).
 */
export function checkElectricalSafety(input: ElectricalSafetyInput): SafetyWarning[] {
  const { components, connections, solution } = input;
  return [
    ...checkShortCircuit(solution),
    ...checkFuseAndOverload(components, solution),
    ...checkUnsafeConnection(components, connections, solution),
    ...checkUnsafeMeasurement(components, connections, solution),
  ];
}
