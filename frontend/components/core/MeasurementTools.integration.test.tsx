// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ExperimentStateProvider, useExperimentState } from "./ExperimentStateProvider";
import { solveCircuit, type CircuitComponent } from "@/lib/circuit-engine";
import { checkAmmeterPlacement, checkVoltmeterPlacement, ammeterPlacementMessage, voltmeterPlacementMessage } from "@/lib/measurement-validation";

/**
 * Stage S9.3 — Measurement Tools integration test. Exercises the REAL
 * pipeline the scene actually runs: ExperimentStateProvider (the same
 * reducer ElectricityLabScene.tsx uses for wiring) -> production
 * solveCircuit() (Nodal Analysis, Stage S9.2) -> placement validation. No
 * mocks of the solver or the state container — this is what would break if
 * the wiring between them regressed, even though the individual pieces
 * (measurement-validation.test.ts, circuit-engine.test.ts) stay green.
 */

afterEach(cleanup);

const INITIAL_COMPONENTS: CircuitComponent[] = [
  { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
  { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
  { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 4, ratedPowerW: 18 },
  { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
  { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
];

function wrapper({ children }: { children: ReactNode }) {
  return <ExperimentStateProvider initialComponents={INITIAL_COMPONENTS}>{children}</ExperimentStateProvider>;
}

describe("Measurement Tools — real wiring through ExperimentStateProvider + production solver", () => {
  it("ammeter shows a real, correct branch current once wired in series through the actual provider", () => {
    const { result } = renderHook(() => useExperimentState(), { wrapper });

    act(() => {
      result.current.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.addConnection({ id: "c2", terminals: ["switch_b", "ammeter_a"] });
      result.current.addConnection({ id: "c3", terminals: ["ammeter_b", "bulb_a"] });
      result.current.addConnection({ id: "c4", terminals: ["bulb_b", "battery_neg"] });
    });

    const { components, connections } = result.current.state;
    const solution = solveCircuit(components, connections);
    const check = checkAmmeterPlacement(components, connections, solution);

    expect(check.status).toBe("valid");
    expect(ammeterPlacementMessage(check)).toBeNull();
    expect(solution.readings.ammeter.currentA).toBeCloseTo(12 / 4, 3); // 12V / 4Ω bulb
  });

  it("live-updates to a warning the instant the ammeter gets wired in parallel through the actual provider (no page reload, no re-mount)", () => {
    const { result } = renderHook(() => useExperimentState(), { wrapper });

    // start correctly wired in series
    act(() => {
      result.current.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.addConnection({ id: "c2", terminals: ["switch_b", "ammeter_a"] });
      result.current.addConnection({ id: "c3", terminals: ["ammeter_b", "bulb_a"] });
      result.current.addConnection({ id: "c4", terminals: ["bulb_b", "battery_neg"] });
    });
    {
      const { components, connections } = result.current.state;
      const solution = solveCircuit(components, connections);
      expect(checkAmmeterPlacement(components, connections, solution).status).toBe("valid");
    }

    // student now ALSO wires the ammeter directly across the bulb's own
    // node pair (a second path) -> becomes parallel/invalid live, while wiring
    act(() => {
      result.current.addConnection({ id: "c5", terminals: ["ammeter_a", "bulb_a"] });
      result.current.addConnection({ id: "c6", terminals: ["ammeter_b", "bulb_b"] });
    });
    {
      const { components, connections } = result.current.state;
      const solution = solveCircuit(components, connections);
      const check = checkAmmeterPlacement(components, connections, solution);
      expect(check.status).toBe("parallel_invalid");
      expect(ammeterPlacementMessage(check)).toContain("параллельно");
    }
  });

  it("voltmeter shows the real node-potential difference once wired in parallel with the bulb through the actual provider", () => {
    const { result } = renderHook(() => useExperimentState(), { wrapper });

    act(() => {
      result.current.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.addConnection({ id: "c2", terminals: ["switch_b", "bulb_a"] });
      result.current.addConnection({ id: "c3", terminals: ["bulb_b", "battery_neg"] });
      result.current.addConnection({ id: "c4", terminals: ["voltmeter_a", "bulb_a"] });
      result.current.addConnection({ id: "c5", terminals: ["voltmeter_b", "bulb_b"] });
    });

    const { components, connections } = result.current.state;
    const solution = solveCircuit(components, connections);
    const check = checkVoltmeterPlacement(components, connections, solution);

    expect(check.status).toBe("valid");
    expect(voltmeterPlacementMessage(check)).toBeNull();
    expect(solution.readings.voltmeter.voltageV).toBeCloseTo(solution.readings.bulb.voltageV, 3);
  });

  it("detects a voltmeter spliced in series through the actual provider and explains the real consequence (circuit blocked)", () => {
    const { result } = renderHook(() => useExperimentState(), { wrapper });

    act(() => {
      result.current.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.addConnection({ id: "c2", terminals: ["switch_b", "voltmeter_a"] });
      result.current.addConnection({ id: "c3", terminals: ["voltmeter_b", "bulb_a"] });
      result.current.addConnection({ id: "c4", terminals: ["bulb_b", "battery_neg"] });
    });

    const { components, connections } = result.current.state;
    const solution = solveCircuit(components, connections);
    const check = checkVoltmeterPlacement(components, connections, solution);

    expect(check.status).toBe("series_invalid");
    expect(voltmeterPlacementMessage(check)).toContain("последовательно");
    expect(solution.isCircuitActive).toBe(false); // the real, honest solver consequence, not a scripted UI message
  });

  it("removing the offending wire (via the real removeConnection action) recovers to a valid ammeter reading", () => {
    const { result } = renderHook(() => useExperimentState(), { wrapper });

    act(() => {
      result.current.addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
      result.current.addConnection({ id: "c2", terminals: ["switch_b", "bulb_a"] });
      result.current.addConnection({ id: "c3", terminals: ["bulb_b", "battery_neg"] });
      result.current.addConnection({ id: "c4", terminals: ["ammeter_a", "switch_b"] });
      result.current.addConnection({ id: "c5", terminals: ["ammeter_b", "battery_neg"] });
    });
    {
      const { components, connections } = result.current.state;
      const solution = solveCircuit(components, connections);
      expect(checkAmmeterPlacement(components, connections, solution).status).toBe("parallel_invalid");
    }

    act(() => {
      result.current.removeConnection("c2");
      result.current.removeConnection("c4");
      result.current.addConnection({ id: "c6", terminals: ["switch_b", "ammeter_a"] });
      result.current.addConnection({ id: "c7", terminals: ["ammeter_b", "bulb_a"] });
    });
    {
      const { components, connections } = result.current.state;
      const solution = solveCircuit(components, connections);
      const check = checkAmmeterPlacement(components, connections, solution);
      expect(check.status).toBe("valid");
      expect(solution.readings.ammeter.currentA).toBeCloseTo(solution.currentA, 3);
    }
  });
});
