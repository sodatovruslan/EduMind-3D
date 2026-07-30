/**
 * Chemistry World — Hazard Engine (Stage 5.5 v2). Единственное место, которое
 * решает уровень лабораторной опасности — НЕ UI, НЕ AI. Анализирует только
 * уже посчитанные реальные данные: состояние сосуда из Chemistry Engine,
 * записи Reaction Engine (isExothermic через getRegisteredReactions),
 * результат существующего checkSafety() (не пересчитывается заново),
 * давление из Pressure Engine, целостность из Container Physics.
 *
 * Никакой Math.random. Никакой проверки конкретной пары веществ вида
 * "если A и B — взрыв". Explosion — это ВСЕГДА следствие нескольких
 * подтвержденных числовых условий (см. evaluateHazard), а не отдельная
 * ветка "на глаз".
 */
import type { Container } from "./chemistry-engine";
import { getRegisteredReactions } from "./reaction-engine";
import type { SafetyWarning } from "./chemistry-safety";
import type { ContainerPhysicalProfile, IntegrityLevel, IntegrityState } from "./container-physics";
import { createDefaultIntegrity, updateIntegrity } from "./container-physics";
import { AMBIENT_PRESSURE_KPA, computePressure, type PressureEngineResult } from "./pressure-engine";
import { isFlammable } from "./chemistry-hazard-substance-properties";

export type HazardLevel =
  | "none"
  | "warning"
  | "heating"
  | "boiling"
  | "gas_release"
  | "pressure_buildup"
  | "flash"
  | "fire"
  | "container_stress"
  | "container_damage"
  | "container_rupture"
  | "explosion";

export interface HazardCause {
  code: string;
  message: string;
}

export type HazardVisualEventType =
  | "steam"
  | "gas_cloud"
  | "condensation"
  | "smoke"
  | "flame"
  | "crack"
  | "shatter"
  | "flash"
  | "shockwave";

export type HazardSoundEventType =
  | "gas_hiss"
  | "pressure_hum"
  | "glass_stress"
  | "crack_snap"
  | "rupture_bang"
  | "flash_whoosh"
  | "fire_crackle"
  | "shock_thud"
  | "alarm";

export interface HazardVisualEvent {
  type: HazardVisualEventType;
  intensity: number; // 0..1
}

export interface HazardSoundEvent {
  type: HazardSoundEventType;
  intensity: number; // 0..1
}

export interface HazardExplanationContext {
  safetyWarnings: SafetyWarning[];
  reactionLog: { reactionId: string; title: string; at: number }[];
  isSealed: boolean;
  hasHeatSource: boolean;
}

export interface HazardResult {
  level: HazardLevel;
  causes: HazardCause[];
  temperatureC: number;
  pressureKPa: number; // абсолютное
  gaugePressureKPa: number; // избыточное над атмосферным
  gasAmountG: number;
  freeVolumeMl: number;
  pressureRatio: number; // gaugePressureKPa / maxSafePressureKPa (0..1+ )
  temperatureRatio: number; // temperatureC / maxSafeTemperatureC (0..1+)
  containerIntegrity: IntegrityState;
  shouldStopExperiment: boolean;
  visualEvents: HazardVisualEvent[];
  soundEvents: HazardSoundEvent[];
  explanationContext: HazardExplanationContext;
}

export interface HazardEngineInput {
  container: Container;
  profile: ContainerPhysicalProfile;
  isSealed: boolean;
  hasHeatSource: boolean;
  safetyWarnings: SafetyWarning[];
  reactionLog: { reactionId: string; title: string; at: number }[];
  previousIntegrity: IntegrityState;
  previousPressureKPa: number;
  previousTemperatureC: number;
  dtSeconds: number; // с прошлого шага Hazard Engine (не с прошлого кадра рендера)
}

