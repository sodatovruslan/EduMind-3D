import { describe, expect, it } from "vitest";
import { CONTAINER_PHYSICS, createDefaultIntegrity, updateIntegrity } from "./container-physics";

describe("container-physics — CONTAINER_PHYSICS catalog", () => {
  it("определяет профиль только для реально существующих в проекте типов сосудов", () => {
    expect(Object.keys(CONTAINER_PHYSICS).sort()).toEqual(["beaker", "flask", "test_tube"]);
  });

  it("каждый профиль ссылается сам на себя по kind", () => {
    (Object.keys(CONTAINER_PHYSICS) as (keyof typeof CONTAINER_PHYSICS)[]).forEach((kind) => {
      expect(CONTAINER_PHYSICS[kind].kind).toBe(kind);
    });
  });
});

describe("container-physics — updateIntegrity (детерминированная модель целостности)", () => {
  it("не накапливает повреждение, пока показатели в пределах безопасного профиля", () => {
    const profile = CONTAINER_PHYSICS.beaker;
    const state = createDefaultIntegrity(profile);
    const next = updateIntegrity({
      profile,
      previous: state,
      temperatureC: 50,
      gaugePressureKPa: 3, // небольшое избыточное давление, ниже профиля
      temperatureRateCPerSec: 1,
      dtSeconds: 5,
    });
    expect(next.level).toBe("normal");
    expect(next.stressScore).toBe(0);
  });

  it("постепенно накапливает повреждение при устойчивом превышении давления", () => {
    const profile = CONTAINER_PHYSICS.beaker;
    let state = createDefaultIntegrity(profile);
    const overGaugeKPa = profile.maxSafePressureKPa * 2; // вдвое выше предела -> overPressureRatio = 1

    for (let i = 0; i < 5; i++) {
      state = updateIntegrity({
        profile,
        previous: state,
        temperatureC: 90,
        gaugePressureKPa: overGaugeKPa,
        temperatureRateCPerSec: 0,
        dtSeconds: 1,
      });
    }

    expect(state.stressScore).toBeGreaterThan(0);
    expect(["stressed", "cracked", "ruptured"]).toContain(state.level);
  });

  it("проходит через промежуточные уровни stressed -> cracked перед ruptured (нет мгновенного разрыва)", () => {
    const profile = CONTAINER_PHYSICS.beaker;
    let state = createDefaultIntegrity(profile);
    const seenLevels = new Set<string>();
    const overGaugeKPa = profile.maxSafePressureKPa * 2;

    for (let i = 0; i < 60 && state.level !== "ruptured"; i++) {
      state = updateIntegrity({
        profile,
        previous: state,
        temperatureC: 80,
        gaugePressureKPa: overGaugeKPa,
        temperatureRateCPerSec: 0,
        dtSeconds: 1,
      });
      seenLevels.add(state.level);
    }

    expect(seenLevels.has("stressed")).toBe(true);
    expect(seenLevels.has("cracked")).toBe(true);
  });

  it("необратимо остается ruptured после разрыва, даже если показатели потом приходят в норму", () => {
    const profile = CONTAINER_PHYSICS.test_tube;
    const ruptured = { level: "ruptured" as const, stressScore: 1 };
    const next = updateIntegrity({
      profile,
      previous: ruptured,
      temperatureC: 20,
      gaugePressureKPa: 0,
      temperatureRateCPerSec: 0,
      dtSeconds: 5,
    });
    expect(next.level).toBe("ruptured");
  });

  it("накапливает повреждение от резкого перепада температуры (thermal shock) даже без избыточного давления", () => {
    const profile = CONTAINER_PHYSICS.test_tube;
    let state = createDefaultIntegrity(profile);
    const shockRateCPerSec = profile.thermalShockResistance * 3;

    for (let i = 0; i < 60 && state.level === "normal"; i++) {
      state = updateIntegrity({
        profile,
        previous: state,
        temperatureC: 20,
        gaugePressureKPa: 0,
        temperatureRateCPerSec: shockRateCPerSec,
        dtSeconds: 1,
      });
    }

    expect(state.stressScore).toBeGreaterThan(0);
    expect(state.level).not.toBe("normal");
  });

  it("детерминирована: одинаковые входы дают одинаковый результат", () => {
    const profile = CONTAINER_PHYSICS.flask;
    const state = createDefaultIntegrity(profile);
    const input = {
      profile,
      previous: state,
      temperatureC: 150,
      gaugePressureKPa: 200,
      temperatureRateCPerSec: 5,
      dtSeconds: 2,
    };
    const a = updateIntegrity(input);
    const b = updateIntegrity(input);
    expect(a).toEqual(b);
  });
});
