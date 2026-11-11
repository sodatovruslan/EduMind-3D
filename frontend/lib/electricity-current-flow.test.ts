import { describe, expect, it } from "vitest";
import { solveCircuit, type CircuitComponent, type Connection } from "./circuit-engine";
import { computeWireFlows } from "./electricity-current-flow";

function bench(switchClosed = true): CircuitComponent[] {
  return [
    { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
    { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
    { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: 18 },
    { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: switchClosed },
    { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
  ];
}

const loop: Connection[] = [
  { id: "w1", terminals: ["battery_pos", "switch_a"] },
  // drawn "backwards" on purpose: from the bulb towards the switch
  { id: "w2", terminals: ["bulb_a", "switch_b"] },
  { id: "w3", terminals: ["bulb_b", "battery_neg"] },
];

function flowsFor(components: CircuitComponent[], connections: Connection[]) {
  return computeWireFlows(components, connections, solveCircuit(components, connections));
}

describe("computeWireFlows", () => {
  it("marks every wire of an active loop, oriented from + to −", () => {
    const flows = flowsFor(bench(), loop);
    expect(Array.from(flows.keys()).sort()).toEqual(["w1", "w2", "w3"]);
    expect(flows.get("w1")?.reversed).toBe(false);
    expect(flows.get("w2")?.reversed).toBe(true);
    expect(flows.get("w3")?.reversed).toBe(false);
  });

  it("is empty when the switch is open", () => {
    expect(flowsFor(bench(false), loop).size).toBe(0);
  });

  it("is empty when the loop is broken", () => {
    expect(flowsFor(bench(), loop.slice(0, 2)).size).toBe(0);
  });

  it("skips wires that carry no current: voltmeter leads and dead ends", () => {
    const connections: Connection[] = [
      ...loop,
      { id: "v1", terminals: ["voltmeter_a", "bulb_a"] },
      { id: "v2", terminals: ["voltmeter_b", "bulb_b"] },
      { id: "dead", terminals: ["resistor_a", "bulb_a"] },
    ];
    const flows = flowsFor(bench(), connections);
    expect(Array.from(flows.keys()).sort()).toEqual(["w1", "w2", "w3"]);
  });
});
