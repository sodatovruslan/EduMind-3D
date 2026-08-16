// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ExperimentStateProvider, useExperimentState } from "./ExperimentStateProvider";
import { solveCircuit, type CircuitComponent } from "@/lib/circuit-engine";
import { checkElectricalSafety } from "@/lib/electricity-safety";

/**
 * Stage S9.4 — Safety System WORKFLOW tests. Distinct from the plain unit
 * tests (electricity-safety.test.ts, single-snapshot pure function calls)
 * and the plain integration tests (ElectricitySafety... single-state
 * checks through the real provider) — these walk a REALISTIC MULTI-STEP
 * user session end to end through the real ExperimentStateProvider + real
 * solveCircuit() + real checkElectricalSafety(), asserting that warnings
 * correctly appear/escalate/clear across a sequence of actions, exactly
 * the same way a student's session would progress. No mocks anywhere in
 * the pipeline.
 */

afterEach(cleanup);

const INITIAL_COMPONENTS: CircuitComponent[] = [
  { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
  { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
  { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
  { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: 18 },
  { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
  { id: "fuse", kind: "fuse", terminals: ["fuse_a", "fuse_b"], ratedCurrentA: 3, isBlown: false },
  { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
];

function wrapper({ children }: { children: ReactNode }) {
  return <ExperimentStateProvider initialComponents={INITIAL_COMPONENTS}>{children}</ExperimentStateProvider>;
}

function safetyOf(components: CircuitComponent[], connections: { id: string; terminals: [string, string] }[]) {
  const solution = solveCircuit(components, connections);
  return { solution, warnings: checkElectricalSafety({ components, connections, solution }) };
}

describe("Safety workflow — voltage ramp-up: safe -> overload warning -> fuse blows -> reset recovers", () => {
  it("walks the full lifecycle a student would actually see", () => {
    const { result } = renderHook(() => useExperimentState(), { wrapper });

    // Step 1: wire a complete, healthy series loop through the fuse.
    act(() => {
      result.current.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.addConnection({ id: "c2", terminals: ["switch_b", "resistor_a"] });
      result.current.addConnection({ id: "c3", terminals: ["resistor_b", "bulb_a"] });
      result.current.addConnection({ id: "c4", terminals: ["bulb_b", "fuse_a"] });
      result.current.addConnection({ id: "c5", terminals: ["fuse_b", "battery_neg"] });
    });
    {
      const { warnings, solution } = safetyOf(result.current.state.components, result.current.state.connections);
      expect(solution.isCircuitActive).toBe(true);
      expect(solution.currentA).toBeCloseTo(2, 3); // 12V / 6Ω
      expect(warnings).toEqual([]); // step 1: fully safe, zero warnings
    }

    // Step 2: student raises the voltage — current climbs toward the fuse's
    // 3A rating (still under it) -> overload WARNING appears, fuse not blown.
    act(() => {
      result.current.updateComponent("battery", { voltageV: 16 }); // 16/6 ≈ 2.67A -> 2.67/3 ≈ 0.89, in the 0.8-1.0 warning band
    });
    {
      const { warnings, solution } = safetyOf(result.current.state.components, result.current.state.connections);
      expect(solution.fuseToBlowId).toBeNull();
      expect(warnings.some((w) => w.code === "overload" && w.severity === "warning")).toBe(true);
      expect(warnings.some((w) => w.code === "fuse_blown")).toBe(false);
    }

    // Step 3: student ignores the warning and raises voltage further —
    // current now exceeds the fuse rating. The solver flags fuseToBlowId;
    // in the real scene a useEffect applies isBlown:true (mirrored here via
    // the same production updateComponent action) and the danger warning
    // replaces the softer overload one.
    act(() => {
      result.current.updateComponent("battery", { voltageV: 24 }); // 24/6 = 4A > 3A rating
    });
    {
      const { solution } = safetyOf(result.current.state.components, result.current.state.connections);
      expect(solution.fuseToBlowId).toBe("fuse");
    }
    act(() => {
      result.current.updateComponent("fuse", { isBlown: true }); // exactly what CircuitScene's real effect does
    });
    {
      const { warnings, solution } = safetyOf(result.current.state.components, result.current.state.connections);
      expect(solution.isCircuitActive).toBe(false); // blown fuse breaks the loop, matching circuit-engine.test.ts's own fuse semantics
      expect(warnings.some((w) => w.code === "fuse_blown" && w.severity === "danger")).toBe(true);
      expect(warnings.some((w) => w.code === "overload")).toBe(false); // superseded, not double-reported
    }

    // Step 4: student presses "Сбросить" — real resetExperiment action,
    // same one ElectricityResetButton calls. Everything must come back clean.
    act(() => {
      result.current.resetExperiment(INITIAL_COMPONENTS);
    });
    {
      const { warnings, solution } = safetyOf(result.current.state.components, result.current.state.connections);
      expect(result.current.state.connections).toEqual([]);
      expect(solution.isClosedLoop).toBe(false);
      expect(warnings).toEqual([]);
    }
  });
});

describe("Safety workflow — measurement mistakes made and corrected live", () => {
  it("ammeter wired in parallel by mistake, then corrected to series, warning clears without remounting", () => {
    const { result } = renderHook(() => useExperimentState(), { wrapper });

    act(() => {
      result.current.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.addConnection({ id: "c2", terminals: ["switch_b", "resistor_a"] });
      result.current.addConnection({ id: "c3", terminals: ["resistor_b", "bulb_a"] });
      result.current.addConnection({ id: "c4", terminals: ["bulb_b", "battery_neg"] });
      // mistake: ammeter wired straight across the resistor (parallel/shunt)
      result.current.addConnection({ id: "c5", terminals: ["ammeter_a", "resistor_a"] });
      result.current.addConnection({ id: "c6", terminals: ["ammeter_b", "resistor_b"] });
    });
    {
      const { warnings } = safetyOf(result.current.state.components, result.current.state.connections);
      expect(warnings.some((w) => w.code === "unsafe_measurement" && w.severity === "danger")).toBe(true);
    }

    // student notices and fixes it: remove the shunt wires, splice the
    // ammeter into the main loop in series instead
    act(() => {
      result.current.removeConnection("c3");
      result.current.removeConnection("c5");
      result.current.removeConnection("c6");
      result.current.addConnection({ id: "c7", terminals: ["resistor_b", "ammeter_a"] });
      result.current.addConnection({ id: "c8", terminals: ["ammeter_b", "bulb_a"] });
    });
    {
      const { warnings, solution } = safetyOf(result.current.state.components, result.current.state.connections);
      expect(warnings.some((w) => w.code === "unsafe_measurement")).toBe(false);
      expect(solution.readings.ammeter.currentA).toBeCloseTo(solution.currentA, 3);
    }
  });
});

describe("Safety workflow — unsafe_connection: fuse bypassed, then wired back into the loop", () => {
  it("detects the bypass live, then clears once the fuse is genuinely back in the conducting path", () => {
    const { result } = renderHook(() => useExperimentState(), { wrapper });

    // circuit wired to bypass the fuse entirely (fuse dangling, isolated)
    act(() => {
      result.current.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.addConnection({ id: "c2", terminals: ["switch_b", "bulb_a"] });
      result.current.addConnection({ id: "c3", terminals: ["bulb_b", "battery_neg"] });
    });
    {
      const { warnings, solution } = safetyOf(result.current.state.components, result.current.state.connections);
      expect(solution.isCircuitActive).toBe(true);
      expect(warnings.some((w) => w.code === "unsafe_connection" && w.severity === "danger")).toBe(true);
    }

    // student reroutes the circuit through the fuse
    act(() => {
      result.current.removeConnection("c3");
      result.current.addConnection({ id: "c4", terminals: ["bulb_b", "fuse_a"] });
      result.current.addConnection({ id: "c5", terminals: ["fuse_b", "battery_neg"] });
    });
    {
      const { warnings, solution } = safetyOf(result.current.state.components, result.current.state.connections);
      expect(solution.isCircuitActive).toBe(true);
      expect(warnings.some((w) => w.code === "unsafe_connection")).toBe(false);
    }
  });
});
