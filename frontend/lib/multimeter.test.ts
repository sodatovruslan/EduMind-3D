import { describe, expect, it } from "vitest";
import type { CircuitComponent, Connection } from "./circuit-engine";
import { readMultimeter } from "./multimeter";

const components: CircuitComponent[] = [
  { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 9 },
  { id: "r", kind: "resistor", terminals: ["r_a", "r_b"], resistanceOhm: 100 },
];

describe("real multimeter", () => {
  it("reports disconnected probes without an invented value", () => {
    expect(readMultimeter("voltage", components, [])).toMatchObject({ status: "disconnected", value: null });
  });

  it("measures DC voltage and preserves probe polarity", () => {
    const forward: Connection[] = [
      { id: "p", terminals: ["multimeter_red", "battery_pos"] },
      { id: "n", terminals: ["multimeter_black", "battery_neg"] },
      { id: "load-p", terminals: ["r_a", "battery_pos"] },
      { id: "load-n", terminals: ["r_b", "battery_neg"] },
    ];
    expect(readMultimeter("voltage", components, forward).value).toBeCloseTo(9, 5);
    const reversed = forward.map((connection) => connection.id === "p" ? { ...connection, terminals: ["multimeter_red", "battery_neg"] as [string, string] } : connection.id === "n" ? { ...connection, terminals: ["multimeter_black", "battery_pos"] as [string, string] } : connection);
    expect(readMultimeter("voltage", components, reversed).value).toBeCloseTo(-9, 5);
  });

  it("measures current when inserted in series", () => {
    const wires: Connection[] = [
      { id: "1", terminals: ["battery_pos", "r_a"] },
      { id: "2", terminals: ["r_b", "multimeter_red"] },
      { id: "3", terminals: ["multimeter_black", "battery_neg"] },
    ];
    expect(readMultimeter("current", components, wires).value).toBeCloseTo(0.09, 4);
  });

  it("reports overload when current mode is placed across the source", () => {
    const wires: Connection[] = [
      { id: "1", terminals: ["multimeter_red", "battery_pos"] },
      { id: "2", terminals: ["multimeter_black", "battery_neg"] },
    ];
    expect(readMultimeter("current", components, wires).status).toBe("overload");
  });

  it("measures resistance with its solver-backed 1 V test source", () => {
    const wires: Connection[] = [
      { id: "1", terminals: ["multimeter_red", "r_a"] },
      { id: "2", terminals: ["multimeter_black", "r_b"] },
    ];
    expect(readMultimeter("resistance", components, wires).value).toBeCloseTo(100, 4);
  });

  it("updates when circuit resistance changes", () => {
    const wires: Connection[] = [
      { id: "1", terminals: ["multimeter_red", "r_a"] },
      { id: "2", terminals: ["multimeter_black", "r_b"] },
    ];
    const changed = components.map((component) => component.id === "r" ? { ...component, resistanceOhm: 220 } : component);
    expect(readMultimeter("resistance", changed, wires).value).toBeCloseTo(220, 4);
  });

  it("rejects resistance mode on an energized circuit", () => {
    const wires: Connection[] = [
      { id: "1", terminals: ["multimeter_red", "battery_pos"] },
      { id: "2", terminals: ["multimeter_black", "r_a"] },
      { id: "3", terminals: ["r_b", "battery_neg"] },
    ];
    expect(readMultimeter("resistance", components, wires)).toMatchObject({ status: "wrong_mode", value: null });
  });
});
