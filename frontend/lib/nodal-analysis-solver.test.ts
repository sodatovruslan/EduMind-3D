import { describe, expect, it } from "vitest";
import { solveCircuit, type CircuitComponent, type Connection } from "./circuit-engine";
import { solveCircuitNodal } from "./nodal-analysis-solver";

/**
 * Stage S9 / Option B spike verification.
 *
 * Part 1 mirrors circuit-engine.test.ts's exact fixtures and asserts the
 * nodal solver agrees with the production DFS solver on every one of
 * them — real regression/parity proof, not a claim.
 *
 * Part 2 exercises circuits the DFS solver CANNOT represent at all
 * (parallel/mixed topologies) against hand-computed textbook answers.
 */

// same fixture as circuit-engine.test.ts, kept in sync deliberately
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

describe("solveCircuitNodal — parity with production DFS solver (circuit-engine.ts)", () => {
  it("matches the DFS solver on a closed series loop", () => {
    const { components, connections } = seriesCircuit();
    const dfs = solveCircuit(components, connections);
    const nodal = solveCircuitNodal(components, connections);

    expect(nodal.isClosedLoop).toBe(dfs.isClosedLoop);
    expect(nodal.isCircuitActive).toBe(dfs.isCircuitActive);
    expect(nodal.currentA).toBeCloseTo(dfs.currentA, 5);
    expect(nodal.readings.r1.voltageV).toBeCloseTo(dfs.readings.r1.voltageV, 4);
    expect(nodal.readings.bulb1.voltageV).toBeCloseTo(dfs.readings.bulb1.voltageV, 4);
    expect(nodal.readings.bulb1.powerW).toBeCloseTo(dfs.readings.bulb1.powerW, 3);
  });

  it("matches the DFS solver when the switch is open (no current)", () => {
    const { components, connections } = seriesCircuit({ switchClosed: false });
    const dfs = solveCircuit(components, connections);
    const nodal = solveCircuitNodal(components, connections);

    expect(nodal.isClosedLoop).toBe(dfs.isClosedLoop);
    expect(nodal.isCircuitActive).toBe(dfs.isCircuitActive);
    expect(nodal.currentA).toBeCloseTo(0, 5);
    expect(nodal.readings.r1.currentA).toBeCloseTo(0, 5);
  });

  it("matches the DFS solver's short-circuit detection", () => {
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
      { id: "sw1", kind: "switch", terminals: ["sw_a", "sw_b"], isClosed: true },
    ];
    const connections: Connection[] = [
      { id: "c1", terminals: ["bat_pos", "sw_a"] },
      { id: "c2", terminals: ["sw_b", "bat_neg"] },
    ];
    const dfs = solveCircuit(components, connections);
    const nodal = solveCircuitNodal(components, connections);

    expect(nodal.isCircuitActive).toBe(dfs.isCircuitActive);
    expect(nodal.isShortCircuit).toBe(dfs.isShortCircuit);
    expect(nodal.currentA).toBeGreaterThan(1000);
  });

  it("matches the DFS solver's fuse-blow threshold detection", () => {
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
    const dfs = solveCircuit(components, connections);
    const nodal = solveCircuitNodal(components, connections);

    expect(nodal.currentA).toBeCloseTo(dfs.currentA, 5);
    expect(nodal.fuseToBlowId).toBe(dfs.fuseToBlowId);

    const blownComponents = components.map((c) => (c.id === "fuse1" ? { ...c, isBlown: true } : c));
    const dfsAfter = solveCircuit(blownComponents, connections);
    const nodalAfter = solveCircuitNodal(blownComponents, connections);
    expect(nodalAfter.isCircuitActive).toBe(dfsAfter.isCircuitActive);
    expect(nodalAfter.currentA).toBeCloseTo(0, 5);
  });

  it("matches the DFS solver's voltmeter reading (parallel, ideal, zero current)", () => {
    const { components, connections } = seriesCircuit();
    const withVoltmeter: CircuitComponent[] = [...components, { id: "volt1", kind: "voltmeter", terminals: ["r1_a", "r1_b"] }];
    const dfs = solveCircuit(withVoltmeter, connections);
    const nodal = solveCircuitNodal(withVoltmeter, connections);

    expect(nodal.readings.volt1.voltageV).toBeCloseTo(dfs.readings.volt1.voltageV, 4);
    expect(nodal.readings.volt1.currentA).toBe(0);
  });

  it("matches the DFS solver reading full source voltage across an open switch", () => {
    const { components, connections } = seriesCircuit({ switchClosed: false });
    const withVoltmeter: CircuitComponent[] = [...components, { id: "volt1", kind: "voltmeter", terminals: ["sw_a", "sw_b"] }];
    const dfs = solveCircuit(withVoltmeter, connections);
    const nodal = solveCircuitNodal(withVoltmeter, connections);

    expect(nodal.readings.volt1.voltageV).toBeCloseTo(dfs.readings.volt1.voltageV, 2);
  });

  it("matches the DFS solver when there is no battery", () => {
    const components: CircuitComponent[] = [{ id: "r1", kind: "resistor", terminals: ["a", "b"], resistanceOhm: 4 }];
    const dfs = solveCircuit(components, []);
    const nodal = solveCircuitNodal(components, []);
    expect(nodal.isClosedLoop).toBe(dfs.isClosedLoop);
    expect(nodal.isCircuitActive).toBe(dfs.isCircuitActive);
  });

  it("matches the DFS solver when the loop never closes", () => {
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
      { id: "r1", kind: "resistor", terminals: ["r1_a", "r1_b"], resistanceOhm: 4 },
    ];
    const connections: Connection[] = [{ id: "c1", terminals: ["bat_pos", "r1_a"] }];
    const dfs = solveCircuit(components, connections);
    const nodal = solveCircuitNodal(components, connections);
    expect(nodal.isClosedLoop).toBe(dfs.isClosedLoop);
    expect(nodal.currentA).toBe(0);
  });
});

