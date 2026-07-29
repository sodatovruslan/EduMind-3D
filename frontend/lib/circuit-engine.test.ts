import { describe, expect, it } from "vitest";
import { bulbBrightness, solveCircuit, type CircuitComponent, type Connection } from "./circuit-engine";

// простая последовательная цепь: батарея 12В -> резистор 4Ом -> лампа 2Ом
// -> выключатель -> амперметр -> обратно к батарее
function seriesCircuit(overrides?: Partial<Record<"switchClosed" | "resistorOhm" | "bulbOhm", unknown>>) {
  const components: CircuitComponent[] = [
    { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
    {
      id: "r1",
      kind: "resistor",
      terminals: ["r1_a", "r1_b"],
      resistanceOhm: (overrides?.resistorOhm as number) ?? 4,
    },
    {
      id: "bulb1",
      kind: "bulb",
      terminals: ["bulb_a", "bulb_b"],
      resistanceOhm: (overrides?.bulbOhm as number) ?? 2,
      ratedPowerW: 18,
    },
    { id: "sw1", kind: "switch", terminals: ["sw_a", "sw_b"], isClosed: (overrides?.switchClosed as boolean) ?? true },
    { id: "amp1", kind: "ammeter", terminals: ["amp_a", "amp_b"] },
  ];
  const connections: Connection[] = [
    { id: "c1", terminals: ["bat_pos", "r1_a"] },
    { id: "c2", terminals: ["r1_b", "bulb_a"] },
    { id: "c3", terminals: ["bulb_b", "sw_a"] },
    { id: "c4", terminals: ["sw_b", "amp_a"] },
    { id: "c5", terminals: ["amp_b", "bat_neg"] },
  ];
  return { components, connections };
}

describe("solveCircuit", () => {
  it("computes real current via Ohm's law for a closed series loop", () => {
    const { components, connections } = seriesCircuit();
    const solution = solveCircuit(components, connections);

    expect(solution.isClosedLoop).toBe(true);
    expect(solution.isCircuitActive).toBe(true);
    expect(solution.currentA).toBeCloseTo(12 / 6, 5); // R_total = 4 + 2 = 6

    expect(solution.readings.r1.voltageV).toBeCloseTo(8, 5); // I*R = 2*4
    expect(solution.readings.bulb1.voltageV).toBeCloseTo(4, 5); // 2*2
    expect(solution.readings.bulb1.powerW).toBeCloseTo(8, 5); // I^2*R = 4*2
  });

  it("derives bulb brightness from computed power, not a fixed animation", () => {
    const { components, connections } = seriesCircuit();
    const solution = solveCircuit(components, connections);
    const brightness = bulbBrightness(solution.readings.bulb1, 18);
    expect(brightness).toBeCloseTo(8 / 18, 5);
  });

  it("stops current completely when the switch is open", () => {
    const { components, connections } = seriesCircuit({ switchClosed: false });
    const solution = solveCircuit(components, connections);

    expect(solution.isClosedLoop).toBe(true);
    expect(solution.isCircuitActive).toBe(false);
    expect(solution.currentA).toBe(0);
    expect(solution.readings.r1.currentA).toBe(0);
  });

  it("detects a short circuit when total resistance is near zero", () => {
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
      { id: "sw1", kind: "switch", terminals: ["sw_a", "sw_b"], isClosed: true },
    ];
    const connections: Connection[] = [
      { id: "c1", terminals: ["bat_pos", "sw_a"] },
      { id: "c2", terminals: ["sw_b", "bat_neg"] },
    ];
    const solution = solveCircuit(components, connections);

    expect(solution.isCircuitActive).toBe(true);
    expect(solution.isShortCircuit).toBe(true);
    expect(solution.currentA).toBeGreaterThan(1000); // V / почти-ноль сопротивления
  });

  it("marks the fuse to blow once current exceeds its rating, then opens the circuit once blown", () => {
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
      { id: "r1", kind: "resistor", terminals: ["r1_a", "r1_b"], resistanceOhm: 2 },
      { id: "fuse1", kind: "fuse", terminals: ["f_a", "f_b"], ratedCurrentA: 3, isBlown: false },
    ];
    const connections: Connection[] = [
      { id: "c1", terminals: ["bat_pos", "r1_a"] },
      { id: "c2", terminals: ["r1_b", "f_a"] },
      { id: "c3", terminals: ["f_b", "bat_neg"] },
    ];

    // I = 12/2 = 6A > rated 3A -> should mark fuse to blow
    const before = solveCircuit(components, connections);
    expect(before.isCircuitActive).toBe(true);
    expect(before.currentA).toBeCloseTo(6, 5);
    expect(before.fuseToBlowId).toBe("fuse1");

    // caller applies the blown state (pure function doesn't mutate its input)
    const blownComponents = components.map((c) => (c.id === "fuse1" ? { ...c, isBlown: true } : c));
    const after = solveCircuit(blownComponents, connections);
    expect(after.isCircuitActive).toBe(false);
    expect(after.currentA).toBe(0);
  });

  it("keeps a fuse rated above the current intact", () => {
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
      { id: "r1", kind: "resistor", terminals: ["r1_a", "r1_b"], resistanceOhm: 6 },
      { id: "fuse1", kind: "fuse", terminals: ["f_a", "f_b"], ratedCurrentA: 5, isBlown: false },
    ];
    const connections: Connection[] = [
      { id: "c1", terminals: ["bat_pos", "r1_a"] },
      { id: "c2", terminals: ["r1_b", "f_a"] },
      { id: "c3", terminals: ["f_b", "bat_neg"] },
    ];
    const solution = solveCircuit(components, connections);
    expect(solution.currentA).toBeCloseTo(2, 5); // 12/6, well under 5A rating
    expect(solution.fuseToBlowId).toBeNull();
  });

  it("reads the correct voltage across a component via an attached voltmeter", () => {
    const { components, connections } = seriesCircuit();
    const withVoltmeter: CircuitComponent[] = [
      ...components,
      { id: "volt1", kind: "voltmeter", terminals: ["r1_a", "r1_b"] },
    ];
    const solution = solveCircuit(withVoltmeter, connections);
    expect(solution.readings.volt1.voltageV).toBeCloseTo(8, 5); // тот же перепад, что и на r1
    expect(solution.readings.volt1.currentA).toBe(0); // идеальный вольтметр не потребляет ток
  });

  it("reads the full source voltage across an open switch (classic teaching case)", () => {
    const { components, connections } = seriesCircuit({ switchClosed: false });
    const withVoltmeter: CircuitComponent[] = [
      ...components,
      { id: "volt1", kind: "voltmeter", terminals: ["sw_a", "sw_b"] },
    ];
    const solution = solveCircuit(withVoltmeter, connections);
    expect(solution.readings.volt1.voltageV).toBeCloseTo(12, 5);
  });

  it("returns an inactive solution when there is no battery", () => {
    const solution = solveCircuit(
      [{ id: "r1", kind: "resistor", terminals: ["a", "b"], resistanceOhm: 4 }],
      []
    );
    expect(solution.isClosedLoop).toBe(false);
    expect(solution.isCircuitActive).toBe(false);
  });

  it("returns an inactive solution when the loop never closes", () => {
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
      { id: "r1", kind: "resistor", terminals: ["r1_a", "r1_b"], resistanceOhm: 4 },
    ];
    // резистор подключен только с одной стороны — контур не замкнут
    const connections: Connection[] = [{ id: "c1", terminals: ["bat_pos", "r1_a"] }];
    const solution = solveCircuit(components, connections);
    expect(solution.isClosedLoop).toBe(false);
    expect(solution.currentA).toBe(0);
  });
});
