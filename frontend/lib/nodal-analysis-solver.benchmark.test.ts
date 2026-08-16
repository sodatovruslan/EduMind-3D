import { describe, expect, it } from "vitest";
import { solveCircuit, type CircuitComponent, type Connection } from "./circuit-engine";
import { solveCircuitNodal } from "./nodal-analysis-solver";

/**
 * Stage S9.1 — real performance benchmark for Option B (Nodal Analysis),
 * measured against the production DFS solver on topologies both can solve
 * (series chains), plus nodal-only numbers on topologies the DFS solver
 * cannot represent at all (mixed/parallel). Real wall-clock timings via
 * performance.now() — printed to stdout and copied verbatim into
 * solver-spike-report.md, not estimated.
 *
 * "Small"/"medium"/"10-node"/"20-node" match the checkpoint's requested
 * sizes. The production usage pattern is "solve once per changed frame"
 * (ElectricityLabScene re-solves on component/connection change, not on
 * every render), so the completion criterion "<5ms per frame" (see
 * electricity_stage_s9_plan.md §3) is checked against a SINGLE solve's
 * cost, with a repeated-execution run added to see amortized/steady-state
 * behavior (JIT warmup) too.
 */

function seriesChain(resistorCount: number, resistanceOhm = 4, voltageV = 12) {
  const components: CircuitComponent[] = [{ id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV }];
  const connections: Connection[] = [];
  let prevTerminal = "bat_pos";
  for (let i = 0; i < resistorCount; i++) {
    const aTerm = `r${i}_a`;
    const bTerm = `r${i}_b`;
    components.push({ id: `r${i}`, kind: "resistor", terminals: [aTerm, bTerm], resistanceOhm });
    connections.push({ id: `c${i}`, terminals: [prevTerminal, aTerm] });
    prevTerminal = bTerm;
  }
  connections.push({ id: "c_close", terminals: [prevTerminal, "bat_neg"] });
  return { components, connections };
}

// n parallel branches, each a single resistor, straight off both battery terminals
function parallelFanOut(branchCount: number, resistanceOhm = 10, voltageV = 12) {
  const components: CircuitComponent[] = [{ id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV }];
  const connections: Connection[] = [];
  for (let i = 0; i < branchCount; i++) {
    components.push({ id: `r${i}`, kind: "resistor", terminals: [`a${i}`, `b${i}`], resistanceOhm: resistanceOhm + i });
    connections.push({ id: `ca${i}`, terminals: ["bat_pos", `a${i}`] });
    connections.push({ id: `cb${i}`, terminals: [`b${i}`, "bat_neg"] });
  }
  return { components, connections };
}

// realistic "medium mixed" circuit: 3 series resistors, then a 3-branch
// parallel group, then 2 more series resistors back to the battery —
// exercises both series and parallel handling in one circuit, the exact
// shape the production DFS solver cannot represent (mixed topology).
function mediumMixedCircuit(voltageV = 12) {
  const components: CircuitComponent[] = [
    { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV },
    { id: "r1", kind: "resistor", terminals: ["r1a", "r1b"], resistanceOhm: 2 },
    { id: "r2", kind: "resistor", terminals: ["r2a", "r2b"], resistanceOhm: 3 },
    { id: "r3", kind: "resistor", terminals: ["r3a", "r3b"], resistanceOhm: 1 },
    { id: "p1", kind: "resistor", terminals: ["pa1", "pb"], resistanceOhm: 6 },
    { id: "p2", kind: "resistor", terminals: ["pa2", "pb"], resistanceOhm: 12 },
    { id: "p3", kind: "resistor", terminals: ["pa3", "pb"], resistanceOhm: 4 },
    { id: "r4", kind: "resistor", terminals: ["r4a", "r4b"], resistanceOhm: 2 },
    { id: "sw1", kind: "switch", terminals: ["swa", "swb"], isClosed: true },
  ];
  const connections: Connection[] = [
    { id: "c1", terminals: ["bat_pos", "r1a"] },
    { id: "c2", terminals: ["r1b", "r2a"] },
    { id: "c3", terminals: ["r2b", "r3a"] },
    { id: "c4", terminals: ["r3b", "pa1"] },
    { id: "c5", terminals: ["r3b", "pa2"] },
    { id: "c6", terminals: ["r3b", "pa3"] },
    { id: "c7", terminals: ["pb", "r4a"] },
    { id: "c8", terminals: ["r4b", "swa"] },
    { id: "c9", terminals: ["swb", "bat_neg"] },
  ];
  return { components, connections };
}

function timeIt(fn: () => void, iterations: number): { totalMs: number; avgMs: number } {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const totalMs = performance.now() - start;
  return { totalMs, avgMs: totalMs / iterations };
}