describe("solveCircuitNodal — real capability the DFS solver does not have (parallel/mixed topologies)", () => {
  it("solves two resistors in pure parallel against the textbook R_parallel formula", () => {
    // 12V battery across two resistors (6Ω, 3Ω) wired in parallel between
    // the same two nodes. R_parallel = (6*3)/(6+3) = 2Ω -> I_total = 6A.
    // I_r1 = 12/6 = 2A, I_r2 = 12/3 = 4A (current divider, sums to 6A).
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
      { id: "r1", kind: "resistor", terminals: ["n_pos", "n_neg"], resistanceOhm: 6 },
      { id: "r2", kind: "resistor", terminals: ["n_pos2", "n_neg2"], resistanceOhm: 3 },
    ];
    const connections: Connection[] = [
      { id: "c1", terminals: ["bat_pos", "n_pos"] },
      { id: "c2", terminals: ["bat_pos", "n_pos2"] },
      { id: "c3", terminals: ["n_neg", "bat_neg"] },
      { id: "c4", terminals: ["n_neg2", "bat_neg"] },
    ];
    const nodal = solveCircuitNodal(components, connections);

    expect(nodal.isCircuitActive).toBe(true);
    expect(nodal.currentA).toBeCloseTo(6, 3);
    expect(nodal.readings.r1.currentA).toBeCloseTo(2, 3);
    expect(nodal.readings.r2.currentA).toBeCloseTo(4, 3);
    expect(nodal.readings.r1.voltageV).toBeCloseTo(12, 3);
    expect(nodal.readings.r2.voltageV).toBeCloseTo(12, 3);
  });

  it("solves a mixed series-parallel network against a hand-computed answer", () => {
    // battery(12V) -> r1(2Ω) in series -> [r2(6Ω) || r3(3Ω)] -> back to battery.
    // R_parallel(r2,r3) = 2Ω. R_total = r1 + R_parallel = 4Ω. I_total = 3A.
    // V across the parallel pair = I_total * R_parallel = 6V.
    // I_r2 = 6/6 = 1A, I_r3 = 6/3 = 2A (sums back to 3A).
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
      { id: "r1", kind: "resistor", terminals: ["r1_a", "r1_b"], resistanceOhm: 2 },
      { id: "r2", kind: "resistor", terminals: ["mid", "end"], resistanceOhm: 6 },
      { id: "r3", kind: "resistor", terminals: ["mid2", "end2"], resistanceOhm: 3 },
    ];
    const connections: Connection[] = [
      { id: "c1", terminals: ["bat_pos", "r1_a"] },
      { id: "c2", terminals: ["r1_b", "mid"] },
      { id: "c3", terminals: ["r1_b", "mid2"] },
      { id: "c4", terminals: ["end", "bat_neg"] },
      { id: "c5", terminals: ["end2", "bat_neg"] },
    ];
    const nodal = solveCircuitNodal(components, connections);

    expect(nodal.isCircuitActive).toBe(true);
    expect(nodal.currentA).toBeCloseTo(3, 3);
    expect(nodal.readings.r1.voltageV).toBeCloseTo(6, 3); // I_total * r1 = 3*2
    expect(nodal.readings.r2.currentA).toBeCloseTo(1, 3);
    expect(nodal.readings.r3.currentA).toBeCloseTo(2, 3);
  });

  it("solves a three-branch parallel network", () => {
    // 12V across three parallel resistors: 12Ω, 6Ω, 4Ω.
    // 1/R = 1/12 + 1/6 + 1/4 = 1/2 -> R=2Ω -> I_total = 6A.
    // I1=1A, I2=2A, I3=3A (sums to 6A).
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
      { id: "r1", kind: "resistor", terminals: ["a1", "b1"], resistanceOhm: 12 },
      { id: "r2", kind: "resistor", terminals: ["a2", "b2"], resistanceOhm: 6 },
      { id: "r3", kind: "resistor", terminals: ["a3", "b3"], resistanceOhm: 4 },
    ];
    const connections: Connection[] = [
      { id: "c1", terminals: ["bat_pos", "a1"] },
      { id: "c2", terminals: ["bat_pos", "a2"] },
      { id: "c3", terminals: ["bat_pos", "a3"] },
      { id: "c4", terminals: ["b1", "bat_neg"] },
      { id: "c5", terminals: ["b2", "bat_neg"] },
      { id: "c6", terminals: ["b3", "bat_neg"] },
    ];
    const nodal = solveCircuitNodal(components, connections);

    expect(nodal.currentA).toBeCloseTo(6, 2);
    expect(nodal.readings.r1.currentA).toBeCloseTo(1, 2);
    expect(nodal.readings.r2.currentA).toBeCloseTo(2, 2);
    expect(nodal.readings.r3.currentA).toBeCloseTo(3, 2);
  });

  it("solves a bridge-like network the single-loop DFS solver structurally cannot represent", () => {
    // Two parallel branches, each with two resistors in series, sharing
    // only the battery nodes — DFS finds ONE simple path and ignores the
    // second branch entirely; nodal analysis accounts for both.
    // Branch A: r1(2Ω) + r2(2Ω) = 4Ω. Branch B: r3(4Ω) + r4(4Ω) = 8Ω.
    // R_parallel(4,8) = 8/3Ω. I_total = 12 / (8/3) = 4.5A.
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
      { id: "r1", kind: "resistor", terminals: ["a1", "m1"], resistanceOhm: 2 },
      { id: "r2", kind: "resistor", terminals: ["m1", "b1"], resistanceOhm: 2 },
      { id: "r3", kind: "resistor", terminals: ["a2", "m2"], resistanceOhm: 4 },
      { id: "r4", kind: "resistor", terminals: ["m2", "b2"], resistanceOhm: 4 },
    ];
    const connections: Connection[] = [
      { id: "c1", terminals: ["bat_pos", "a1"] },
      { id: "c2", terminals: ["bat_pos", "a2"] },
      { id: "c3", terminals: ["b1", "bat_neg"] },
      { id: "c4", terminals: ["b2", "bat_neg"] },
    ];
    const nodal = solveCircuitNodal(components, connections);

    expect(nodal.currentA).toBeCloseTo(4.5, 2);
    expect(nodal.readings.r1.currentA).toBeCloseTo(3, 2); // branch A: 12/4
    expect(nodal.readings.r3.currentA).toBeCloseTo(1.5, 2); // branch B: 12/8
  });

  // Stage S9.9 — the test above is labelled "bridge-like" but the two
  // branches never actually share a bridging element (m1/m2 are never tied
  // together) — it's really just two independent parallel branches, which
  // series/parallel reduction alone can already solve. A GENUINE Wheatstone
  // bridge (a 5th resistor directly connecting the two branches' midpoints)
  // is the textbook case that specifically CANNOT be reduced via series/
  // parallel rules and requires real nodal analysis — added here to close
  // that gap explicitly rather than assume the existing test already covers it.
  it("solves a genuine Wheatstone bridge — BALANCED case: bridge resistor carries zero current", () => {
    // r1/r2 = 100/200 = 0.5 and r3/r4 = 100/200 = 0.5 -> balanced bridge ->
    // V(m1) == V(m2) regardless of the bridge resistor's own value -> the
    // bridge (r5) must carry zero current. A textbook, hand-verifiable fact.
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
      { id: "r1", kind: "resistor", terminals: ["a1", "m1"], resistanceOhm: 100 },
      { id: "r2", kind: "resistor", terminals: ["m1", "b1"], resistanceOhm: 200 },
      { id: "r3", kind: "resistor", terminals: ["a2", "m2"], resistanceOhm: 100 },
      { id: "r4", kind: "resistor", terminals: ["m2", "b2"], resistanceOhm: 200 },
      { id: "r5", kind: "resistor", terminals: ["m1", "m2"], resistanceOhm: 50 }, // the bridge itself
    ];
    const connections: Connection[] = [
      { id: "c1", terminals: ["bat_pos", "a1"] },
      { id: "c2", terminals: ["bat_pos", "a2"] },
      { id: "c3", terminals: ["b1", "bat_neg"] },
      { id: "c4", terminals: ["b2", "bat_neg"] },
    ];
    const nodal = solveCircuitNodal(components, connections);

    expect(nodal.readings.r5.currentA).toBeCloseTo(0, 3);
    // with the bridge inert, each branch behaves as an independent 300Ω
    // series path in parallel with the other -> R_total = 150Ω -> I = 0.08A
    expect(nodal.currentA).toBeCloseTo(0.08, 3);
    expect(nodal.readings.r1.currentA).toBeCloseTo(0.04, 3);
    expect(nodal.readings.r3.currentA).toBeCloseTo(0.04, 3);
  });

  it("solves a genuine Wheatstone bridge — UNBALANCED case: satisfies Kirchhoff's Current Law at every internal node", () => {
    // r1/r2 = 1 and r3/r4 = 3 -> deliberately unbalanced -> the bridge
    // carries real, non-zero current and neither branch can be solved in
    // isolation. Rather than hand-deriving the matrix solution (error-prone
    // to transcribe correctly), this asserts the one thing that MUST hold
    // for any physically correct solution regardless of the exact values:
    // current in equals current out at every node that isn't the source/
    // ground — a genuinely independent check, not circular with how each
    // reading.currentA is itself computed (vDrop/R) inside the solver.
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 9 },
      { id: "r1", kind: "resistor", terminals: ["a1", "m1"], resistanceOhm: 100 },
      { id: "r2", kind: "resistor", terminals: ["m1", "b1"], resistanceOhm: 100 },
      { id: "r3", kind: "resistor", terminals: ["a2", "m2"], resistanceOhm: 300 },
      { id: "r4", kind: "resistor", terminals: ["m2", "b2"], resistanceOhm: 100 },
      { id: "r5", kind: "resistor", terminals: ["m1", "m2"], resistanceOhm: 50 },
    ];
    const connections: Connection[] = [
      { id: "c1", terminals: ["bat_pos", "a1"] },
      { id: "c2", terminals: ["bat_pos", "a2"] },
      { id: "c3", terminals: ["b1", "bat_neg"] },
      { id: "c4", terminals: ["b2", "bat_neg"] },
    ];
    const nodal = solveCircuitNodal(components, connections);

    // the bridge must be doing real work in the unbalanced case (sanity
    // check that this test isn't accidentally balanced too)
    expect(Math.abs(nodal.readings.r5.currentA)).toBeGreaterThan(0.001);

    // KCL at m1: current arriving via r1 (a1->m1, positive by sign
    // convention) must equal current leaving via r2 (m1->b1) plus current
    // leaving via r5 (m1->m2)
    expect(nodal.readings.r1.currentA).toBeCloseTo(nodal.readings.r2.currentA + nodal.readings.r5.currentA, 4);

    // KCL at m2: current arriving via r3 (a2->m2) plus current arriving via
    // r5 (m1->m2) must equal current leaving via r4 (m2->b2)
    expect(nodal.readings.r3.currentA + nodal.readings.r5.currentA).toBeCloseTo(nodal.readings.r4.currentA, 4);

    // overall conservation: total battery current splits between the two
    // branch entry points (a1 via r1, a2 via r3) and nothing else
    expect(nodal.currentA).toBeCloseTo(Math.abs(nodal.readings.r1.currentA + nodal.readings.r3.currentA), 4);
  });
});

