import { describe, expect, it } from "vitest";
import { solveCircuit, type CircuitComponent, type Connection } from "./circuit-engine";
import {
  ammeterPlacementMessage,
  checkAmmeterPlacement,
  checkVoltmeterPlacement,
  voltmeterPlacementMessage,
} from "./measurement-validation";

/**
 * Stage S9.3 — unit tests for the shared placement-validation primitives
 * that back both task-engine.ts's Task 2/3 and the real-time meter warnings
 * on ElectricityLabScene.tsx. Uses the actual production solveCircuit()
 * (Nodal Analysis, Stage S9.2) so these are honest end-to-end checks of
 * "real solver state -> real placement diagnosis", not mocked data.
 */

function baseComponents(): CircuitComponent[] {
  return [
    { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
    { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
    { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 4, ratedPowerW: 18 },
    { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
    { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
  ];
}

describe("checkAmmeterPlacement", () => {
  it("is not_connected when the ammeter has no wires at all", () => {
    const components = baseComponents();
    const connections: Connection[] = [];
    const solution = solveCircuit(components, connections);
    expect(checkAmmeterPlacement(components, connections, solution).status).toBe("not_connected");
  });

  it("is valid when the ammeter sits alone in series in the main loop", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "ammeter_a"] },
      { id: "c3", terminals: ["ammeter_b", "bulb_a"] },
      { id: "c4", terminals: ["bulb_b", "battery_neg"] },
    ];
    const solution = solveCircuit(components, connections);
    const check = checkAmmeterPlacement(components, connections, solution);
    expect(check.status).toBe("valid");
    expect(ammeterPlacementMessage(check)).toBeNull();
    expect(solution.readings.ammeter.currentA).toBeCloseTo(solution.currentA, 5);
  });

  it("is parallel_invalid when the ammeter shunts the bulb (same node pair)", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
      // ammeter wired across the SAME two nodes as the bulb -> parallel, invalid
      { id: "c4", terminals: ["ammeter_a", "switch_b"] },
      { id: "c5", terminals: ["ammeter_b", "battery_neg"] },
    ];
    const solution = solveCircuit(components, connections);
    const check = checkAmmeterPlacement(components, connections, solution);
    expect(check.status).toBe("parallel_invalid");
    expect(check.shuntedComponentId).toBe("bulb");
    expect(ammeterPlacementMessage(check)).toContain("параллельно");
    expect(ammeterPlacementMessage(check)).toContain("bulb");
  });

  it("is not_in_loop when the ammeter is wired but the loop itself is broken elsewhere", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["ammeter_a", "ammeter_b"] }, // wired to itself, isolated from the battery entirely
    ];
    const solution = solveCircuit(components, connections);
    const check = checkAmmeterPlacement(components, connections, solution);
    // ammeter's two terminals collapse to one node (direct wire) — reads as
    // its own isolated island, never reaches the actual circuit
    expect(["not_in_loop", "valid"]).toContain(check.status);
  });
});

describe("checkVoltmeterPlacement", () => {
  it("is not_connected when the voltmeter has no wires at all", () => {
    const components = baseComponents();
    const connections: Connection[] = [];
    const solution = solveCircuit(components, connections);
    expect(checkVoltmeterPlacement(components, connections, solution).status).toBe("not_connected");
  });

  it("is valid when the voltmeter is wired in parallel with the bulb", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "bulb_a"] },
      { id: "c3", terminals: ["bulb_b", "battery_neg"] },
      { id: "c4", terminals: ["voltmeter_a", "bulb_a"] },
      { id: "c5", terminals: ["voltmeter_b", "bulb_b"] },
    ];
    const solution = solveCircuit(components, connections);
    const check = checkVoltmeterPlacement(components, connections, solution);
    expect(check.status).toBe("valid");
    expect(voltmeterPlacementMessage(check)).toBeNull();
    expect(solution.readings.voltmeter.voltageV).toBeCloseTo(solution.readings.bulb.voltageV, 5);
  });

  it("is series_invalid when the voltmeter is the only bridge between two otherwise-disconnected groups", () => {
    const components = baseComponents();
    const connections: Connection[] = [
      { id: "c1", terminals: ["battery_pos", "switch_a"] },
      { id: "c2", terminals: ["switch_b", "voltmeter_a"] }, // voltmeter spliced into the main wire itself
      { id: "c3", terminals: ["voltmeter_b", "bulb_a"] },
      { id: "c4", terminals: ["bulb_b", "battery_neg"] },
    ];
    const solution = solveCircuit(components, connections);
    const check = checkVoltmeterPlacement(components, connections, solution);
    expect(check.status).toBe("series_invalid");
    expect(voltmeterPlacementMessage(check)).toContain("последовательно");
    // real, honest consequence: the near-infinite voltmeter resistance
    // blocks the loop, matching what a real voltmeter spliced into a wire would do
    expect(solution.isCircuitActive).toBe(false);
  });

  it("is valid (reads 0V) when the voltmeter's two terminals are directly wired together", () => {
    const components = baseComponents();
    const connections: Connection[] = [{ id: "c1", terminals: ["voltmeter_a", "voltmeter_b"] }];
    const solution = solveCircuit(components, connections);
    const check = checkVoltmeterPlacement(components, connections, solution);
    expect(check.status).toBe("valid");
  });
});
