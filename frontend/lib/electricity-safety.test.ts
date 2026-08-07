import { describe, expect, it } from "vitest";
import { solveCircuit, type CircuitComponent, type Connection } from "./circuit-engine";
import { checkElectricalSafety } from "./electricity-safety";

/**
 * Stage S9.4 — unit tests for the Electricity Lab safety system. Same idiom
 * as measurement-validation.test.ts: real production solveCircuit() (Nodal
 * Analysis), no mocking, asserted via warnings.some(w => w.code === ...).
 */

// Same balanced topology as ElectricityLabScene.tsx's real INITIAL_COMPONENTS
// (battery -> resistor -> bulb -> ... -> fuse): resistor(4Ω) + bulb(2Ω) = 6Ω
// total -> 12V/6Ω = 2A, P_bulb = 2²×2 = 8W, comfortably under an 18W rating.
// A bare bulb alone across 12V (no resistor) would genuinely overload it —
// that's real physics, not a bug, so the resistor stays in every fixture
// that's meant to represent a "healthy" circuit.
function baseComponents(overrides?: Partial<{ ratedCurrentA: number; ratedPowerW: number }>): CircuitComponent[] {
  return [
    { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
    { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
    { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
    { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: overrides?.ratedPowerW ?? 18 },
    { id: "fuse", kind: "fuse", terminals: ["fuse_a", "fuse_b"], ratedCurrentA: overrides?.ratedCurrentA ?? 5, isBlown: false },
    { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
    { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
  ];
}

function fullLoopConnections(): Connection[] {
  return [
    { id: "c1", terminals: ["battery_pos", "switch_a"] },
    { id: "c2", terminals: ["switch_b", "resistor_a"] },
    { id: "c3", terminals: ["resistor_b", "bulb_a"] },
    { id: "c4", terminals: ["bulb_b", "fuse_a"] },
    { id: "c5", terminals: ["fuse_b", "battery_neg"] },
  ];
}

describe("checkElectricalSafety — short circuit", () => {
  it("flags short_circuit with a danger severity and educational message when the solver detects a dead short", () => {
    const components: CircuitComponent[] = [
      { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
      { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
    ];
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "battery_neg"] },
    ];
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(warnings.some((w) => w.code === "short_circuit" && w.severity === "danger")).toBe(true);
  });

  it("reports no short_circuit warning for a normal healthy loop", () => {
    const components = baseComponents();
    const connections = fullLoopConnections();
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(warnings.some((w) => w.code === "short_circuit")).toBe(false);
  });
});

describe("checkElectricalSafety — fuse behaviour and overload", () => {
  it("flags fuse_blown when the fuse is already blown", () => {
    const components = baseComponents().map((c) => (c.id === "fuse" ? { ...c, isBlown: true } : c));
    const connections = fullLoopConnections();
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(warnings.some((w) => w.code === "fuse_blown" && w.severity === "danger")).toBe(true);
  });

  it("warns with overload BEFORE the fuse actually blows, once current nears the rating", () => {
    // resistor(4Ω)+bulb(2Ω) = 6Ω -> 12V/6Ω = 2A. Rate the fuse at 2.3A -> 2/2.3 ≈ 0.87, above the 0.8 warning ratio, still below 1.0
    const components = baseComponents({ ratedCurrentA: 2.3 });
    const connections = fullLoopConnections();
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(solution.fuseToBlowId).toBeNull(); // solver itself agrees: not blown yet
    expect(warnings.some((w) => w.code === "overload" && w.severity === "warning")).toBe(true);
    expect(warnings.some((w) => w.code === "fuse_blown")).toBe(false);
  });

  it("does not warn about overload when current is comfortably under the fuse rating", () => {
    const components = baseComponents({ ratedCurrentA: 20 }); // 2A actual, way under 20A
    const connections = fullLoopConnections();
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(warnings.some((w) => w.code === "overload")).toBe(false);
  });

  it("warns about bulb overload when dissipated power exceeds its rated wattage", () => {
    // 12V / 6Ω = 2A -> P_bulb = I^2*R_bulb = 4*2 = 8W, above an artificially low 5W rating
    const components = baseComponents({ ratedPowerW: 5, ratedCurrentA: 100 });
    const connections = fullLoopConnections();
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(warnings.some((w) => w.code === "overload" && w.message.includes("лампе"))).toBe(true);
  });
});

describe("checkElectricalSafety — unsafe_connection (bypassing the fuse)", () => {
  it("flags unsafe_connection when current flows while bypassing the wired fuse", () => {
    const components = baseComponents();
    // fuse wired to itself (isolated loop) -> circuit closes WITHOUT routing through it
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
      { id: "c4", terminals: ["fuse_a", "fuse_b"] },
    ];
    const solution = solveCircuit(components, connections);
    expect(solution.isCircuitActive).toBe(true);

    const warnings = checkElectricalSafety({ components, connections, solution });
    expect(warnings.some((w) => w.code === "unsafe_connection" && w.severity === "danger")).toBe(true);
  });

  it("does not flag unsafe_connection when the fuse is genuinely in the conducting path", () => {
    const components = baseComponents();
    const connections = fullLoopConnections();
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(warnings.some((w) => w.code === "unsafe_connection")).toBe(false);
  });

  it("does not flag unsafe_connection when there is no current flowing at all", () => {
    const components = baseComponents({}).map((c) => (c.id === "switch" ? { ...c, isClosed: false } : c));
    const connections = fullLoopConnections();
    const solution = solveCircuit(components, connections);
    expect(solution.isCircuitActive).toBe(false);

    const warnings = checkElectricalSafety({ components, connections, solution });
    expect(warnings.some((w) => w.code === "unsafe_connection")).toBe(false);
  });
});

describe("checkElectricalSafety — unsafe_measurement (reuses measurement-validation.ts)", () => {
  it("flags unsafe_measurement (danger) when the ammeter shunts another component", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
      { id: "c4", terminals: ["ammeter_a", "switch_b"] },
      { id: "c5", terminals: ["ammeter_b", "battery_neg"] },
    ];
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(warnings.some((w) => w.code === "unsafe_measurement" && w.severity === "danger" && w.message.includes("параллельно"))).toBe(
      true
    );
  });

  it("flags unsafe_measurement (warning) when the voltmeter is spliced in series", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "voltmeter_a"] },
      { id: "c3", terminals: ["voltmeter_b", "bulb_a"] },
      { id: "c4", terminals: ["bulb_b", "battery_neg"] },
    ];
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(warnings.some((w) => w.code === "unsafe_measurement" && w.severity === "warning" && w.message.includes("последовательно"))).toBe(
      true
    );
  });

  it("reports no unsafe_measurement warnings when both meters are correctly placed", () => {
    const components = baseComponents();
    const connections = fullLoopConnections();
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(warnings.some((w) => w.code === "unsafe_measurement")).toBe(false);
  });
});

describe("checkElectricalSafety — healthy circuit produces zero warnings", () => {
  it("returns an empty array for a fully correct, safe, healthy circuit", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      ...fullLoopConnections(),
      { id: "c5", terminals: ["voltmeter_a", "bulb_a"] },
      { id: "c6", terminals: ["voltmeter_b", "bulb_b"] },
    ];
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(warnings).toEqual([]);
  });
});