describe("solveCircuitNodal — numerical stability stress cases (the roadmap's stated Option B risk)", () => {
  it("stays accurate when an open switch sits directly parallel to a closed conductive path (EPS_R and BIG_R on the same node pair)", () => {
    // A closed switch (~1e-6Ω stand-in) and a resistor+open-switch branch
    // (~1e9Ω stand-in) both bridge the SAME two nodes — the exact
    // adjacent-extreme-conductance situation the roadmap worries about.
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
      { id: "r1", kind: "resistor", terminals: ["bat_pos", "n1"], resistanceOhm: 4 },
      { id: "sw_closed", kind: "switch", terminals: ["n1", "bat_neg"], isClosed: true },
      { id: "sw_open", kind: "switch", terminals: ["n1", "bat_neg"], isClosed: false },
    ];
    const nodal = solveCircuitNodal(components, []);

    // sw_closed effectively shorts n1 to bat_neg (0V); r1 sees the full 12V.
    expect(nodal.currentA).toBeCloseTo(3, 3); // 12/4
    expect(nodal.readings.sw_open.currentA).toBeCloseTo(0, 3);
  });

  it("stays accurate for a wider fan-out (6 parallel branches spanning ohms to kilo-ohms)", () => {
    const branchOhms = [1, 10, 47, 100, 470, 1000];
    const components: CircuitComponent[] = [{ id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 9 }];
    const connections: Connection[] = [];
    branchOhms.forEach((ohm, i) => {
      components.push({ id: `r${i}`, kind: "resistor", terminals: [`a${i}`, `b${i}`], resistanceOhm: ohm });
      connections.push({ id: `ca${i}`, terminals: ["bat_pos", `a${i}`] });
      connections.push({ id: `cb${i}`, terminals: [`b${i}`, "bat_neg"] });
    });
    const nodal = solveCircuitNodal(components, connections);

    const expectedTotalR = 1 / branchOhms.reduce((sum, r) => sum + 1 / r, 0);
    const expectedTotalCurrent = 9 / expectedTotalR;
    expect(nodal.currentA).toBeCloseTo(expectedTotalCurrent, 2);
    branchOhms.forEach((ohm, i) => {
      expect(nodal.readings[`r${i}`].currentA).toBeCloseTo(9 / ohm, 3);
    });
  });
});