// --- пороги (учебные приближения, задокументированы явно) ---
const PRESSURE_BUILDUP_RATIO_THRESHOLD = 0.3;
const HEATING_TEMPERATURE_RATIO_THRESHOLD = 0.35;
const EXPLOSION_PRESSURE_RATIO_THRESHOLD = 1.0;
const FIRE_VAPOR_FRACTION_THRESHOLD = 0.5;
const THERMAL_SHOCK_WARNING_RATIO = 0.5;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// цвет/агрессия визуальных и звуковых эффектов зависят от уровня,
// но каждое конкретное число — от реальных ratio, не от Math.random
function buildVisualEvents(params: {
  vaporFraction: number;
  pressureRatio: number;
  isSealed: boolean;
  integrity: IntegrityState;
  justRuptured: boolean;
  fireActive: boolean;
  cooling: boolean;
}): HazardVisualEvent[] {
  const { vaporFraction, pressureRatio, isSealed, integrity, justRuptured, fireActive, cooling } = params;
  const events: HazardVisualEvent[] = [];

  if (vaporFraction > 0.02) events.push({ type: "steam", intensity: clamp01(vaporFraction) });
  if (!isSealed && vaporFraction > 0.15) events.push({ type: "gas_cloud", intensity: clamp01(vaporFraction) });
  if (cooling && vaporFraction > 0.05) events.push({ type: "condensation", intensity: clamp01(vaporFraction * 0.6) });
  if (fireActive) {
    events.push({ type: "flame", intensity: 1 });
    events.push({ type: "smoke", intensity: 0.6 });
  }
  if (integrity.level === "stressed" || integrity.level === "cracked") {
    events.push({ type: "crack", intensity: clamp01(integrity.stressScore) });
  }
  if (justRuptured) {
    events.push({ type: "shatter", intensity: 1 });
    events.push({ type: "flash", intensity: clamp01(pressureRatio) });
    events.push({ type: "shockwave", intensity: clamp01(pressureRatio) });
  }
  return events;
}

function buildSoundEvents(params: {
  vaporFraction: number;
  isSealed: boolean;
  pressureRatio: number;
  integrity: IntegrityState;
  justCracked: boolean;
  justRuptured: boolean;
  fireActive: boolean;
  emergency: boolean;
}): HazardSoundEvent[] {
  const { vaporFraction, isSealed, pressureRatio, integrity, justCracked, justRuptured, fireActive, emergency } = params;
  const events: HazardSoundEvent[] = [];

  if (!isSealed && vaporFraction > 0.15) events.push({ type: "gas_hiss", intensity: clamp01(vaporFraction) });
  if (isSealed && pressureRatio > PRESSURE_BUILDUP_RATIO_THRESHOLD) {
    events.push({ type: "pressure_hum", intensity: clamp01(pressureRatio) });
  }
  if (integrity.level === "stressed") events.push({ type: "glass_stress", intensity: clamp01(integrity.stressScore) });
  if (justCracked) events.push({ type: "crack_snap", intensity: 1 });
  if (justRuptured) {
    events.push({ type: "rupture_bang", intensity: 1 });
    events.push({ type: "shock_thud", intensity: clamp01(pressureRatio) });
  }
  if (fireActive) {
    events.push({ type: "flash_whoosh", intensity: 1 });
    events.push({ type: "fire_crackle", intensity: 0.7 });
  }
  if (emergency) events.push({ type: "alarm", intensity: 1 });
  return events;
}

