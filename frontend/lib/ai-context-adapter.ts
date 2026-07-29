import type { CircuitSolution } from "@/lib/circuit-engine";

/**
 * Physical World Core — AI Context Adapter. Превращает уже посчитанное
 * состояние симуляции в текстовое описание для существующего
 * AIAssistantChat (frontend/components/ai/AIAssistantChat.tsx, без изменений).
 * ИИ только объясняет это состояние — сам физический расчет уже сделан
 * circuit-engine.ts, здесь только его пересказ словами.
 */
export function buildElectricityLabContext(solution: CircuitSolution, voltageV: number): string {
  if (!solution.isClosedLoop) {
    return "Ученик собирает электрическую цепь. Пока цепь не замкнута — провода не образуют полный контур через источник питания.";
  }
  if (solution.isShortCircuit) {
    return `Ученик собрал цепь с коротким замыканием: сопротивление контура почти нулевое, расчетный ток ${solution.currentA.toFixed(
      1
    )} А. Это опасная ситуация, обычно приводящая к перегоранию предохранителя.`;
  }
  if (!solution.isCircuitActive) {
    return "Цепь замкнута, но ток не течет: либо разомкнут выключатель, либо перегорел предохранитель.";
  }
  return `Ученик собрал рабочую цепь: источник ${voltageV} В, расчетный ток по закону Ома — ${solution.currentA.toFixed(
    2
  )} А.`;
}
