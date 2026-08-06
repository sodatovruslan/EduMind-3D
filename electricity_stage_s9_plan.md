# Electricity Lab Stage S9 Implementation Plan (Final)

## 1. Complete File Inventory

**Production (do not modify without a proven need):**
- `frontend/lib/circuit-engine.ts` — production single-loop DFS solver (`solveCircuit`). Explicit MVP comment: "поддерживается только один последовательный контур... для реального параллельного расчета нужен полноценный узловой анализ".
- `frontend/lib/circuit-engine.test.ts` — 10 tests, the parity baseline every spike solver is checked against.
- `frontend/lib/electricity-lab-catalog.ts` — 8 guided experiments (beginner/intermediate/advanced), all currently built around the single fixed `CANONICAL_WIRING` series layout (the scene's stand only supports this one physical layout today — parallel support is a Stage S9 goal, not yet consumed anywhere).
- `frontend/components/scenes/ElectricityLabScene.tsx` — R3F scene, drag/wire UI, calls `solveCircuit` every frame.
- `backend/app/services/geography_engine.py` etc. — unrelated, not touched by S9.

**Stage S9 spike artifacts (isolated from production):**
- `frontend/lib/nodal-analysis-solver.ts` — Option B implementation (`solveCircuitNodal`), same `CircuitSolution` contract as `circuit-engine.ts`, not imported by any production file.
- `frontend/lib/nodal-analysis-solver.test.ts` — 14 real tests (8 parity + 4 new-capability + 2 numerical-stability stress).
- `solver-spike-report.md` — real spike results (this document's sibling).
- `electricity_stage_s9_plan.md` — this file.

**Removed as proven non-functional placeholders (see solver-spike-report.md history note):**
- `frontend/lib/extended-graph-solver.ts` (Option A stub — `return {} as CircuitSolution`, did not even compile, no real logic). Deleted; Option A is not being pursued per the current checkpoint (Option B selected).

## 2. Detailed Roadmap

### S9.0 - Audit & Architecture Freeze
#### Goal
Establish baseline for parallel circuit support
#### Existing architecture
Single-loop DFS solver in circuit-engine.ts
#### Files to modify
circuit-engine.ts, electricity-lab-catalog.ts
#### New files
None
#### Domain model changes
Add branch tracking to CircuitSolution
#### Tests
- Unit: Verify existing series circuits still work
- Playwright: Basic circuit validation

### S9.1 - Circuit Graph & Solver
#### Goal
Evaluate and select optimal solver approach for parallel/mixed circuits
#### Architecture Comparison

**Option A: Extended Graph Solver**
- Supported circuits: Series + simple parallel (2 branches max)
- Complexity: Medium (extend DFS with branch tracking)
- Changes: ~200 LOC in circuit-engine.ts
- Compatibility: High (minimal API changes)
- Chemistry World: No impact
- Testing: Moderate (new parallel cases)
- Runtime: O(n) for simple circuits
- Extensibility: Limited to 3-4 branches
- Reject if: Need >2 parallel branches or complex networks

**Option B: Nodal Analysis**
- Supported circuits: All types (full parallel/mixed)
- Complexity: High (matrix operations)
- Changes: New solver.ts + ~300 LOC changes
- Compatibility: Medium (new solution format)
- Chemistry World: No impact
- Testing: High (matrix edge cases)
- Runtime: O(n^3) worst case
- Extensibility: Good but struggles with ideal components
- Reject if: Voltage sources cause numerical instability

**Option C: Modified Nodal Analysis**
- Supported circuits: All types (including ideal components)
- Complexity: Very High (sparse matrices)
- Changes: New mna-solver.ts + ~500 LOC changes
- Compatibility: Low (major API changes)
- Chemistry World: Potential physics engine conflicts
- Testing: Very High (full validation suite)
- Runtime: O(n^2) typical
- Extensibility: Excellent (handles future components)
- Reject if: Runtime >5ms for classroom circuits

#### Spike Plan
1. Prototype each approach in isolation
2. Benchmark with test circuits:
   - Simple series
   - 2-branch parallel
   - Complex mixed
   - With ideal components
3. Evaluate:
   - Accuracy
   - Performance
   - Code maintainability
4. Final selection in S9.2

#### Files to modify
None in production — spike solvers live in new, isolated files (see §1).
#### New files
`nodal-analysis-solver.ts`, `nodal-analysis-solver.test.ts`, `solver-spike-report.md`
#### Tests
- Validation against known solutions — done: 4 new-capability tests against hand-computed textbook answers (2-resistor parallel, mixed series-parallel, 3-branch parallel, bridge network).
- Backward compatibility — done: 8 parity tests re-running every `circuit-engine.test.ts` fixture through both solvers and comparing outputs directly.
- Numerical stability under the "ideal component" substitution — done: 2 targeted stress tests (adjacent EPS_R/BIG_R on the same node pair; 6-branch fan-out spanning 1Ω–1000Ω).
- Performance profiling — done, second checkpoint (see S9.2 below): real benchmark across small/medium-mixed/10-node/20-node/repeated-execution circuits.

#### S9.1 Results (real, from this checkpoint)
- **Option A (Extended Graph Solver): not pursued.** The file that was meant to hold it (`extended-graph-solver.ts`) was an empty non-compiling stub with no real logic — there was no actual Option A prototype to evaluate. Not reconstructed in this checkpoint since the next instruction explicitly directed proceeding with Option B.
- **Option B (Nodal Analysis): implemented and verified.** `nodal-analysis-solver.ts` — 14/14 real tests passing (see `solver-spike-report.md` for the full real test output, methodology, and the numerical-stability findings). Handles series, parallel, mixed, and bridge topologies the production DFS solver structurally cannot. The roadmap's own "Reject if: Voltage sources cause numerical instability" criterion was tested directly and did NOT trigger for this domain's realistic value ranges (single voltage source, resistances in the ohms-to-low-kilohms range) — see the report's stress-test section for the honest caveat (mathematically the risk isn't zero for arbitrary/extreme inputs, just not observed for this lab's actual scope).
- **Option C (Modified Nodal Analysis): not attempted this checkpoint.** Given Option B passed its own stated rejection criterion under real testing, there was no evidence-based reason to escalate to the higher-complexity MNA approach yet. Revisit only if S9.2/production integration surfaces a real case Option B can't handle correctly.
- **Performance:** benchmarked in the S9.2 checkpoint below with real numbers, well under the "<5ms per frame" completion criterion (§3).

### S9.2 - Final Solver Selection
#### Goal
Formally select (or reject) Option B as the Stage S9 solver architecture, backed by real correctness/regression/performance/maintainability evidence — not estimates.
#### Existing architecture
Production DFS solver (`circuit-engine.ts`) unchanged; Option B spike (`nodal-analysis-solver.ts`) implemented and verified in S9.1.
#### Files to modify
None in production (still isolated — integration is explicitly out of scope for this decision).
#### New files
None (benchmark added to the existing spike test suite: `nodal-analysis-solver.benchmark.test.ts`).
#### Domain model changes
None yet — this is an architecture decision, not an implementation step.
#### Tests
- Real performance benchmark: small (5 components), medium mixed (9 components, series+parallel), 10-node series, 10-node parallel fan-out, 20-node series, 20-node parallel fan-out, repeated-execution (2000x) on two of the above.
- Direct DFS-vs-Nodal timing comparison on every topology both solvers can represent (series chains).

#### S9.2 Decision (real, from this checkpoint)
**Option B (Nodal Analysis) is SELECTED.** Full justification (correctness, regression, performance with real benchmark numbers, maintainability, domain-scope reasoning, and explicit "why not Option C") is recorded in `solver-spike-report.md`, section "S9.2 — Формальное архитектурное решение" — not duplicated here to avoid the two documents drifting apart. Summary: 12/12 correctness tests + 2/2 numerical-stability stress tests passed; zero production regression (circuit-engine.ts/ElectricityLabScene.tsx untouched, full suite green); real benchmark shows 0.02-0.09ms per solve across all tested sizes (60-450x under the 5ms/frame criterion); Option C's added complexity (multi-source support, MNA auxiliary equations) solves problems this single-battery domain does not have.

**Production integration is explicitly NOT part of this decision** and has not started.

### S9.2 - Production Integration (approved, executed as its own controlled checkpoint)
#### Goal
Wire the approved Option B solver behind the existing `circuit-engine.ts` public API without a wholesale rewrite, keeping every consumer file untouched.
#### Existing architecture
`circuit-engine.ts` exported the DFS solver directly under `solveCircuit`; `nodal-analysis-solver.ts` held the verified Option B implementation, isolated.
#### Files to modify
`circuit-engine.ts` only — `solveCircuit`'s body replaced with a one-line delegation to `solveCircuitNodal`; dead DFS-only internals (`UnionFind`, `resistanceOf`, `PathStep`, `findLoopPath`, the two DFS-only constants) removed since they had no remaining caller. All exported types and `bulbBrightness` unchanged. `ElectricityLabScene.tsx`, `electricity-lab-catalog.ts`, `task-engine.ts`, and every other consumer — **not modified**.
#### New files
`circuit-engine.integration.test.ts` (5 tests, proving new capability through the production `solveCircuit` entry point, not the isolated spike function).
#### Domain model changes
None — `CircuitSolution` shape unchanged.
#### Tests
- Full unmodified `circuit-engine.test.ts` (10 tests) — the actual backward-compatibility proof.
- New `circuit-engine.integration.test.ts` (5 tests) — parallel/mixed/bridge/branch-currents/node-potentials through production `solveCircuit`.
- Full `npx vitest run` (all 43 files, 469 tests) — this is what caught the one real regression below; targeted circuit tests alone did not.

#### Real problems found and fixed during integration
1. **5th-decimal precision drift** in the unmodified `circuit-engine.test.ts` (`bulb1.powerW` off by ~5.3e-6 against a `toBeCloseTo(8, 5)` assertion). Cause: `EPS_R_OHM` (ideal-component stand-in resistance) added a measurable bias once squared into a power calculation. Fix: `EPS_R_OHM` lowered from `1e-6` to `1e-9`; all 24 solver tests (including both numerical-stability stress tests) re-verified passing with the new value.
2. **Real regression in `task-engine.ts`** (a separate, older production consumer not in S9.1's original scope) — 3 failing tests, all about detecting a direct dead short across the battery (`battery_pos` wired straight to `battery_neg`, no component between them). Root cause: this degenerate case (`sourceNode === groundNode` after wiring union-find) broke the general boundary-condition solve — the fixed-voltage map had ground and source collapse into one conflicting entry, current came out as zero instead of a short. Fixed with an explicit early-return branch in `nodal-analysis-solver.ts` matching the old DFS solver's exact behavior for this input (empty path → near-zero resistance → very large current, `isShortCircuit=true`). `task-engine.test.ts`: 19/19 passing after the fix.

Both were caught by running the **full** test suite, not just the circuit-specific targeted tests — see `solver-spike-report.md`'s "Урок (честно)" section for why S9.1's original scope missed `task-engine.ts` entirely.

#### S9.2 Integration Result (real, from this checkpoint)
**Integrated.** `solveCircuit` in `circuit-engine.ts` now runs Option B (Nodal Analysis) internally; public contract, all consumer files, and all previously-passing behavior are unchanged. Full details, real test output, and the two bugs found+fixed are in `solver-spike-report.md`.

## 3. Stage S9 Completion Criteria

### Production Acceptance Checklist
*Checked only where this checkpoint has real evidence (test run, tsc, lint). Unchecked items are genuinely unverified in this checkpoint, not assumed failing — several (measurement/safety UI, autosave/resume, Playwright) are explicitly out of scope per the integration instructions and belong to a later stage.*
- [x] Series circuit calculations correct — `circuit-engine.test.ts`, unmodified, 10/10 passing against the new solver.
- [x] Parallel circuit calculations correct — `circuit-engine.integration.test.ts` + `nodal-analysis-solver.test.ts`.
- [x] Mixed circuit validation — same.
- [x] Ohm's Law verified — same (all solver tests are Ohm's-law-based).
- [x] Voltage drop matches theory — `circuit-engine.test.ts` + integration tests check exact voltage drops.
- [ ] Ammeter series validation — pre-existing `task-engine.ts` check, unaffected by S9, not re-audited beyond confirming its tests still pass.
- [ ] Voltmeter parallel validation — same caveat as above.
- [ ] Fuse burnout animation — UI/visual, not covered by unit tests, not verified in this checkpoint.
- [x] Short circuit detection — verified, including the dead-short bug found and fixed this checkpoint (`task-engine.test.ts` 19/19).
- [x] Overload protection — fuse-rating logic verified (`circuit-engine.test.ts`, `circuit-engine.integration.test.ts`'s parallel-branch fuse case).
- [ ] Guided experiment flow / XP rewards / Teacher report generation / Autosave / Resume / Offline save — unrelated to the solver, not touched, not verified this checkpoint.
- [x] <5ms per frame — real benchmark, 0.02-0.09ms per solve, 60-450x under budget.
- [ ] Zero console errors — would require running the live scene in a browser; not done this checkpoint (unit/integration tests only, per the requested verification commands).
- [x] Zero TypeScript errors — `npx tsc --noEmit`, 0 errors.
- [x] Zero ESLint warnings — `npm run lint`, 0 warnings.
- [ ] All critical physics/domain scenarios covered — solver-level scenarios yes; broader domain/UI scenarios not re-audited.
- [x] Full Vitest suite passes — 469/469 (43 files).
- [ ] All Playwright scenarios pass — not run this checkpoint (not among the requested verification commands; also out of scope — "Do not start measurement UI, safety UI, or next Stage").