export function evaluateHazard(input: HazardEngineInput): HazardResult {
  const {
    container,
    profile,
    isSealed,
    hasHeatSource,
    safetyWarnings,
    reactionLog,
    previousIntegrity,
    previousPressureKPa,
    previousTemperatureC,
    dtSeconds,
  } = input;

  const pressure: PressureEngineResult = computePressure({
    container,
    profile,
    isSealed,
    previousPressureKPa,
    dtSeconds,
  });

  const temperatureRateCPerSec = dtSeconds > 0 ? (container.temperatureC - previousTemperatureC) / dtSeconds : 0;

  const integrity = updateIntegrity({
    profile,
    previous: previousIntegrity,
    temperatureC: container.temperatureC,
    gaugePressureKPa: pressure.gaugePressureKPa,
    temperatureRateCPerSec,
    dtSeconds,
  });

  const pressureRatio = pressure.gaugePressureKPa / profile.maxSafePressureKPa;
  const temperatureRatio = container.temperatureC / profile.maxSafeTemperatureC;
  const thermalShockRatio = Math.abs(temperatureRateCPerSec) / profile.thermalShockResistance;

  const justCracked = previousIntegrity.level !== "cracked" && integrity.level === "cracked";
  const justRuptured = previousIntegrity.level !== "ruptured" && integrity.level === "ruptured";
  const cooling = temperatureRateCPerSec < -0.05;

  // экзотермическая реакция за последние несколько секунд — реальный
  // признак из Reaction Engine (isExothermic), а не решение этого модуля
  const recentExothermicReaction = reactionLog.some((entry) => {
    const reaction = getRegisteredReactions().find((r) => r.id === entry.reactionId);
    return reaction?.isExothermic && Date.now() - entry.at < 5000;
  });

  // Fire System: горючая среда + источник зажигания + достаточная
  // концентрация пара. С текущим набором веществ проекта isFlammable
  // всегда false (см. chemistry-hazard-substance-properties.ts) —
  // условие честно никогда не подтверждается, это не заглушка
  const hasFlammableVapor = container.contents.some((c) => isFlammable(c.substanceId));
  const fireCondition = hasFlammableVapor && hasHeatSource && pressure.vaporFraction >= FIRE_VAPOR_FRACTION_THRESHOLD;

  // Explosion — только как следствие ПОДТВЕРЖДЕННОГО разрыва под реальным
  // избыточным давлением, либо подтвержденного возгорания при избыточном
  // давлении в замкнутом объеме. Никогда не вызывается напрямую по паре
  // веществ и никогда не результат случайного числа.
  const pressureRupture = integrity.level === "ruptured" && pressureRatio >= EXPLOSION_PRESSURE_RATIO_THRESHOLD;
  const fireExplosion = fireCondition && isSealed && pressureRatio >= PRESSURE_BUILDUP_RATIO_THRESHOLD;
  const isExplosion = pressureRupture || fireExplosion;

  const causes: HazardCause[] = [];
  safetyWarnings.forEach((w) =>
    causes.push({ code: `safety:${w.code}`, message: w.message })
  );
  if (recentExothermicReaction) {
    causes.push({ code: "exothermic_reaction_heat", message: "Недавно прошла экзотермическая реакция — она подняла температуру сосуда." });
  }
  if (temperatureRatio > 1) {
    causes.push({
      code: "temperature_exceeds_container_rating",
      message: `Температура ${container.temperatureC.toFixed(0)}°C превышает предел сосуда (${profile.maxSafeTemperatureC}°C).`,
    });
  }
  if (pressureRatio > 1) {
    causes.push({
      code: "pressure_exceeds_container_rating",
      message: `Избыточное давление ${pressure.gaugePressureKPa.toFixed(0)} кПа превышает предел сосуда (${profile.maxSafePressureKPa} кПа).`,
    });
  }
  if (thermalShockRatio > 1) {
    causes.push({
      code: "thermal_shock",
      message: `Слишком резкое изменение температуры (${temperatureRateCPerSec.toFixed(1)}°C/с) — риск термического растрескивания.`,
    });
  }
  if (integrity.level !== "normal") {
    causes.push({ code: `integrity_${integrity.level}`, message: `Целостность сосуда: ${integrity.level} (накопленное повреждение ${(integrity.stressScore * 100).toFixed(0)}%).` });
  }
  if (isSealed && pressureRatio > PRESSURE_BUILDUP_RATIO_THRESHOLD) {
    causes.push({ code: "sealed_pressure_buildup", message: "Сосуд герметично закрыт — образующийся пар не выходит и накапливает давление." });
  }
  if (fireCondition) {
    causes.push({ code: "flammable_vapor_ignited", message: "Горючий пар воспламенился от источника нагрева." });
  }

  // --- определение итогового уровня: от самого критического к наименее опасному ---
  let level: HazardLevel = "none";
  if (isExplosion) level = "explosion";
  else if (fireCondition) level = "fire";
  else if (integrity.level === "ruptured") level = "container_rupture";
  else if (integrity.level === "cracked") level = "container_damage";
  else if (integrity.level === "stressed") level = "container_stress";
  else if (isSealed && pressureRatio > PRESSURE_BUILDUP_RATIO_THRESHOLD) level = "pressure_buildup";
  else if (pressure.vaporFraction >= 0.2 && (!isSealed || pressureRatio <= PRESSURE_BUILDUP_RATIO_THRESHOLD)) {
    level = pressure.vaporFraction >= 0.9 ? "boiling" : "gas_release";
  } else if (hasHeatSource && temperatureRatio > HEATING_TEMPERATURE_RATIO_THRESHOLD) level = "heating";
  else if (safetyWarnings.length > 0 || thermalShockRatio > THERMAL_SHOCK_WARNING_RATIO) level = "warning";

  const shouldStopExperiment = level === "container_rupture" || level === "explosion" || level === "fire";

  const visualEvents = buildVisualEvents({
    vaporFraction: pressure.vaporFraction,
    pressureRatio,
    isSealed,
    integrity,
    justRuptured,
    fireActive: fireCondition || isExplosion,
    cooling,
  });

  const soundEvents = buildSoundEvents({
    vaporFraction: pressure.vaporFraction,
    isSealed,
    pressureRatio,
    integrity,
    justCracked,
    justRuptured,
    fireActive: fireCondition || isExplosion,
    emergency: shouldStopExperiment,
  });

  return {
    level,
    causes,
    temperatureC: container.temperatureC,
    pressureKPa: pressure.pressureKPa,
    gaugePressureKPa: pressure.gaugePressureKPa,
    gasAmountG: pressure.gasAmountG,
    freeVolumeMl: pressure.freeVolumeMl,
    pressureRatio,
    temperatureRatio,
    containerIntegrity: integrity,
    shouldStopExperiment,
    visualEvents,
    soundEvents,
    explanationContext: {
      safetyWarnings,
      reactionLog,
      isSealed,
      hasHeatSource,
    },
  };
}

