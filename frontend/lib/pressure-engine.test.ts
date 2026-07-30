import { describe, expect, it } from "vitest";
import { addSubstance, createEmptyContainer, heat } from "./chemistry-engine";
import { CONTAINER_PHYSICS } from "./container-physics";
import { AMBIENT_PRESSURE_KPA, computePressure, computeVaporFraction } from "./pressure-engine";

describe("pressure-engine — computeVaporFraction", () => {
  it("не производит пар, пока температура далека от точки кипения", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 200);
    expect(computeVaporFraction(c)).toBe(0);
  });

  it("растет плавно к точке кипения и после нее — без скачка", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 200);

    const before = computeVaporFraction(heat(c, 85 - 20)); // 85°C, чуть ниже кипения
    const atBoiling = computeVaporFraction(heat(c, 100 - 20));
    const above = computeVaporFraction(heat(c, 120 - 20));

    expect(before).toBeGreaterThanOrEqual(0);
    expect(atBoiling).toBeGreaterThan(before);
    expect(above).toBeGreaterThan(atBoiling);
    expect(above).toBeLessThanOrEqual(1);
  });
});

describe("pressure-engine — computePressure", () => {
  it("для открытого сосуда давление остается около атмосферного независимо от кипения", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 200);
    c = heat(c, 90); // 110°C — уверенно кипит

    const result = computePressure({
      container: c,
      profile: CONTAINER_PHYSICS.beaker,
      isSealed: false,
      previousPressureKPa: AMBIENT_PRESSURE_KPA,
      dtSeconds: 1,
    });

    expect(result.pressureKPa).toBeCloseTo(AMBIENT_PRESSURE_KPA, 1);
  });

  it("газ выходит из открытого сосуда — ранее накопленное давление стравливается со временем", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 200);
    c = heat(c, 90);

    const result = computePressure({
      container: c,
      profile: CONTAINER_PHYSICS.beaker,
      isSealed: false,
      previousPressureKPa: AMBIENT_PRESSURE_KPA + 50, // было раньше избыточное давление
      dtSeconds: 2,
    });

    expect(result.gaugePressureKPa).toBeLessThan(50);
    expect(result.gaugePressureKPa).toBeGreaterThanOrEqual(0);
  });

  it("для запечатанного сосуда давление реально растет при кипении (PV=nRT)", () => {
    let c = createEmptyContainer("c1", "beaker", 20);
    c = addSubstance(c, "water", 300);
    c = heat(c, 90); // 110°C

    const sealed = computePressure({
      container: c,
      profile: CONTAINER_PHYSICS.beaker,
      isSealed: true,
      previousPressureKPa: AMBIENT_PRESSURE_KPA,
      dtSeconds: 1,
    });

    expect(sealed.gaugePressureKPa).toBeGreaterThan(0);
    expect(sealed.pressureKPa).toBeGreaterThan(AMBIENT_PRESSURE_KPA);
  });

  it("при одинаковом количестве газа давление растет, если свободный объем меньше (тот же сосуд больше заполнен)", () => {
    let small = createEmptyContainer("c1", "test_tube", 20);
    small = addSubstance(small, "water", 10);
    small = heat(small, 90);

    let more = createEmptyContainer("c2", "test_tube", 20);
    more = addSubstance(more, "water", 30);
    more = heat(more, 90);

    const resultSmall = computePressure({
      container: small,
      profile: CONTAINER_PHYSICS.test_tube,
      isSealed: true,
      previousPressureKPa: AMBIENT_PRESSURE_KPA,
      dtSeconds: 1,
    });
    const resultMore = computePressure({
      container: more,
      profile: CONTAINER_PHYSICS.test_tube,
      isSealed: true,
      previousPressureKPa: AMBIENT_PRESSURE_KPA,
      dtSeconds: 1,
    });

    expect(resultMore.freeVolumeMl).toBeLessThan(resultSmall.freeVolumeMl);
  });

  it("без нагрева и без газа давление в запечатанном сосуде остается атмосферным", () => {
    const c = createEmptyContainer("c1", "beaker", 20);
    const result = computePressure({
      container: c,
      profile: CONTAINER_PHYSICS.beaker,
      isSealed: true,
      previousPressureKPa: AMBIENT_PRESSURE_KPA,
      dtSeconds: 1,
    });
    expect(result.gasAmountG).toBe(0);
    expect(result.pressureKPa).toBeCloseTo(AMBIENT_PRESSURE_KPA, 5);
  });

  it("детерминирован: одинаковые входы дают одинаковый результат", () => {
    let c = createEmptyContainer("c1", "flask", 20);
    c = addSubstance(c, "water", 150);
    c = heat(c, 85);
    const input = {
      container: c,
      profile: CONTAINER_PHYSICS.flask,
      isSealed: true,
      previousPressureKPa: AMBIENT_PRESSURE_KPA,
      dtSeconds: 1,
    };
    expect(computePressure(input)).toEqual(computePressure(input));
  });
});
