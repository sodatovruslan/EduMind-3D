// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ExperimentStateProvider, useExperimentState } from "./ExperimentStateProvider";
import { solveCircuit, type CircuitComponent } from "@/lib/circuit-engine";
import { checkElectricalSafety } from "@/lib/electricity-safety";

/**
 * Stage S9.4 — Safety System integration tests. Same idiom as
 * MeasurementTools.integration.test.tsx: real ExperimentStateProvider (the
 * same reducer ElectricityLabScene.tsx uses) -> real production
 * solveCircuit() -> real checkElectricalSafety(). Single-state snapshots
 * per test (multi-step lifecycles live in
 * ElectricitySafetyWorkflow.integration.test.tsx instead).
 */

afterEach(cleanup);

const INITIAL_COMPONENTS: CircuitComponent[] = [
  { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
  { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
  { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
  { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: 18 },
  { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
  { id: "fuse", kind: "fuse", terminals: ["fuse_a", "fuse_b"], ratedCurrentA: 5, isBlown: false },
  { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
];

function wrapper({ children }: { children: ReactNode }) {
  return <ExperimentStateProvider initialComponents={INITIAL_COMPONENTS}>{children}</ExperimentStateProvider>;
}

describe("Electricity Safety — real wiring through ExperimentStateProvider + production solver", () => {
  it("reports zero warnings for a correctly wired, healthy circuit built through real provider actions", () => {
    const { result } = renderHook(() => useExperimentState(), { wrapper });

    act(() => {
      result.current.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.addConnection({ id: "c2", terminals: ["switch_b", "resistor_a"] });
      result.current.addConnection({ id: "c3", terminals: ["resistor_b", "bulb_a"] });
      result.current.addConnection({ id: "c4", terminals: ["bulb_b", "fuse_a"] });
      result.current.addConnection({ id: "c5", terminals: ["fuse_b", "battery_neg"] });
    });

    const { components, connections } = result.current.state;
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(solution.isCircuitActive).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("flags short_circuit live the instant a direct wire bridges the battery terminals through the real provider", () => {
    const { result } = renderHook(() => useExperimentState(), { wrapper });

    act(() => {
      result.current.addConnection({ id: "c1", terminals: ["battery_pos", "battery_neg"] });
    });

    const { components, connections } = result.current.state;
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(solution.isShortCircuit).toBe(true);
    expect(warnings.some((w) => w.code === "short_circuit" && w.severity === "danger")).toBe(true);
  });

  it("flags fuse_blown once the real updateComponent action marks the fuse blown", () => {
    const { result } = renderHook(() => useExperimentState(), { wrapper });

    act(() => {
      result.current.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.addConnection({ id: "c2", terminals: ["switch_b", "resistor_a"] });
      result.current.addConnection({ id: "c3", terminals: ["resistor_b", "bulb_a"] });
      result.current.addConnection({ id: "c4", terminals: ["bulb_b", "fuse_a"] });
      result.current.addConnection({ id: "c5", terminals: ["fuse_b", "battery_neg"] });
      result.current.updateComponent("fuse", { isBlown: true });
    });

    const { components, connections } = result.current.state;
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(solution.isCircuitActive).toBe(false);
    expect(warnings.some((w) => w.code === "fuse_blown" && w.severity === "danger")).toBe(true);
  });

  it("flags overload once the real handleVoltageChange-equivalent action pushes current near the fuse rating", () => {
    const { result } = renderHook(() => useExperimentState(), { wrapper });

    act(() => {
      result.current.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.addConnection({ id: "c2", terminals: ["switch_b", "resistor_a"] });
      result.current.addConnection({ id: "c3", terminals: ["resistor_b", "bulb_a"] });
      result.current.addConnection({ id: "c4", terminals: ["bulb_b", "fuse_a"] });
      result.current.addConnection({ id: "c5", terminals: ["fuse_b", "battery_neg"] });
      result.current.updateComponent("fuse", { ratedCurrentA: 2.3 }); // 12V/6Ω=2A -> 2/2.3≈0.87, in the warning band
    });

    const { components, connections } = result.current.state;
    const solution = solveCircuit(components, connections);
    const warnings = checkElectricalSafety({ components, connections, solution });

    expect(solution.fuseToBlowId).toBeNull();
    expect(warnings.some((w) => w.code === "overload" && w.severity === "warning")).toBe(true);
  });

  it("removing the offending connection (real removeConnection action) clears the unsafe_connection warning", () => {
    const { result } = renderHook(() => useExperimentState(), { wrapper });

    act(() => {
      result.current.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.addConnection({ id: "c2", terminals: ["switch_b", "bulb_a"] });
      result.current.addConnection({ id: "c3", terminals: ["bulb_b", "battery_neg"] }); // bypasses the fuse
    });
    {
      const { components, connections } = result.current.state;
      const solution = solveCircuit(components, connections);
      expect(checkElectricalSafety({ components, connections, solution }).some((w) => w.code === "unsafe_connection")).toBe(true);
    }

    act(() => {
      result.current.removeConnection("c3");
      result.current.addConnection({ id: "c4", terminals: ["bulb_b", "fuse_a"] });
      result.current.addConnection({ id: "c5", terminals: ["fuse_b", "battery_neg"] });
    });
    {
      const { components, connections } = result.current.state;
      const solution = solveCircuit(components, connections);
      expect(checkElectricalSafety({ components, connections, solution }).some((w) => w.code === "unsafe_connection")).toBe(false);
    }
  });
});