describe("Stage S9.1 — real performance benchmark (Option B vs production DFS)", () => {
  it("small circuit (5 components, series — both solvers support this)", () => {
    const { components, connections } = seriesChain(4);
    const dfs = timeIt(() => solveCircuit(components, connections), 200);
    const nodal = timeIt(() => solveCircuitNodal(components, connections), 200);
    console.log(`[BENCH small/series, 4 resistors] DFS avg=${dfs.avgMs.toFixed(4)}ms  Nodal avg=${nodal.avgMs.toFixed(4)}ms`);
    expect(solveCircuitNodal(components, connections).isCircuitActive).toBe(true);
  });

  it("medium mixed circuit (9 components, series+parallel — DFS cannot represent this)", () => {
    const { components, connections } = mediumMixedCircuit();
    const nodal = timeIt(() => solveCircuitNodal(components, connections), 200);
    console.log(`[BENCH medium/mixed, 9 components] Nodal avg=${nodal.avgMs.toFixed(4)}ms (no DFS comparison — topology unsupported by DFS)`);
    expect(solveCircuitNodal(components, connections).isCircuitActive).toBe(true);
  });

  it("10-node series circuit (both solvers support this)", () => {
    const { components, connections } = seriesChain(9); // 9 resistors -> 10 distinct nodes
    const dfs = timeIt(() => solveCircuit(components, connections), 200);
    const nodal = timeIt(() => solveCircuitNodal(components, connections), 200);
    console.log(`[BENCH 10-node/series, 9 resistors] DFS avg=${dfs.avgMs.toFixed(4)}ms  Nodal avg=${nodal.avgMs.toFixed(4)}ms`);
    expect(solveCircuitNodal(components, connections).currentA).toBeCloseTo(solveCircuit(components, connections).currentA, 5);
  });

  it("10-node parallel fan-out (DFS cannot represent this)", () => {
    const { components, connections } = parallelFanOut(9); // 9 branches -> 10 distinct nodes (2 rails + per-branch merge)
    const nodal = timeIt(() => solveCircuitNodal(components, connections), 200);
    console.log(`[BENCH 10-node/parallel, 9 branches] Nodal avg=${nodal.avgMs.toFixed(4)}ms (no DFS comparison — topology unsupported by DFS)`);
    expect(solveCircuitNodal(components, connections).isCircuitActive).toBe(true);
  });

  it("20-node series circuit (both solvers support this)", () => {
    const { components, connections } = seriesChain(19); // 19 resistors -> 20 distinct nodes
    const dfs = timeIt(() => solveCircuit(components, connections), 200);
    const nodal = timeIt(() => solveCircuitNodal(components, connections), 200);
    console.log(`[BENCH 20-node/series, 19 resistors] DFS avg=${dfs.avgMs.toFixed(4)}ms  Nodal avg=${nodal.avgMs.toFixed(4)}ms`);
    expect(solveCircuitNodal(components, connections).currentA).toBeCloseTo(solveCircuit(components, connections).currentA, 5);
  });

  it("20-node parallel fan-out (DFS cannot represent this)", () => {
    const { components, connections } = parallelFanOut(19);
    const nodal = timeIt(() => solveCircuitNodal(components, connections), 200);
    console.log(`[BENCH 20-node/parallel, 19 branches] Nodal avg=${nodal.avgMs.toFixed(4)}ms (no DFS comparison — topology unsupported by DFS)`);
    expect(solveCircuitNodal(components, connections).isCircuitActive).toBe(true);
  });

  it("repeated-execution benchmark: 2000 consecutive solves of the medium mixed circuit (steady-state/JIT-warm behavior)", () => {
    const { components, connections } = mediumMixedCircuit();
    // one throwaway solve first so JIT warmup doesn't skew the steady-state number
    solveCircuitNodal(components, connections);
    const nodal = timeIt(() => solveCircuitNodal(components, connections), 2000);
    console.log(
      `[BENCH repeated x2000, medium mixed] Nodal total=${nodal.totalMs.toFixed(2)}ms avg=${nodal.avgMs.toFixed(5)}ms/solve`
    );
    expect(nodal.avgMs).toBeLessThan(5); // production acceptance criterion: <5ms per frame (§3 of the plan)
  });

  it("repeated-execution benchmark: 2000 consecutive solves of the 20-node series circuit", () => {
    const { components, connections } = seriesChain(19);
    solveCircuitNodal(components, connections);
    const nodal = timeIt(() => solveCircuitNodal(components, connections), 2000);
    console.log(`[BENCH repeated x2000, 20-node series] Nodal total=${nodal.totalMs.toFixed(2)}ms avg=${nodal.avgMs.toFixed(5)}ms/solve`);
    expect(nodal.avgMs).toBeLessThan(5);
  });
});
