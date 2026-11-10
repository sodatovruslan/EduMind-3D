import { describe, expect, it } from "vitest";
import { planBreak, planShort } from "./electricity-faults";
import { solveCircuit, type CircuitComponent, type Connection } from "./circuit-engine";

const components: CircuitComponent[] = [
  { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
  { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
  { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: 18 },
  { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
  { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
];

const loop: Connection[] = [
  { id: "w1", terminals: ["battery_pos", "switch_a"] },
  { id: "w2", terminals: ["switch_b", "bulb_a"] },
  { id: "w3", terminals: ["bulb_b", "resistor_a"] },
  { id: "w4", terminals: ["resistor_b", "battery_neg"] },
  { id: "v1", terminals: ["voltmeter_a", "bulb_a"] },
  { id: "v2", terminals: ["voltmeter_b", "bulb_b"] },
];

describe("planBreak", () => {
  it("removes a main-loop wire, never a voltmeter lead, and the circuit really opens", () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      const fault = planBreak(loop, () => r);
      expect(fault?.kind).toBe("remove");
      const id = fault?.kind === "remove" ? fault.connectionId : "";
      expect(id.startsWith("v")).toBe(false);
      const after = loop.filter((c) => c.id !== id);
      expect(solveCircuit(components, after).isCircuitActive).toBe(false);
    }
  });

  it("returns null when there is nothing to break", () => {
    expect(planBreak([])).toBeNull();
  });
});

describe("planShort", () => {
  it("adds a jumper that creates a real short circuit, away from the battery terminals", () => {
    const fault = planShort(loop, 1);
    expect(fault.kind).toBe("add");
    const jumper = fault.kind === "add" ? fault.connection : null;
    expect(jumper?.terminals.some((t) => t.startsWith("battery_"))).toBe(false);
    const solution = solveCircuit(components, [...loop, jumper!]);
    expect(solution.isShortCircuit).toBe(true);
  });

  it("falls back to the battery terminals when nothing else is wired", () => {
    const fault = planShort([], 1);
    expect(fault.kind === "add" && fault.connection.terminals).toEqual(["battery_pos", "battery_neg"]);
  });
});
