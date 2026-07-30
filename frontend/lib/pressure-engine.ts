/**
 * Chemistry World — Pressure Engine (Stage 5.5 v2). Чистый детерминированный
 * расчет давления внутри сосуда по идеальному газовому закону (PV = nRT).
 * Не пересчитывает температуру (`container.temperatureC` берется как есть
 * из Chemistry Engine) и не трогает сам Chemistry Engine — только читает
 * его публичные функции/данные (`totalMassG`, `totalVolumeMl`,
 * `aggregateStateOf`, `SUBSTANCES`).
 *
 * Явное упрощение: Chemistry Engine не экспортирует "точку кипения текущей
 * смеси" отдельно — единственное летучее вещество в текущем наборе Stage 5,
 * которое реально кипит в экспериментах проекта, это вода (100°C). Доля
 * испарившейся массы (`vaporFraction`) моделируется относительно этого
 * ориентира и относительно уже посчитанного `aggregateStateOf`, а не
 * заново решает "кипит или нет" — это по-прежнему решает Chemistry Engine.
 * Молярная масса пара берется как molarMassGPerMol воды (SUBSTANCES.water) —
 * тоже явное упрощение (пар моделируется как водяной), а не выдуманное
 * число.
 */
import { SUBSTANCES, aggregateStateOf, totalMassG, totalVolumeMl, type Container } from "./chemistry-engine";
import type { ContainerPhysicalProfile } from "./container-physics";

export const AMBIENT_PRESSURE_KPA = 101.325;
const GAS_CONSTANT_R = 8.314; // Дж/(моль·К)
const KELVIN_OFFSET = 273.15;

const REFERENCE_BOILING_POINT_C = 100;
const PRE_BOIL_RAMP_C = 20; // за сколько градусов ДО точки кипения появляется первый легкий пар
const FULL_VAPORIZATION_RAMP_C = 20; // за сколько градусов ПОСЛЕ кипения испарение выходит на максимум

// открытый сосуд: газ выходит наружу — избыточное давление затухает
// экспоненциально к нулю, а не копится без физической причины
const OPEN_VENT_RATE_PER_SEC = 3;

// доля от общей массы сосуда, которая физически может считаться "паром" —
// упрощение: не моделируем отдельно теплоемкость/массу растворителя,
// поэтому ограничиваем видимую долю испарения разумным потолком
const MAX_VAPOR_MASS_FRACTION = 0.4;

// доля 0..1: насколько сильно сейчас "кипит" содержимое сосуда — плавно
// нарастает к точке кипения и после нее, без скачка
export function computeVaporFraction(container: Container): number {
  const temperatureC = container.temperatureC;
  if (aggregateStateOf(container) === "gas") {
    const excessC = Math.max(0, temperatureC - REFERENCE_BOILING_POINT_C);
    return Math.min(1, 0.2 + (excessC / FULL_VAPORIZATION_RAMP_C) * 0.8);
  }
  const preBoilStart = REFERENCE_BOILING_POINT_C - PRE_BOIL_RAMP_C;
  if (temperatureC <= preBoilStart) return 0;
  const ratio = (temperatureC - preBoilStart) / PRE_BOIL_RAMP_C;
  return Math.min(0.2, ratio * 0.2);
}

function precipitateVolumeMl(container: Container): number {
  return container.precipitate.reduce((sum, c) => {
    const substance = SUBSTANCES[c.substanceId];
    return sum + (substance ? c.grams / substance.densityGPerMl : 0);
  }, 0);
}

export interface PressureEngineInput {
  container: Container;
  profile: ContainerPhysicalProfile;
  isSealed: boolean;
  previousPressureKPa: number;
  dtSeconds: number;
}

export interface PressureEngineResult {
  pressureKPa: number; // абсолютное давление (атмосферное + избыточное)
  gaugePressureKPa: number; // избыточное над атмосферным — сравнивается с maxSafePressureKPa профиля
  gasAmountG: number;
  gasMoles: number;
  vaporFraction: number;
  freeVolumeMl: number;
}

export function computePressure(input: PressureEngineInput): PressureEngineResult {
  const { container, profile, isSealed, previousPressureKPa, dtSeconds } = input;

  const vaporFraction = computeVaporFraction(container);
  const gasAmountG = Math.min(MAX_VAPOR_MASS_FRACTION, vaporFraction) * totalMassG(container);

  const liquidVolumeMl = totalVolumeMl(container);
  const freeVolumeMl = Math.max(1, profile.capacityMl - liquidVolumeMl - precipitateVolumeMl(container));

  const gasMoles = gasAmountG / SUBSTANCES.water.molarMassGPerMol;

  if (!isSealed) {
    // сосуд открыт — накопленное ранее избыточное давление стравливается,
    // новый пар свободно уходит наружу и не создает нового избыточного
    // давления (реальная физика открытого сосуда)
    const previousGauge = Math.max(0, previousPressureKPa - AMBIENT_PRESSURE_KPA);
    const ventedGauge = previousGauge * Math.exp(-OPEN_VENT_RATE_PER_SEC * Math.max(0, dtSeconds));
    return {
      pressureKPa: AMBIENT_PRESSURE_KPA + ventedGauge,
      gaugePressureKPa: ventedGauge,
      gasAmountG,
      gasMoles,
      vaporFraction,
      freeVolumeMl,
    };
  }

  const temperatureK = container.temperatureC + KELVIN_OFFSET;
  const freeVolumeM3 = freeVolumeMl / 1e6;
  const gaugePressurePa = (gasMoles * GAS_CONSTANT_R * temperatureK) / freeVolumeM3;
  const gaugePressureKPa = gaugePressurePa / 1000;

  return {
    pressureKPa: AMBIENT_PRESSURE_KPA + gaugePressureKPa,
    gaugePressureKPa,
    gasAmountG,
    gasMoles,
    vaporFraction,
    freeVolumeMl,
  };
}
