/**
 * Chemistry World — Container Physics (Stage 5.5 v2). Каталог физических
 * характеристик лабораторной посуды и детерминированная модель целостности
 * сосуда. Не добавляет новые типы сосудов — использует ровно те же
 * ContainerKind, что уже существуют в chemistry-engine.ts ("test_tube",
 * "beaker", "flask"), и не изменяет сам Chemistry Engine.
 *
 * Числа ниже — учебные приближения для лабораторного стекла (боросиликат),
 * подобранные так, чтобы сценарий "запечатать сосуд и довести до разрыва"
 * был демонстрируем за разумное время в симуляции. Это НЕ паспортные
 * характеристики конкретного производителя — упрощение указано явно,
 * как и требуется (см. тесты container-physics.test.ts).
 */
import type { ContainerKind } from "./chemistry-engine";

export type ContainerMaterial = "borosilicate_glass";

export interface ContainerPhysicalProfile {
  kind: ContainerKind;
  capacityMl: number;
  material: ContainerMaterial;
  maxSafeTemperatureC: number;
  maxSafePressureKPa: number; // избыточное давление (над атмосферным), которое сосуд держит без повреждений
  // максимально безопасная скорость изменения температуры, °C/сек —
  // выше нее начинает накапливаться термическое напряжение (thermal shock)
  thermalShockResistance: number;
  // относительный индекс устойчивости к избыточному давлению (чем больше — тем медленнее копится урон)
  pressureResistance: number;
  // относительный индекс теплопроводности (чем больше — тем меньше урон от резких перепадов темп-ры)
  heatConductivity: number;
  canBeSealed: boolean;
  defaultIntegrity: IntegrityLevel;
}

export const CONTAINER_PHYSICS: Record<ContainerKind, ContainerPhysicalProfile> = {
  test_tube: {
    kind: "test_tube",
    capacityMl: 50,
    material: "borosilicate_glass",
    maxSafeTemperatureC: 300,
    maxSafePressureKPa: 50,
    thermalShockResistance: 15,
    pressureResistance: 0.8,
    heatConductivity: 1.2,
    canBeSealed: true,
    defaultIntegrity: "normal",
  },
  beaker: {
    // capacityMl=400 согласован с уже существующей визуальной шкалой
    // заполнения в ContainerMesh (fillHeight = volumeMl/400 * 0.32) —
    // не дублирует ее, просто использует то же опорное число для физики
    kind: "beaker",
    capacityMl: 400,
    material: "borosilicate_glass",
    maxSafeTemperatureC: 250,
    maxSafePressureKPa: 80,
    thermalShockResistance: 8,
    pressureResistance: 1,
    heatConductivity: 1,
    canBeSealed: true,
    defaultIntegrity: "normal",
  },
  flask: {
    kind: "flask",
    capacityMl: 250,
    material: "borosilicate_glass",
    maxSafeTemperatureC: 280,
    maxSafePressureKPa: 120,
    thermalShockResistance: 10,
    pressureResistance: 1.3,
    heatConductivity: 1.1,
    canBeSealed: true,
    defaultIntegrity: "normal",
  },
};

export type IntegrityLevel = "normal" | "stressed" | "cracked" | "ruptured";

export interface IntegrityState {
  level: IntegrityLevel;
  // накопленное повреждение 0..1 — 1 означает разрыв; растет только когда
  // реальные показатели превышают безопасные пределы профиля сосуда
  stressScore: number;
}

export function createDefaultIntegrity(profile: ContainerPhysicalProfile): IntegrityState {
  return { level: profile.defaultIntegrity, stressScore: 0 };
}

const STRESSED_THRESHOLD = 0.34;
const CRACKED_THRESHOLD = 0.67;
const RUPTURED_THRESHOLD = 1.0;

function levelFromStressScore(stressScore: number): IntegrityLevel {
  if (stressScore >= RUPTURED_THRESHOLD) return "ruptured";
  if (stressScore >= CRACKED_THRESHOLD) return "cracked";
  if (stressScore >= STRESSED_THRESHOLD) return "stressed";
  return "normal";
}

export interface IntegrityUpdateInput {
  profile: ContainerPhysicalProfile;
  previous: IntegrityState;
  temperatureC: number;
  // ИЗБЫТОЧНОЕ давление над атмосферным (то есть gaugePressureKPa из
  // Pressure Engine, НЕ абсолютное pressureKPa) — сравнивается напрямую
  // с maxSafePressureKPa профиля, которое тоже задано как избыточное
  gaugePressureKPa: number;
  // модуль скорости изменения температуры, °C/сек, с прошлого шага Hazard Engine
  temperatureRateCPerSec: number;
  dtSeconds: number;
}

// сколько повреждения (0..1) копится за секунду при overRatio=1 (показатель
// вдвое превышает безопасный предел) — подобрано так, чтобы переход через
// stressed/cracked к ruptured занимал несколько секунд устойчивого
// превышения, а не один шаг тика (иначе целостность "перескакивает"
// уровни, что не соответствует "постепенно, через промежуточные признаки")
const PRESSURE_DAMAGE_RATE_AT_DOUBLE_LIMIT = 0.15;
const TEMPERATURE_DAMAGE_RATE_AT_DOUBLE_LIMIT = 0.08;
const SHOCK_DAMAGE_RATE_AT_DOUBLE_LIMIT = 0.12;

// повреждение накапливается постепенно и только пока реальный показатель
// превышает безопасный предел профиля сосуда — разорванный сосуд остается
// разорванным (необратимо в рамках текущего эксперимента, до RESET)
export function updateIntegrity(input: IntegrityUpdateInput): IntegrityState {
  const { profile, previous, temperatureC, gaugePressureKPa, temperatureRateCPerSec, dtSeconds } = input;

  if (previous.level === "ruptured") return previous;
  if (dtSeconds <= 0) return previous;

  // "избыток" ограничен сверху (клампится) — в маленьком сосуде (например,
  // пробирке) свободный объем крошечный, и давление при кипении может
  // мгновенно вырасти в десятки раз выше предела за один тик. Без клампа
  // это привело бы к разрыву за один шаг, минуя промежуточные признаки
  // (stressed/cracked), что противоречит требованию постепенного
  // разрушения — реальный тест (hazard-engine.test.ts) это ловит
  const MAX_OVER_RATIO = 3;
  const overTemperatureRatio = Math.min(MAX_OVER_RATIO, Math.max(0, temperatureC / profile.maxSafeTemperatureC - 1));
  const overPressureRatio = Math.min(MAX_OVER_RATIO, Math.max(0, gaugePressureKPa / profile.maxSafePressureKPa - 1));
  const overShockRatio = Math.min(MAX_OVER_RATIO, Math.max(0, Math.abs(temperatureRateCPerSec) / profile.thermalShockResistance - 1));

  const pressureDamageRate = (overPressureRatio / profile.pressureResistance) * PRESSURE_DAMAGE_RATE_AT_DOUBLE_LIMIT;
  const temperatureDamageRate = (overTemperatureRatio / profile.heatConductivity) * TEMPERATURE_DAMAGE_RATE_AT_DOUBLE_LIMIT;
  const shockDamageRate = (overShockRatio / profile.heatConductivity) * SHOCK_DAMAGE_RATE_AT_DOUBLE_LIMIT;

  const stressDelta = (pressureDamageRate + temperatureDamageRate + shockDamageRate) * dtSeconds;
  const stressScore = Math.min(1, previous.stressScore + stressDelta);

  return { level: levelFromStressScore(stressScore), stressScore };
}