// Accident Event Log (Stage 5.5 v2, п.10) — история реальных переходов
// уровня опасности за текущий эксперимент; определяется здесь (не в
// ChemistryWorkspaceProvider), чтобы и провайдер, и Chemistry Context
// Builder ссылались на один и тот же тип без циклических импортов
// lib -> components
export interface AccidentLogEntry {
  at: number;
  containerId: string;
  level: HazardLevel;
  causes: HazardCause[];
  temperatureC: number;
  pressureKPa: number;
  integrityLevel: IntegrityLevel;
  event: string;
}

// безопасное начальное состояние — для инициализации ContainerItem,
// без вызова полного расчета с dt=0 (граничный случай)
export function createSafeHazardResult(container: Container, profile: ContainerPhysicalProfile): HazardResult {
  return {
    level: "none",
    causes: [],
    temperatureC: container.temperatureC,
    pressureKPa: AMBIENT_PRESSURE_KPA,
    gaugePressureKPa: 0,
    gasAmountG: 0,
    freeVolumeMl: profile.capacityMl,
    pressureRatio: 0,
    temperatureRatio: container.temperatureC / profile.maxSafeTemperatureC,
    containerIntegrity: createDefaultIntegrity(profile),
    shouldStopExperiment: false,
    visualEvents: [],
    soundEvents: [],
    explanationContext: { safetyWarnings: [], reactionLog: [], isSealed: false, hasHeatSource: false },
  };
}
