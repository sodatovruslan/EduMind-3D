import { describe, expect, it } from "vitest";
import { solveCircuit, type CircuitComponent, type Connection } from "./circuit-engine";

/**
 * Stage S9.2 — production integration tests.
 *
 * `circuit-engine.test.ts` is deliberately left untouched (that IS the
 * backward-compatibility proof: the original file, unmodified, still
 * passes 10/10 against the new nodal-backed `solveCircuit`).
 *
 * This file proves the NEW capability (parallel/mixed/bridge topologies,
 * correct branch currents, correct node potentials) through the actual
 * PRODUCTION `solveCircuit` entry point — not through the isolated
 * `solveCircuitNodal` spike function directly. If `circuit-engine.ts` ever
 * stops delegating to the nodal solver (e.g. a future re-integration), these
 * tests catch the regression at the production API boundary.
 */

describe("solveCircuit (production) — Stage S9.2 new capability: parallel/mixed/bridge topologies", () => {
  it("solves two resistors in parallel via the production API", () => {
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
    const solution = solveCircuit(components, connections);

    expect(solution.isCircuitActive).toBe(true);
    expect(solution.currentA).toBeCloseTo(6, 3); // R_parallel(6,3)=2 -> 12/2=6A
    expect(solution.readings.r1.currentA).toBeCloseTo(2, 3);
    expect(solution.readings.r2.currentA).toBeCloseTo(4, 3);
  });

  it("solves a mixed series-parallel network via the production API", () => {
    // battery -> r1(2Ω) series -> [r2(6Ω) || r3(3Ω)] -> battery
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
    const solution = solveCircuit(components, connections);

    expect(solution.currentA).toBeCloseTo(3, 3); // R_total = 2 + R_parallel(6,3)=2 -> 4Ω -> 12/4=3A
    expect(solution.readings.r1.voltageV).toBeCloseTo(6, 3);
    expect(solution.readings.r2.currentA).toBeCloseTo(1, 3);
    expect(solution.readings.r3.currentA).toBeCloseTo(2, 3);
  });

  it("solves a bridge-like network (two independent series branches sharing only the battery poles) via the production API", () => {
    // the OLD single-loop DFS solver could only ever find ONE of these two
    // branches and would silently ignore the other — this is the exact
    // shape that motivated Stage S9.
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
    const solution = solveCircuit(components, connections);

    expect(solution.currentA).toBeCloseTo(4.5, 3); // R_parallel(4,8)=8/3 -> 12/(8/3)=4.5A
    expect(solution.readings.r1.currentA).toBeCloseTo(3, 3); // branch A: 12/4
    expect(solution.readings.r3.currentA).toBeCloseTo(1.5, 3); // branch B: 12/8
    expect(solution.readings.r1.currentA).not.toBeCloseTo(0, 3); // both branches actually carry current
    expect(solution.readings.r3.currentA).not.toBeCloseTo(0, 3);
  });

  it("reports correct, distinct node potentials for a parallel network via the production API", () => {
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 10 },
      // r1's own terminal IS "bat_pos"/"bat_neg" directly (no separate wire
      // merging it into a union-find group under some other terminal's
      // name) so nodePotentialV's keys stay predictable for this assertion —
      // nodePotentialV is keyed by whichever terminal string survives as
      // the union-find representative, which is an implementation detail
      // when nodes get merged via `connections`.
      { id: "r1", kind: "resistor", terminals: ["bat_pos", "mid"], resistanceOhm: 4 },
      { id: "r2", kind: "resistor", terminals: ["mid", "bat_neg"], resistanceOhm: 6 },
      { id: "r3", kind: "resistor", terminals: ["mid2", "bat_neg"], resistanceOhm: 3 },
    ];
    const connections: Connection[] = [{ id: "c2", terminals: ["mid", "mid2"] }];
    const solution = solveCircuit(components, connections);

    // R_parallel(r2,r3) = 2Ω; total = r1(4) + 2 = 6Ω -> I=10/6A; V(mid) = I * 2
    const expectedCurrent = 10 / 6;
    const expectedMidV = expectedCurrent * 2;
    expect(solution.currentA).toBeCloseTo(expectedCurrent, 3);
    expect(solution.nodePotentialV["bat_pos"]).toBeCloseTo(10, 3);
    expect(solution.nodePotentialV["bat_neg"]).toBeCloseTo(0, 3);
    // "mid" and "mid2" are wired together into one electrical node — either
    // string may end up as the union-find representative key, so accept both.
    const midPotential = solution.nodePotentialV["mid"] ?? solution.nodePotentialV["mid2"];
    expect(midPotential).toBeCloseTo(expectedMidV, 3);
  });

  it("still detects fuse overload correctly in a parallel branch via the production API", () => {
    // fuse sits in ONE of two parallel branches — must blow based on ITS
    // OWN branch current, not the total circuit current.
    const components: CircuitComponent[] = [
      { id: "bat", kind: "battery", terminals: ["bat_pos", "bat_neg"], voltageV: 12 },
      { id: "r1", kind: "resistor", terminals: ["a1", "b1"], resistanceOhm: 2 }, // branch A: 6A
      { id: "r2", kind: "resistor", terminals: ["a2", "m2"], resistanceOhm: 6 }, // branch B: 2A
      { id: "fuse1", kind: "fuse", terminals: ["m2", "b2"], ratedCurrentA: 3, isBlown: false },
    ];
    const connections: Connection[] = [
      { id: "c1", terminals: ["bat_pos", "a1"] },
      { id: "c2", terminals: ["bat_pos", "a2"] },
      { id: "c3", terminals: ["b1", "bat_neg"] },
      { id: "c4", terminals: ["b2", "bat_neg"] },
    ];
    const solution = solveCircuit(components, connections);

    expect(solution.readings.r1.currentA).toBeCloseTo(6, 2);
    expect(solution.readings.r2.currentA).toBeCloseTo(2, 2);
    expect(solution.fuseToBlowId).toBeNull(); // branch B's 2A is under fuse1's 3A rating
  });
});
