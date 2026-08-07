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

### S9.3 - Measurement Tools
#### Goal
Bring ammeter/voltmeter to the same production quality as Chemistry World's measurement tooling: detect incorrect placement (ammeter in parallel, voltmeter in series), show an educational warning instead of a misleading number, keep live updates while wiring, using only the already-integrated production solver.
#### Existing architecture
`task-engine.ts` (a separate, older "6 quick tasks" module) already had the exact topological placement checks needed (Task 2: ammeter-parallel detection, Task 3: voltmeter-not-parallel-to-load detection) — but only surfaced through the task/quiz panel, never on the meter display itself in real time.
#### Files to modify
`task-engine.ts` (pure refactor — delegate to the new shared module instead of its own private copy of the same union-find logic; behavior proven unchanged by running its own unmodified test file), `ElectricityLabScene.tsx` (targeted: `MeterHousing`/`Ammeter`/`Voltmeter` gain an optional warning display; `CircuitScene` computes the two checks via `useMemo`). `circuit-engine.ts`, `WireDragProvider.tsx`, `ConnectionPoint.tsx`, `ExperimentStateProvider.tsx` — **not touched** (no real solver bug found this checkpoint, no reason to touch it; drag-and-drop/wiring untouched per the task's explicit constraint).
#### New files
`measurement-validation.ts` (shared placement-diagnosis logic + Russian educational messages), `measurement-validation.test.ts` (8 unit tests), `MeasurementTools.integration.test.tsx` (5 integration tests through the real `ExperimentStateProvider` + real `solveCircuit`), `electricity-measurement-tools.spec.ts` (Playwright, reuses `electricity-lab.spec.ts`'s wiring helpers).
#### Domain model changes
None — no new fields on `CircuitComponent`/`CircuitSolution`; placement status is derived, not stored.
#### Tests
- Unit: `measurement-validation.test.ts`, 8/8 passing, against the real production solver.
- Integration: `MeasurementTools.integration.test.tsx`, 5/5 passing, through the real state provider + real solver (proves live valid→invalid transitions without remounting, and recovery via the real `removeConnection` action).
- Backward compatibility: `task-engine.test.ts` run completely unmodified, 19/19 passing — proves the refactor didn't change Task 2/3 behavior.
- Playwright: `electricity-measurement-tools.spec.ts` written and type-checked, but **not yet verified by a real run** — see the S9.3 Result note below.

#### S9.3 Result (real, from this checkpoint)
**Implemented and unit/integration-verified; Playwright run blocked by machine state, not a code issue.** `npx tsc --noEmit`: 0 errors. Full `npx vitest run`: 482/482 passing (45 files). `npm run lint`: 0 warnings. The new Playwright scenario hung on its first `mouse.move` after both a 180s and a 240s budget; before treating this as a regression, the **existing, unmodified** `electricity-lab.spec.ts` was run as a control and hung identically on the same line — proving this is pre-existing headless Chromium/SwiftShader instability on this machine (the same class of issue already documented for Chemistry World E2E elsewhere in this repo's history), not something Stage S9.3 introduced. 18 stuck `chrome.exe` processes were killed afterward; servers stopped. The scenario is ready to run once the environment is stable (or on a different machine/CI).

#### ✅ Stage S9.3 — Approved
Approved as following the project strategy: reuse existing production logic (`task-engine.ts`'s Task 2/3 diagnosis → `measurement-validation.ts`), no duplicated algorithms, production architecture preserved (`circuit-engine.ts`, wiring, drag-and-drop untouched), full backward compatibility (proven by the unmodified `task-engine.test.ts`, 19/19). The Playwright hang is accepted as a pre-existing environment limitation (reproduces on the unmodified baseline) and is **not investigated further during Stage S9** per explicit direction. Committed as `feat(electricity): S9.3 approved`.

## 3. Stage S9 Completion Criteria

### Production Acceptance Checklist
*Checked only where real evidence exists (test run, tsc, lint). Unchecked items are genuinely unverified, not assumed failing. Finalized in S9.9 — the two items that remain unchecked require a live browser session (blocked by the documented pre-existing SwiftShader/headless environment issue, not a code defect) and are accepted as such for module completion.*
- [x] Series circuit calculations correct — `circuit-engine.test.ts`, unmodified, 10/10 passing against the new solver.
- [x] Parallel circuit calculations correct — `circuit-engine.integration.test.ts` + `nodal-analysis-solver.test.ts`.
- [x] Mixed circuit validation — same.
- [x] Bridge networks correct — `nodal-analysis-solver.test.ts` (S9.9): a genuine 5-resistor Wheatstone bridge (a bridging element directly connecting two branches' midpoints — the textbook case series/parallel reduction structurally cannot solve). Balanced case verified against the hand-derivable fact that a balanced bridge carries zero current; unbalanced case verified via Kirchhoff's Current Law holding at both internal nodes (an independent check, not circular with how each reading is computed).
- [x] Node potentials correct — same Wheatstone bridge tests; node potentials are the actual unknowns Gaussian elimination solves for, and KCL only holds if they were solved correctly.
- [x] Branch currents correct — same.
- [x] Ohm's Law verified — same (all solver tests are Ohm's-law-based).
- [x] Voltage drop matches theory — `circuit-engine.test.ts` + integration tests check exact voltage drops.
- [x] Ammeter series validation — `measurement-validation.test.ts` + `MeasurementTools.integration.test.tsx` (S9.3): parallel placement detected against the real solver, correct series placement confirmed, live transition verified.
- [x] Voltmeter parallel validation — same (S9.3): series placement detected (and shown to genuinely block the circuit via the real solver, not a scripted message), parallel placement confirmed valid.
- [x] Invalid placement feedback correct — `ammeterPlacementMessage`/`voltmeterPlacementMessage` (S9.3), reused verbatim by S9.5's `currentStepFeedback` and S9.8's discoverability hint — one source of truth for the explanation text, verified in unit + integration + workflow tests across three stages.
- [ ] Fuse burnout animation — UI/visual (`FuseParticles`), audited for correctness of logic and per-frame allocations (S9.8: clean, no allocations in the frame loop) but the actual visual result is not verified without a live browser.
- [x] Short circuit detection — verified, including the dead-short bug found and fixed in S9.2 (`task-engine.test.ts` 19/19).
- [x] Overload protection — fuse-rating logic verified (`circuit-engine.test.ts`, `circuit-engine.integration.test.ts`'s parallel-branch fuse case); S9.4 adds a genuine pre-failure warning zone (`electricity-safety.test.ts`) on top of the existing blow/no-blow threshold.
- [x] Unsafe connection detection — `electricity-safety.test.ts`/`ElectricitySafetyWorkflow.integration.test.tsx` (S9.4): fuse-bypass detection, verified created then resolved live.
- [x] Safety UI — `safety-warnings` banner (S9.4), animated enter/exit added in S9.8 for parity with Chemistry World; per-meter inline warnings (S9.3).
- [x] Guided experiment flow — `electricity-lab-catalog.ts` (Stage E-2, upgraded in S9.5): full select/step/hint/finish/restart lifecycle, gated by real solver + measurement + safety state; XP rewards via existing `submitTaskEvent`.
- [x] Step gating — S9.5: every step's `isUnlocked` reads real solver/measurement/safety state, never a scripted flag; proven by dedicated gating tests across S9.5-S9.8.
- [x] Hints — `recordHintUsed()`/`hintsRef` (S9.5), persisted on the notebook entry and factored into `assessment.overallScore` with a capped penalty (S9.6).
- [x] Restart — both "exit without losing resumability" (`exitExperiment()`) and "start over/discard" (`discardPendingResume()`, S9.7) are implemented and distinct, verified in dedicated tests.
- [x] Completion — `completeExperiment()` re-validates `isComplete()` against real state before ever persisting a notebook entry (S9.5), clears the S9.7 save on real completion.
- [x] Assessment — `electricity-assessment.ts` (S9.6): deterministic 4-category score (completion/accuracy/safety/circuitBuilding), no LLM in the scoring path.
- [x] Evidence tracking — `electricity-evidence.ts` (S9.6): discrete event log of real state transitions, not frame-by-frame noise.
- [x] Teacher analytics / report generation — `electricity-assessment.ts` + `electricity-evidence.ts` (S9.6): deterministic assessment persisted on `ElectricityNotebookEntry`, rendered in `ElectricityLabReportPanel`/`NotebookPanel`, threaded into `LabExperienceAIContext` for the existing AI teacher chat.
- [x] Notebook / report — `electricity-notebook.ts` (Stage E-2, extended S9.6): persists to `localStorage`, rendered by `ElectricityLabReportPanel`/`ElectricityLabNotebookPanel`.
- [x] Autosave — `electricity-autosave-engine.ts` (S9.7): debounced (1.5s), dirty-detection via React's own dependency-array reference equality, periodic safety net, `beforeunload`/`pagehide`/`visibilitychange` flush.
- [x] Resume — `hydrateElectricitySave`/`resumeSave()` (S9.7): full reload-and-resume of wiring/step/measurements/hints/evidence, verified via full provider-tree unmount/remount ("real reload") in tests.
- [x] Start over — `discardPendingResume()` (S9.7): clears the save without hydrating; verified the discarded session's data does not leak into a fresh `selectExperiment()`.
- [x] Reload recovery — same, plus the `pendingResume` mount-time check (S9.7) and `ElectricityResumeModal` UI (Continue/Start Over).
- [x] Drag/drop — `WireDragProvider.tsx` (audited S9.8, confirmed already production-quality; first real test coverage added, 12 unit tests). Component-body drag/drop confirmed as an intentional non-goal (fixed physical layout), not a gap.
- [x] Wiring — same, plus real end-to-end proof via S9.8's integration/workflow tests driving connections through actual `startDrag`/`commitDrag` gestures rather than raw `addConnection()`.
- [x] Wire removal — `WireTube.onClick` (pre-existing), given real hover affordance + a stuck-cursor bug fix in S9.8.
- [x] Escape cancellation — `WireDragProvider.tsx` (pre-existing, confirmed already correct), given on-screen discoverability in S9.8; behavior verified in dedicated unit tests for the first time.
- [x] Camera interaction lock — `orbitEnabled={!draggingFrom}` (pre-existing, confirmed already correct and already consistent with Chemistry World's identical mechanism); the underlying boolean contract verified in S9.8's integration tests.
- [x] Reset/recovery — `ElectricityResetButton` (full wipe including S9.7 autosave) vs. `exitExperiment()` (session-only, autosave preserved) confirmed correctly distinct in S9.8's audit and covered by tests since S9.5-S9.7.
- [x] <5ms per frame — real benchmark (S9.2), 0.02-0.09ms per solve, 60-450x under budget; S9.8 additionally audited every `useFrame` callback in the scene line-by-line and found zero per-frame allocations.
- [ ] Zero console errors — would require running the live scene in a browser; not verified. S9.9 attempted one bounded Playwright reproduction (`electricity-lab.spec.ts`) — it failed at the auth-setup step (`ECONNREFUSED` to `localhost:8000`, backend server not running in this session), so it did not reach far enough to re-confirm the previously-documented SwiftShader/headless hang specifically. Starting a full server stack was judged out of scope for a bounded, one-time check, per explicit instruction not to spend the stage debugging unrelated infrastructure.
- [x] Zero TypeScript errors — `npx tsc --noEmit`, 0 errors.
- [x] Zero ESLint warnings — `npm run lint`, 0 warnings.
- [x] All critical physics/domain scenarios covered — solver (including bridge networks as of S9.9) + measurement-tool + safety + guided-experiment + assessment + autosave + interaction scenarios all covered by unit/integration/workflow tests; only live-browser/console-level verification remains unverified (see above).
- [x] Full Vitest suite passes — 593/593 (63 files, as of S9.9).
- [ ] All Playwright scenarios pass — `electricity-measurement-tools.spec.ts` written and type-checked but not run to completion (machine instability, see S9.3 Result above); existing `electricity-lab.spec.ts` also currently blocked by the same issue as a control; no guided-lab Playwright spec exists yet.

### S9.4 - Safety System
#### Goal
Bring Electricity Lab's safety system to the same production quality as Chemistry World: short-circuit detection, fuse behaviour, overload detection (warning before permanent failure), a structured Safety Event Engine (`short_circuit`, `overload`, `fuse_blown`, `unsafe_measurement`, `unsafe_connection`), and minimal UI (banners/icons/explanations) — no redesign.
#### Existing architecture
`circuit-engine.ts` already unifies "direct battery short" and "dangerously low resistance" into one `isShortCircuit` flag (since S9.2); fuse-blow threshold logic already lives in the solver; `measurement-validation.ts` (S9.3) already has the exact topology checks needed for `unsafe_measurement`; `task-engine.ts` already has its own minimal inline `short_circuit`/`fuse_blown` reads (task-scoped, not touched). Chemistry World's `chemistry-safety.ts` is the reference quality bar and the literal source of the shared `SafetyWarning` type.
#### Files to modify
`ExperimentStateProvider.tsx` (additive `SimEvent` variants only — no reducer logic changes), `ElectricityLabScene.tsx` (safety banner + event-logging effects, same minimal-footprint pattern as S9.3's meter warnings). `circuit-engine.ts`, `task-engine.ts`, `measurement-validation.ts`, `WireDragProvider.tsx`, `ConnectionPoint.tsx` — **not touched** (no real solver bug found; task-engine's trivial one-line flag reads aren't the kind of duplicated topology algorithm S9.3's refactor targeted).
#### New files
`electricity-safety.ts` (safety checks, reuses `chemistry-safety.ts`'s `SafetyWarning` type and `measurement-validation.ts`'s placement checks), `electricity-safety.test.ts` (unit), `ElectricitySafety.integration.test.tsx` (integration), `ElectricitySafetyWorkflow.integration.test.tsx` (multi-step workflow scenarios).
#### Domain model changes
`SimEvent` union gains 3 additive variants (`overload`, `unsafe_measurement`, `unsafe_connection`); no changes to `CircuitComponent`/`CircuitSolution`.
#### Tests
- Unit: 13/13, real `solveCircuit()`, covering short circuit, fuse blown, overload (fuse-current-approaching-rating AND bulb-power-exceeding-rating), unsafe_connection (fuse bypass), unsafe_measurement (reusing S9.3's checks), and a fully-healthy zero-warnings case.
- Integration: 5/5, through the real `ExperimentStateProvider` + real solver, single-state snapshots.
- Safety workflow: 3/3 multi-step scenarios (voltage ramp-up to fuse blow then reset; measurement mistake made then corrected live; fuse bypass detected then rewired correctly) — the explicitly-requested third test category, distinct from single-snapshot integration tests.

#### S9.4 Result (real, from this checkpoint)
**Implemented and fully test-verified.** `npx tsc --noEmit`: 0 errors. Full `npx vitest run`: 503/503 passing (48 files) — one transient vitest-pool worker timeout on an unrelated Chemistry test file occurred on the first run and did not reproduce on retry (not linked to these changes). `npm run lint`: 0 warnings. `circuit-engine.ts`/`task-engine.ts`/`measurement-validation.ts` confirmed untouched via `git status`. The `SafetyWarning` type is literally imported from `chemistry-safety.ts` (re-exported, not redefined) and `unsafe_measurement` calls directly into `measurement-validation.ts`'s existing placement checks — zero duplicated logic across both reuse points.

#### ✅ Stage S9.4 — Approved
Approved as following the project strategy: safety checks are pure functions of the already-computed production solution, `SafetyWarning` reused (not redefined) from Chemistry World, `unsafe_measurement` reuses S9.3's placement checks instead of re-deriving topology. Committed as `feat(electricity): S9.4 approved`.

### S9.5 - Guided Experiments
#### Goal
Bring Electricity Lab's guided experiments to the same production quality as Chemistry World's guided lab, without rebuilding Electricity Lab or duplicating its physics.
#### Existing architecture (discovered before writing any code, per explicit instruction)
Electricity Lab already had a full guided-experiment layer from an earlier "Stage E-2" checkpoint — `electricity-lab-catalog.ts` (8 experiments, full step lifecycle: introduction/theory/equipment/assembly/measurement/analysis/conclusion/finish, real `isUnlocked`/`isComplete` conditions, scientific questions, XP), `ElectricityLabExperienceProvider.tsx` (selection/step-index/measurements/hints/notebook/completion, all plain serializable state), `ElectricityGuidedLabPanel.tsx`/`ElectricityExperimentCatalogBrowser.tsx`/`ElectricityLabReportPanel.tsx`/`ElectricityLabNotebookPanel.tsx` (UI), already wired into `ElectricityLabScene.tsx`. This is NOT the same thing as `task-engine.ts`'s 6 quick tasks (untouched, as instructed) — it is the richer guided-lab layer the S9.5 spec asked to inspect and upgrade instead of rebuilding.

The gap (confirmed by reading every file above before editing): none of the 8 experiments' `isUnlocked`/`isComplete` conditions consulted `measurement-validation.ts` (S9.3) or `electricity-safety.ts` (S9.4) — both were built in checkpoints AFTER this guided-lab layer originally shipped. Concretely: `measureCurrent`/`measureVoltage` could be marked complete with a misplaced ammeter/voltmeter (as long as the solver's `isCircuitActive`/voltage reading happened to look right), and every experiment could be marked complete while a `danger`-severity safety warning (short circuit, unsafe fuse bypass, unsafe measurement) was active — the two systems simply never talked to each other.
#### Files modified
- `frontend/lib/electricity-lab-catalog.ts` — added `isElectricallySafe(ctx, allowedDangerCodes?)` (reads `checkElectricalSafety`, blocks completion on any `danger`-severity warning except codes an experiment intentionally provokes), `isAmmeterPlacedCorrectly`/`isVoltmeterPlacedCorrectly` (reads `checkAmmeterPlacement`/`checkVoltmeterPlacement`), and an optional `feedback` field on `ElectricityLabStep` for step-specific lock explanations. Every experiment's `isComplete` (and matching `finishStep`) now also requires `isElectricallySafe`; `measureCurrent`/`measureVoltage`'s assembly step additionally requires correct ammeter/voltmeter placement. `elec-advanced-fuse-overload` explicitly allows its own `fuse_blown` danger code (that is the point of the experiment) but still blocks on any other danger (e.g. a fuse bypass). No physics/topology recomputed — every new check is a direct call into the existing S9.3/S9.4 pure functions.
- `frontend/components/core/ElectricityLabExperienceProvider.tsx` — added `currentStepFeedback: string | null` to the context value: the most critical active `danger` safety message, else the step's own `feedback()`, else a placement message, else `null` (generic UI fallback). No new domain fields, no new state — computed the same way `isCurrentStepUnlocked` already was.
- `frontend/components/lab/ElectricityGuidedLabPanel.tsx` — the existing locked-hint paragraph now shows `currentStepFeedback` (amber) when present, falling back to the original generic sentence otherwise. No layout/redesign changes.
#### Domain model changes
None. `ElectricityLabStepContext`/`ElectricityStepContextInput` are unchanged — `checkElectricalSafety`/`checkAmmeterPlacement`/`checkVoltmeterPlacement` are pure functions of the `components`/`connections`/`solution` the context already carried, so no new field was needed to thread safety data through (unlike Chemistry World's `LabStepContext.safetyWarnings`, which was a pre-existing architectural choice from an earlier stage — not required here since Electricity's context already has everything the safety function needs). State shape (`currentStepIndex`, `measurements`, `questionAnswers`, drafts, notebook entries, ref-based counters) was already fully plain/serializable before this checkpoint — no changes needed to make a future S9.7 Autosave viable.
#### Tests
- Unit (`electricity-lab-catalog.test.ts`, extended): 13/13 (5 new) — ammeter-shunts-resistor blocks `measureCurrent` with the reused placement message then unblocks once rewired canonically; voltmeter-in-series blocks `measureVoltage` similarly; every one of the 8 experiments is blocked by an active short circuit even when its own numeric conditions are otherwise satisfied; `fuseOverload` allows its own `fuse_blown` but still blocks on a simultaneous fuse-bypass; `lampBrightness` is NOT blocked by a `warning`-severity bulb-overload (only `danger` blocks).
- Integration (`ElectricityGuidedExperiment.integration.test.tsx`, new, 2/2): real `ExperimentStateProvider` -> real `solveCircuit()` -> real `ElectricityLabExperienceProvider`, driven by real `addConnection`/`removeConnection`/`updateComponent` actions — ammeter-shunt mistake made then corrected live without remounting; a real short circuit introduced mid-experiment blocks the `finish` step and clears the instant it's wired away.
- Workflow (`ElectricityGuidedExperiment.workflow.test.tsx`, new, 4/4): full experiment completion end to end (`elec-beginner-measure-current`); wrong-wiring-then-correction (`elec-beginner-measure-voltage`, voltmeter in series then fixed); unsafe-circuit-then-correction (`elec-advanced-short-circuit`, deliberate short observed then resolved before `finish` unlocks); restart scenario (`exitExperiment` + re-`selectExperiment` fully resets step index/measurements/drafts, then the experiment is completed again from a clean session).
- UI (`ElectricityGuidedLabPanel.test.tsx`, new, 2/2): the real panel, rendered through the same real provider chain, shows only the generic locked-hint with an empty circuit, and shows the specific reused ammeter-placement message (styled amber) once a real wiring mistake exists.
- Backward compatibility: all 8 pre-existing `electricity-lab-catalog.test.ts` cases pass unmodified.
- Playwright: **not attempted this checkpoint.** No `electricity-guided-lab.spec.ts` existed before S9.5 and none was added — per explicit instruction, the pre-existing SwiftShader/headless `mouse.move` hang (proven in S9.3 against the unmodified baseline, and not re-investigated per direction in S9.3/S9.4) is an accepted environment limitation, and the three Vitest layers above already exercise the real provider/solver/safety/measurement pipeline end to end without a browser. This is a genuine, documented gap in browser-level coverage, not a claim that it was verified.

#### S9.5 Result (real, from this checkpoint)
**Implemented and fully test-verified except for the pre-existing, documented Playwright limitation.** `npx tsc --noEmit`: 0 errors. Full `npx vitest run`: 516/516 passing (51 files, up from 503/48 at S9.4 — 13 new tests across 3 new files + 5 extended in the existing catalog test). `npm run lint`: 0 warnings. `circuit-engine.ts`, `nodal-analysis-solver.ts`, `measurement-validation.ts`, `electricity-safety.ts`, `ExperimentStateProvider.tsx` confirmed untouched. `electricity-lab-catalog.ts`'s 8 experiments and their catalog IDs/titles/XP are unchanged — only their gating conditions were tightened, per the explicit instruction to upgrade the existing catalog rather than build a parallel one.

#### ✅ Stage S9.5 — Approved
Approved as following the project strategy: no rebuild, no parallel catalog, no redesign — the pre-existing guided-experiment layer from Stage E-2 was upgraded in place to consult S9.3/S9.4's already-reused-and-proven pure functions. Zero new physics/topology logic anywhere in this checkpoint. Committed as `feat(electricity): S9.5 approved`.

### S9.6 - Assessment & Teacher Analytics
#### Goal
Bring Electricity Lab's assessment and teacher analytics to the same production quality as Chemistry World, based on REAL student actions/domain state, without rebuilding existing progress/notebook/report infrastructure.
#### Existing architecture (discovered before writing any code, per explicit instruction)
Audited Chemistry World's assessment system first and found it is actually **two separate engines** in `chemistry-assessment.ts`: (1) `assessExperiment` — the one ACTUALLY wired into `ChemistryLabExperienceProvider.tsx`'s `completeExperiment()`, a simple ref-accumulated, 5-category deterministic scorer; (2) `computeDeterministicAssessment` — a far heavier evidence-ID/weighted-criteria engine that is fully built and unit-tested but **called nowhere in the running app** (`grep` confirms zero production callers; its own consumer UI, `StudentFeedbackPanel.tsx`, is likewise imported by nobody). Per the explicit instruction "do NOT duplicate Chemistry World architecture unless the same pattern genuinely fits," S9.6 follows System 1 (the live, proven pattern) and does **not** replicate System 2's evidenceEventIds/criteria-weight machinery — that would mean copying a prototype Chemistry World itself doesn't use, not a production pattern.

Also confirmed via audit: `electricity-notebook.ts` (Stage E-2) already has a `computeScore`/`buildTeacherNote`/`ElectricityNotebookEntry` shape structurally analogous to Chemistry's live System 1 — this was extended in place, not replaced. `ExperimentStateProvider.tsx`'s `SimEvent`/`actionsLog` exists but is a write-only sink for the legacy `/api/simulations/{id}/complete` endpoint, with no timestamps/sequence/IDs — too thin to serve as a real evidence log, so a new lightweight, purpose-built evidence log was added instead (see below), reusing the same underlying pure check functions (`measurement-validation.ts`/`electricity-safety.ts`), not duplicating any physics/topology. `progress-client.ts`'s `submitTaskEvent`/`LabAIContext`/`buildAIContext` pipelines were confirmed already wired from `ElectricityLabExperienceProvider` and were extended, not replaced. Backend (`TASK_TOPICS` in `progress_service.py` not knowing guided-experiment IDs) was confirmed as a real, pre-existing gap but is **out of scope** for this frontend-only checkpoint, consistent with S9.1-S9.5 never touching the backend.
#### New files
- `frontend/lib/electricity-evidence.ts` — `ElectricityEvidenceCode`/`ElectricityEvidenceEvent`/`ElectricityEvidenceSummary` + `summarizeElectricityEvidence()`. A discrete, append-only log of REAL state transitions (experiment started, step completed, hint used, incorrect/unsafe wiring, ammeter/voltmeter placement error, successful correction, short circuit triggered, fuse blown, successful measurement, experiment completed) — not a frame-by-frame log; events are only pushed on actual transitions (e.g. placement invalid→valid), reusing `checkAmmeterPlacement`/`checkVoltmeterPlacement`/`checkElectricalSafety` from S9.3/S9.4 to detect them.
- `frontend/lib/electricity-assessment.ts` — `assessElectricityExperiment()`: deterministic 4-category score (`completion`/`accuracy`/`safety`/`circuitBuilding`) + `overallScore` + `summary`, purely from the evidence summary + question results. No LLM, no randomness. Mirrors Chemistry's live `assessExperiment` shape/spirit (category breakdown + overall + summary), not System 2.
- `frontend/lib/electricity-evidence.test.ts` (5 unit tests), `frontend/lib/electricity-assessment.test.ts` (9 unit tests), `frontend/components/core/ElectricityAssessment.integration.test.tsx` (4 integration tests), `frontend/components/core/ElectricityAssessment.workflow.test.tsx` (4 workflow tests).
#### Files modified
- `frontend/lib/electricity-notebook.ts` — `ElectricityNotebookEntry`/`Input` gained `hintsUsed`/`mistakesCount`/`safetyIncidentsCount`/`measurementErrorsCount`/`selfCorrectionsCount`/`durationMs`/`assessment` (all additive; new `evidenceEvents`/`totalSteps`/`durationMs` input fields are optional with zero-evidence defaults). `buildTeacherNote` enriched additively (safety/measurement/self-correction/hint-free sentences appended only when relevant) — the pre-existing score-tier sentence and wrong-question sentence are untouched byte-for-byte. `computeScore`/`score` field **not modified at all** — full backward compatibility, proven by running all 5 pre-existing tests unmodified (still 5/5) plus 4 new ones.
- `frontend/components/core/ElectricityLabExperienceProvider.tsx` — added `evidenceRef`/`experimentStartedAtRef` + 3 new `useEffect`s (ammeter placement transition, voltmeter placement transition, danger-safety-code transition — `unsafe_measurement` deliberately excluded from the safety effect since it's already fully captured by the dedicated placement effects, avoiding double-counting the same real mistake). `advanceStep`/`recordMeasurement`/`recordHintUsed`/`completeExperiment` now push discrete evidence events at the exact moments they happen. `completeExperiment()` now threads `evidenceEvents`/`totalSteps`/`durationMs` into `buildElectricityNotebookEntry`, and enriches `submitTaskEvent`'s `mistakes` array with real evidence-derived codes (not just wrong quiz answers) — reuses the already-wired backend pipeline, no new endpoint.
- `frontend/lib/ai-context-builder.ts` — `LabExperienceAIContext.lastNotebookEntry` gained `hintsUsed`/`mistakesCount`/`safetyIncidentsCount`/`measurementErrorsCount`/`assessmentOverallScore` so a future AI teacher can reference concrete facts, not just the score. No new AI endpoint, no new context builder — same `buildAIContext`/`/api/ai/teacher` pipeline Electricity Lab already had.
- `frontend/components/lab/ElectricityLabReportPanel.tsx` / `ElectricityLabNotebookPanel.tsx` — render the new fields (4-category breakdown, hints/mistakes/safety/duration counters) using the exact existing panel structure — no redesign, no new components.
- `frontend/lib/ai-context-builder.test.ts` — one pre-existing test rewritten to build its fixture via the real `buildElectricityNotebookEntry()` instead of a hand-rolled literal (the literal became invalid once the type gained required fields); assertions extended to cover the new projected fields.
#### Domain model changes
Additive only. `ElectricityNotebookEntry` gained 7 new fields (see above), all optional on the input side with safe defaults, so every pre-existing call site and test continues to work unmodified. No changes to `CircuitComponent`/`CircuitSolution`/`ElectricityLabStepContext`/`ExperimentStateProvider`'s `SimEvent`.
#### Tests
- Unit (14): evidence aggregation (mistake/safety/measurement-error/self-correction/hint counting from synthetic event arrays), assessment scoring (clean run = 100 in every category, safety penalty -25/incident, circuit-building penalty -15/mistake +5/self-correction bonus, hint penalty capped at -10, accuracy from real question correctness, category floors at 0, deterministic summary text).
- Notebook backward-compat + extension (4 new + 5 unchanged = 9): zero evidence → zero counters + unchanged score/teacherNote; real evidence → correct aggregated counters + lower assessment (but unchanged `score`, proving the two metrics are independent); teacherNote mentions real safety-incident counts; `durationMs` persisted as-is.
- Integration (4, real `ExperimentStateProvider` + real `ElectricityLabExperienceProvider` + real solver): clean completion (all counters zero, `overallScore` 100); ammeter misplaced then self-corrected (mistake + correction on the final entry); short circuit triggered mid-experiment then resolved (`safetyIncidentsCount` > 0, `assessment.safety` < 100, `teacherNote` mentions it); voltmeter misplaced then corrected.
- Workflow (4, full multi-step realistic sessions): complete cleanly → `overallScore` 100 + notebook entry; two different mistakes in one session both self-corrected → both counted; same clean session run with vs. without 3 hints → only `overallScore` differs (categories untouched), proving hint penalty is isolated; deliberately blowing the fuse (`elec-advanced-fuse-overload`, where `fuse_blown` is explicitly ALLOWED for completion gating) still registers as a real safety incident and lowers `assessment.safety` — gating and scoring are correctly independent concerns.
- Playwright: not attempted, same accepted pre-existing SwiftShader/headless limitation as S9.3-S9.5 (no new spec name added; documented, not re-investigated per standing instruction).

#### S9.6 Result (real, from this checkpoint)
**Implemented and fully test-verified.** `npx tsc --noEmit`: 0 errors. Full `npx vitest run`: 542/542 passing (55 files, up from 516/51 at S9.5 — 26 new tests across 4 new files + 4 extended in existing files, plus 1 pre-existing test adapted to the extended type). `npm run lint`: 0 warnings. `circuit-engine.ts`, `nodal-analysis-solver.ts`, `measurement-validation.ts`, `electricity-safety.ts`, `electricity-lab-catalog.ts`, `ExperimentStateProvider.tsx`, backend (`progress_service.py`/`progress.py`/`ai_service.py`) — **all confirmed untouched**.

#### ✅ Stage S9.6 — Approved
Approved as following the project strategy: audited Chemistry World first, correctly identified its two assessment engines, deliberately followed only the one actually used in production (not the unused, heavier prototype), extended Electricity Lab's own existing notebook/report/AI-context pipeline in place rather than building a parallel "teacher analytics" system. Committed as `feat(electricity): S9.6 approved`.

### S9.7 - Autosave & Resume
#### Goal
Let a student leave an unfinished guided experiment, reload/return later, and continue from the correct step with meaningful lab state restored — to the same reliability level as Chemistry World, without rebuilding persistence from scratch.
#### Existing architecture (audited before writing any code, per explicit instruction)
Confirmed Electricity Lab had **zero** in-progress-session persistence before this checkpoint — its only save (the notebook, `edumind_electricity_notebook`) only ever writes on a *completed* attempt; `ExperimentStateProvider.tsx`'s circuit state and `ElectricityLabExperienceProvider.tsx`'s step/measurement/evidence state are pure in-memory React state, wiped on reload. Chemistry World's autosave is real production infrastructure but is **backend-REST-backed**: a Postgres table `chemistry_saves` + FastAPI router `/api/chemistry/saves` with optimistic-concurrency revisions, idempotency keys, and an IndexedDB offline-fallback queue (`autosave-engine.ts`) — built for a system with (aspirational) multi-device/auth durability, even though `userId` is still hardcoded to `"user-student"` there today.

**Explicit architectural decision (confirmed with the user before implementation, since it changes scope materially):** localStorage-only, not backend-backed. Reasoning: Electricity Lab has never had backend persistence (S9.1-S9.6 stayed 100% frontend by explicit instruction each stage); the existing `chemistry_saves` table/router is hard-named for chemistry and reusing it as-is would be semantically wrong, while a new `electricity_saves` table+router+migration is a materially bigger scope than "reuse existing systems." The schema below is still versioned (`schemaVersion`, `revision`) exactly like Chemistry's, so a future backend-sync migration would not require reshaping it — only re-pointing the write path.
#### New files
- `frontend/lib/electricity-save-schema.ts` — `ElectricitySaveSnapshotV1` (circuit: components+connections; experiment: experimentId/currentStepIndex/completedStepIds/taskStatus/startedAt/hintsUsed/measurements/questionAnswers/observationsDraft/conclusionDraft/evidenceEvents/sessionObservations). Simpler than Chemistry's `ChemistrySaveSnapshotV1` on purpose — no workspace/containers/cabinets layer, because Electricity Lab has one fixed physical circuit board (see `electricity-lab-catalog.ts`'s `CANONICAL_WIRING`), not freely-placed items.
- `frontend/lib/electricity-save-serializer.ts` — `serializeElectricitySave` (deterministic, components/connections sorted by id, same trick as `chemistry-save-serializer.ts`), `validateElectricitySaveSnapshot`, `hydrateElectricitySave` (throws on invalid input; returns `startedAtMs` parsed from the *original* `startedAt`, not resume time, so a final `durationMs` at completion honestly spans the whole session including before-reload time).
- `frontend/lib/electricity-autosave-engine.ts` — `ElectricityAutosaveEngine` class + singleton `electricityAutosaveEngine`. Same PATTERN as Chemistry's `autosave-engine.ts` (debounce 1500ms, periodic safety net 20000ms, status subscription, `beforeunload`/`pagehide`/`visibilitychange` flush) but not the same code — localStorage writes are synchronous, so there is no mutex/`flushQueued`/409-conflict/offline-queue machinery (none of that is reachable without a network write path).
- `frontend/components/lab/ElectricityResumeModal.tsx` / `ElectricityAutosaveBadge.tsx` — same minimal UX pattern as Chemistry's `ResumeExperimentModal.tsx`/`AutosaveBadge.tsx` (Continue/Start Over, idle/pending-saving/saved/error badge), simplified (no offline/conflict states — can't happen without a network).
- Tests: `electricity-save-serializer.test.ts` (15 unit), `electricity-autosave-engine.test.ts` (8 unit), `ElectricityAutosave.integration.test.tsx` (4 integration), `ElectricityAutosave.workflow.test.tsx` (3 workflow), `ElectricityResumeModal.test.tsx` (2 UI render).
#### Files modified
- `frontend/components/core/ElectricityLabExperienceProvider.tsx` — now also calls `useExperimentState()` directly (same cross-provider pattern Chemistry's `ChemistryLabExperienceProvider` uses via `workspaceContext.hydrateFromSave`) to get `resetExperiment`/`addConnection` for hydration. Added: `pendingResume` state (loaded once on mount, mirroring the existing notebook-load `useEffect`), `getSerializeOptions` (`useCallback`, reused both by the autosave engine's `updateStateGetter` and returns `null` when no experiment is selected — engine no-ops), a dirty-detection `useEffect` (relies on React's own dependency-array reference-equality instead of Chemistry's manual signature-diff string — simpler, same effect), `resumeSave`/`discardPendingResume`. `selectExperiment`/`resumeSave` call `electricityAutosaveEngine.init(...)`; `exitExperiment`/`resetLabSession`/`completeExperiment` call `uninit()` (stop timers) — `resetLabSession`/`completeExperiment` additionally call `clearElectricitySave(...)` (explicit circuit reset or real completion both correctly end resumability; a plain `exitExperiment()` does NOT clear the save — that's the whole point of being resumable).
- `frontend/components/scenes/ElectricityLabScene.tsx` — `ElectricityLabExperienceSection()` now renders `<ElectricityResumeModal>` instead of the catalog/guided panel when `pendingResume` exists and no experiment is selected yet.
- `frontend/components/lab/ElectricityGuidedLabPanel.tsx` — mounts `<ElectricityAutosaveBadge>` next to the exit button.
#### Domain model changes
None to `CircuitComponent`/`CircuitSolution`/`ElectricityLabStepContext`/`SimEvent` — the save snapshot is built entirely from state these systems already expose (components/connections directly; step/evidence/measurement state already added in S9.5/S9.6).
#### What is explicitly NOT persisted (per the "only meaningful domain state" instruction)
Three.js refs, meshes, hover/drag/camera state — none of this exists in either `ExperimentStateProvider` or `ElectricityLabExperienceProvider` to begin with (Electricity Lab's circuit board is fixed-position, unlike Chemistry's freely-placed items), so there was nothing runtime-only to explicitly filter out at serialize time, unlike Chemistry's `hydrateChemistrySave`'s `runtimeDefaults` reset.
#### Tests
- Unit (23): serializer determinism (sorted arrays, identical JSON for identical input), full field round-trip serialize→hydrate, `validateElectricitySaveSnapshot` rejecting every corrupted-field case (bad schemaVersion/missing ids/bad revision/bad circuit/bad experiment sub-fields), `hydrateElectricitySave` throwing on invalid input and falling back cleanly on a corrupted `startedAt`; autosave engine debounce (20 rapid `markDirty()` calls → one write), revision increments per successful flush (continues from `initialRevision`, not reset to 1), `markDirty()`/`flush()` no-ops before `init()` or when the state getter returns `null`, `uninit()` stops timers without touching the already-written snapshot, periodic safety net eventually writes, status-subscription sequence.
- Integration (4, real `ExperimentStateProvider` + real `ElectricityLabExperienceProvider` + real localStorage, "reload" simulated by a full unmount+remount of the provider tree with the same `simulationId`): real progress reaches localStorage under the simulation's key; full reload+resume restores wiring/step/measurements exactly and the restored circuit solves correctly; fuse `isBlown`/switch `isClosed` survive resume (they're just fields on the persisted `components` array); `hintsUsed`/evidence accumulated before reload are honored in the final assessment computed after resume.
- Workflow (3, full realistic sessions): the exact S9.7-requested sequence — start → progress → autosave → recreate provider/session → resume → finish, ending in one notebook entry and the save cleared; Start Over discards the old save and a fresh `selectExperiment()` afterward carries none of the old session's measurements; a wiring mistake made *before* reload and corrected *after* resume is captured correctly on both sides of the reload boundary in the final `measurementErrorsCount`/`selfCorrectionsCount` (evidence-log continuity across a real reload).
- Playwright: not attempted — same accepted, documented SwiftShader/headless limitation as S9.3-S9.6.

#### S9.7 Result (real, from this checkpoint)
**Implemented and fully test-verified.** `npx tsc --noEmit`: 0 errors. Full `npx vitest run`: 573/573 passing (60 files, up from 542/55 at S9.6 — 31 new tests across 6 new files). `npm run lint`: 0 warnings. `circuit-engine.ts`, `nodal-analysis-solver.ts`, `measurement-validation.ts`, `electricity-safety.ts`, `electricity-lab-catalog.ts`, `electricity-evidence.ts`, `electricity-assessment.ts`, backend — **all confirmed untouched**. No 3D scene redesign, no solver changes.

#### ✅ Stage S9.7 — Approved
Approved as following the project strategy: audited both Chemistry's real save infrastructure and Electricity Lab's own (nonexistent) persistence before writing code; confirmed with the user the explicit localStorage-vs-backend architectural fork rather than silently assuming either direction; adapted Chemistry's proven debounce/dirty-detection/status/resume-UX PATTERN without copying its network-coupled implementation, which would not have been "safe reuse" for a system with no backend save path. Committed as `feat(electricity): S9.7 approved`.

### S9.8 - Sandbox UX
#### Goal
Bring Electricity Lab's free-interaction 3D UX (dragging, wiring, camera behavior, hover feedback, reset/recovery) to Chemistry World's production quality — but ONLY by fixing real, concrete gaps found through a first-pass audit, not by rebuilding or redesigning anything that already works.
#### Audit findings (performed before writing any code, per explicit instruction)
A thorough read of `WireDragProvider.tsx`, `ConnectionPoint.tsx`, and the relevant parts of `ElectricityLabScene.tsx`/`CanvasShell.tsx`, cross-checked against Chemistry World's equivalent interaction stack, found **most of the 7 requirement categories were already production-quality and were left untouched**:
- **Wiring UX core mechanics** (drag start/move/commit), **Escape-key cancellation**, and **stuck-drag recovery** (window-level `pointerup` fallback for a pointer released outside the canvas) were already fully implemented in `WireDragProvider.tsx` — including a code comment documenting a past real bug (calling `onConnect` synchronously inside a `setState` updater used to hang the page) and its fix.
- **Camera/drag conflict** was already fully solved: `ElectricityCanvas` passes `orbitEnabled={!draggingFrom}` into the shared `CanvasShell.tsx`, the exact same named mechanism Chemistry World's `ChemistryWorldScene.tsx` uses (`orbitEnabled={!draggingId && !heldId}`) — the two systems were already consistent by design.
- **Reset/recovery**: `ElectricityResetButton` (full circuit + session + S9.7 autosave wipe) and the guided-panel's separate exit button (`exitExperiment()`, which explicitly does NOT touch the S9.7 save, by design, so a mid-experiment exit stays resumable) were already both implemented and already correctly distinct — matches the S9.8 instruction "explicit restart/start-over may clear the relevant save only through the S9.7 persistence API" exactly, with no changes needed.
- **Sandbox feedback**: the existing `circuit-status` panel already has all 4 states including genuine positive reinforcement (green "Ток течёт: I = ..." on a healthy running circuit, not just warnings), and the S9.3/S9.4 measurement-placement/safety-warning banners were already wired and reused, not duplicated.
- **Performance**: all 6 `useFrame` callbacks in the scene were audited line-by-line — zero per-frame allocations found (every `new THREE.*` call already lives inside `useMemo`/one-time setup, not inside any frame loop).
- **Component drag/drop**: confirmed as an intentional, already-documented design constraint, not a gap — Electricity Lab's physical stand has a fixed layout (see `CANONICAL_WIRING` in `electricity-lab-catalog.ts`); components expose only their terminals for wiring, they are not freely draggable like Chemistry's containers/bottles. Attempting to add free dragging here would be "creating a parallel interaction system," explicitly a non-goal.
- **Positive/negative terminal distinction**: already implemented — `Battery`'s two `ConnectionPoint`s are colored red/dark-slate with explicit floating "+"/"−" labels.

**Real gaps found and fixed** (small, surgical, matching the audit exactly):
1. `WireTube` (the 3D wire mesh) was already clickable to remove a connection (and the on-screen instruction text already said so), but had **zero hover feedback** — no cursor change, no visual highlight — so nothing signaled "this wire is interactive" before clicking. Added hover state + `cursor: pointer` + a red highlight/emissive tint on hover (reusing the app's existing red = "danger/remove" color convention).
2. Fixed a genuine bug this surfaced: clicking a wire removes its connection, which unmounts the exact mesh that was just hovered — React Three Fiber does not synthesize a `pointerOut` on unmount, so without an explicit fix the cursor would stay stuck at `"pointer"` after every wire removal until the next unrelated hover. Fixed by resetting the cursor synchronously inside the `onClick` handler itself, not relying on `onPointerOut` ever firing.
3. `Switch`'s body is clickable (toggles open/closed) but showed no cursor affordance either — extended the shared `useHoverTooltip()` hook with an optional `interactive` flag that sets `cursor: pointer` on hover, applied only to `Switch` (the only clickable component body); every other component's call site is unchanged.
4. Escape-to-cancel an in-progress wire drag already worked but was completely undiscoverable (no on-screen indication it existed). Added a small floating hint (`Html`, same visual language as the existing terminal tooltips) next to the in-progress wire preview, visible only during an active drag.
5. The `safety-warnings` banner appeared/disappeared abruptly; Chemistry World's equivalent already fades/slides via `framer-motion`'s `AnimatePresence`. Wrapped Electricity's banner in the identical pattern — cosmetic-only, no data/logic change.
#### Files modified
`frontend/components/scenes/ElectricityLabScene.tsx` only (`useHoverTooltip`, `Switch`, `WireTube`, `PendingWirePreview`, the safety-warnings JSX block, one new `framer-motion` import — already a project dependency, used elsewhere). **`WireDragProvider.tsx`, `ConnectionPoint.tsx`, `CanvasShell.tsx` — confirmed untouched**, since the audit found their mechanics already solid.
#### New files
`frontend/components/core/WireDragProvider.test.tsx` (12 unit), `ElectricitySandboxInteraction.integration.test.tsx` (5 integration), `ElectricitySandboxInteraction.workflow.test.tsx` (1 workflow, full realistic session).
#### Notable finding: `WireDragProvider.tsx` had zero test coverage before this stage
Despite being the exact interaction state machine this whole checkpoint is about, and despite already being production-quality, nothing tested it. Since it's a plain React context provider (no WebGL rendering needed to exercise `startDrag`/`commitDrag`/`cancelDrag`/Escape/window-`pointerup` directly via `renderHook`), this was a genuine, valuable, low-risk testing gap to close — not scope creep, since the tests exercise EXISTING unmodified behavior end to end (proving the S9.8 audit's "already solid" verdict, not just asserting it).
#### Tests
- Unit (12, `WireDragProvider.test.tsx`): start/move/commit (including same-terminal no-op, commit-without-start no-op), cancel via `cancelDrag()`/Escape/global `pointerup` (including Escape-with-nothing-active being a safe no-op), listener cleanup on unmount (no leaked `window` listeners), terminal-position registry (clones the vector, doesn't alias it; unknown id returns `undefined`).
- Integration (5, real `ExperimentStateProvider` + real `WireDragProvider` + real `ElectricityLabExperienceProvider`, connections created through actual drag gestures — `startDrag`→`updatePendingPoint`→`commitDrag` — not raw `addConnection()` calls like every prior stage's tests): the `draggingFrom` boolean contract that gates `orbitEnabled` in the real scene; Escape mid-drag doesn't alter the circuit already built; resetting the circuit **during** an active drag is safe and the drag still resolves correctly afterward (confirmed safe because terminal *positions* never depend on component *values* — the fixed-layout design decision that makes this a non-issue by construction, not something that needed a defensive fix); a short circuit wired through a real drag gesture is caught by the unmodified `checkElectricalSafety()`; a connection made via a real drag gesture correctly marks the S9.7 autosave session dirty and reaches localStorage, exactly like a raw `addConnection()` call would.
- Workflow (1, full session): build a circuit via real drag gestures → make a real wiring mistake (ammeter dragged in parallel) → the same S9.5 `currentStepFeedback` correctly explains it → break the mistaken wires by the real click-to-remove action → reconnect via drag → verify the fix is recognized → full circuit reset → rebuild from scratch → complete the guided experiment normally. Proves the S9.8 UX polish didn't regress any S9.1-S9.7 system.
- Playwright: not attempted — same accepted, documented SwiftShader/headless limitation as S9.3-S9.7.

#### S9.8 Result (real, from this checkpoint)
**Implemented and fully test-verified.** `npx tsc --noEmit`: 0 errors. Full `npx vitest run`: 591/591 passing (63 files, up from 573/60 at S9.7 — 18 new tests across 3 new files). `npm run lint`: 0 warnings. `WireDragProvider.tsx`, `ConnectionPoint.tsx`, `CanvasShell.tsx`, the production solver, `measurement-validation.ts`, `electricity-safety.ts`, `electricity-lab-catalog.ts`, `electricity-evidence.ts`, `electricity-assessment.ts`, the S9.7 autosave/save files, backend — **all confirmed untouched**. `frontend/components/geo/` and `GeoWorldScene.tsx` — untouched (unrelated in-progress work, explicitly out of scope per instruction).

#### ✅ Stage S9.8 — Approved
Approved as following the project strategy: audited first, found most of the requirement checklist already production-quality, and changed only what the audit actually flagged as a real gap (five small, named fixes, all in one file) rather than reworking an interaction layer that already worked. Also closed a genuine pre-existing test-coverage gap on the interaction state machine itself. Committed as `feat(electricity): S9.8 approved`.

### S9.9 - Final Production Polish & Regression
#### Goal
Final production hardening and clean close-out of the Electricity Lab module: full-stack audit, final acceptance-checklist verification, real regression fixes only (no new features, no rewrites), performance re-check, small UI consistency fixes, full regression suite, and final documentation — including handing off to GeoWorld as the next project focus.
#### Audit findings and what was actually changed
A full-stack audit (solver, measurement validation, safety, guided experiments, assessment/evidence, notebook/report, autosave/resume, sandbox interaction, UI feedback, AI context) found the module overwhelmingly solid — every subsystem from S9.1-S9.8 was re-checked against the final acceptance list and confirmed correct by existing tests, with two genuine, narrow gaps closed:
1. **Bridge networks were never explicitly tested with a real bridging element.** The existing "bridge-like network" test in `nodal-analysis-solver.test.ts` (from the original Option B spike) is actually two independent parallel branches with no element connecting their midpoints — solvable by simple series/parallel reduction, not the textbook case that requires true nodal analysis. Added two new tests with a genuine 5-resistor Wheatstone bridge: a balanced case (hand-verifiable fact — a balanced bridge carries exactly zero current, independent of the bridge resistor's value) and an unbalanced case (verified via Kirchhoff's Current Law holding at both internal nodes, an independent physical check rather than a hand-transcribed matrix solution that risks arithmetic error). Both passed on the first run with zero solver changes — confirms the Nodal Analysis architecture (chosen in S9.2 specifically because it generalizes to any topology, unlike the old DFS solver) was already correct for this case; the gap was in test coverage, not in the solver.
2. **One real, minor UI inconsistency**: the `circuit-status` "Ток течёт" success message was missing a space between the voltage value and its unit (`12.0В` instead of `12.0 В`) — the only such inconsistency found after checking every unit-labeled string in the Electricity Lab UI against the rest, which was already consistent. Fixed.

Everything else audited and found already correct, with no changes made: series/parallel/mixed circuit calculations, Ohm's Law, ammeter/voltmeter placement validation and feedback text, short-circuit/overload/fuse/unsafe-connection detection, safety UI, the full guided-experiment lifecycle (gating/hints/restart/completion), assessment/evidence/teacher-analytics, notebook/report, autosave/resume/start-over/reload-recovery, and the entire sandbox interaction layer (drag/drop, wiring, wire removal, Escape cancellation, camera lock, reset/recovery) — all already verified by the accumulated S9.1-S9.8 test suite, re-run clean as part of this checkpoint's regression pass.
#### Performance
Re-verified, no changes: the S9.2 solver benchmark (0.02-0.09ms/solve, 60-450x under the 5ms/frame budget) and S9.8's per-`useFrame`-callback allocation audit (zero allocations found in any of the 6 frame-loop callbacks in the scene) both still hold — nothing since S9.8 touches either the solver's hot path or the render loop, so no new benchmark was needed, only confirmation the existing one is still representative (full test suite, including the benchmark test file, still passes clean).
#### Playwright status (one bounded reproduction attempt, per explicit instruction)
Ran `npx playwright test e2e/electricity-lab.spec.ts` once. It failed at the very first step (`registerAndLogin` helper) with `ECONNREFUSED ::1:8000` — the backend FastAPI server was not running in this session (frontend dev server wasn't either). This is a *different* failure mode than the previously-documented SwiftShader/headless pointer-hang (which requires the app to actually be reachable and rendering before it manifests) — this run never got that far. Per the explicit instruction not to spend this stage debugging unrelated infrastructure, starting and provisioning a full backend+frontend server stack (including seeding a test user) was judged out of scope for a single bounded check. Honest status: the SwiftShader/headless issue documented since S9.3 was not re-confirmed this checkpoint, but nothing here contradicts it either — Playwright coverage for Electricity Lab remains genuinely unverified end-to-end, same as every prior S9 checkpoint, substituted for by the 3-tier Vitest suite throughout.
#### Files modified
`frontend/lib/nodal-analysis-solver.test.ts` (2 new tests, no production code touched), `frontend/components/scenes/ElectricityLabScene.tsx` (one-character whitespace fix). Nothing else.
#### Tests
2 new unit tests (Wheatstone bridge, balanced + unbalanced) added to `nodal-analysis-solver.test.ts`, bringing it to 16/16. No other new test files this checkpoint — S9.9's job was verification and narrow fixes, not new feature surface, so no new integration/workflow suites were needed beyond what S9.1-S9.8 already built.

#### S9.9 Result (real, from this checkpoint)
**Full-stack audit complete, two real gaps closed, all regressions verified.** `npx tsc --noEmit`: 0 errors. Full `npx vitest run`: **593/593 passing (63 files)**, up from 591/63 at S9.8 (+2 bridge-network tests). `npm run lint`: 0 warnings. No production solver/measurement/safety/guided-experiment/assessment/autosave/interaction logic was changed — only test coverage added and one whitespace fix. `frontend/components/geo/` and `GeoWorldScene.tsx` — confirmed untouched (unrelated in-progress work, explicitly out of scope).

#### ✅ Stage S9.9 — Approved — Electricity Lab module complete
Approved as the final checkpoint of Stage S9: a genuine full-stack audit (not a rubber stamp) that found the module already overwhelmingly production-ready, closed the two real gaps it actually found (bridge-network test coverage, one UI whitespace inconsistency), left everything else untouched per instruction, and re-verified the complete regression suite clean. Committed as `feat(electricity): S9.9 approved`.

---

## 4. Electricity Lab — Final Module Summary (S9.0-S9.9 complete)

### Architecture
- **Production circuit solver** (`circuit-engine.ts` → `nodal-analysis-solver.ts`): Nodal Analysis via Gaussian elimination with partial pivoting over node voltages, chosen in S9.1/S9.2 specifically because it generalizes to any resistor-network topology (series, parallel, mixed, and bridge networks — all verified), unlike the original DFS single-loop solver it replaced. `solveCircuit()` is a one-line delegation, preserving the original public contract/types.
- **State**: `ExperimentStateProvider.tsx` (circuit components/connections/events, plain `useReducer`) and `ElectricityLabExperienceProvider.tsx` (guided-experiment session: selected experiment, step index, measurements, evidence, hints, autosave) are sibling React contexts, both always mounted together in `ElectricityLabScene.tsx`; the latter reads the former via `useExperimentState()` for autosave hydration (S9.7) while receiving `components`/`connections`/`solution` as a prop for gating logic — the same split pattern Chemistry World uses.
- **Measurement validation** (`measurement-validation.ts`, S9.3): pure topology functions (ammeter-in-series / voltmeter-in-parallel checks) shared by the live meter displays, the safety system, and guided-experiment step gating — one source of truth.
- **Safety system** (`electricity-safety.ts`, S9.4): pure function of the already-solved circuit state; reuses Chemistry World's `SafetyWarning` type and S9.3's placement checks rather than redefining either.
- **Guided experiments** (`electricity-lab-catalog.ts`, upgraded S9.5 from the pre-existing Stage E-2 catalog): 8 experiments across 3 difficulty tiers, every step's unlock condition and every experiment's completion condition reads real solver/measurement/safety state.
- **Assessment & evidence** (`electricity-evidence.ts` + `electricity-assessment.ts`, S9.6): a discrete, append-only log of real state transitions (not frame noise) feeding a deterministic 4-category score — explicitly modeled on Chemistry World's *actually-used* live assessment engine, not its unused, heavier evidence-ID prototype (a real architectural distinction discovered and deliberately not copied).
- **Notebook/report** (`electricity-notebook.ts`, Stage E-2, extended S9.6): the single data structure behind both the student-facing report and the teacher-analytics view — same principle Chemistry World uses, no duplicate storage.
- **Autosave/resume** (`electricity-autosave-engine.ts` + `electricity-save-schema.ts`/`-serializer.ts`, S9.7): debounced, localStorage-only by an explicit, user-confirmed architectural decision (Electricity Lab never had backend persistence, unlike Chemistry World's real REST-backed save API) — same PATTERN as Chemistry's engine (debounce/dirty-detection/status-subscription/periodic-safety-net), independently implemented rather than reusing Chemistry's network-coupled code.
- **Sandbox interaction** (`WireDragProvider.tsx`, `ConnectionPoint.tsx`, pre-existing, audited not rebuilt in S9.8): pointer-driven wire creation with Escape-cancellation and stuck-drag recovery, camera-lock during drag consistent with Chemistry World's identical mechanism, and a fixed physical component layout (an intentional, documented design constraint, not a limitation).
- **AI context** (`ai-context-builder.ts`): `LabExperienceAIContext`, extended in S9.6 with real evidence/assessment numbers, feeding the existing `AITeacherChat`/`/api/ai/teacher` pipeline shared with Chemistry World — no new AI system built for Electricity Lab at any point in S9.

### Major capabilities (end to end, all real and tested)
A student can: browse and select from 8 guided experiments (unlocked by real progress); build a real circuit via drag-to-wire interaction with live physics (Ohm's Law, series/parallel/bridge topologies, short-circuit and fuse-overload detection); get real-time, non-scripted feedback when an ammeter/voltmeter is misplaced or the circuit is unsafe; record measurements and answer embedded questions; receive a deterministic, evidence-based 4-category assessment with a teacher-readable note on completion; close the tab mid-experiment and resume later with wiring/step/measurements/hints/evidence intact, or explicitly start over; and have an AI teacher chat that can reference the student's real recent measurements, mistakes, and score.

### Test count and results (final, S9.9)
**593/593 Vitest tests passing across 63 files**, `npx tsc --noEmit` 0 errors, `npm run lint` 0 warnings — all three commands clean as of the S9.9 commit. Coverage spans unit (pure solver/validation/assessment/serializer logic), integration (real providers + real solver, no mocks), and workflow (full realistic multi-step student sessions) tiers for every subsystem built in S9.1-S9.9. Playwright E2E remains blocked by a pre-existing, machine-level SwiftShader/headless environment issue first documented in S9.3 and re-attempted (unsuccessfully, for an unrelated infrastructure reason — see S9.9 section above) in S9.9; it was never the substitute test layer for this module — the 3-tier Vitest suite was, throughout.

### Known limitations (final, honest)
1. No live-browser/Playwright verification of the actual rendered UI, console cleanliness, or real pointer/WebGL behavior — substituted throughout by unit/integration/workflow tests against the real (non-WebGL) parts of the stack.
2. Autosave is localStorage-only (explicit S9.7 decision) — no cross-device sync, lost if browser storage is cleared; only one in-progress guided-experiment session can exist per simulation at a time.
3. No keyboard-only (non-pointer) way to create a wire connection — only Escape-to-cancel has keyboard support; a full keyboard-driven alternative would be a new interaction system, explicitly out of scope throughout S9.
4. Backend `TASK_TOPICS` (`progress_service.py`) doesn't know guided-experiment IDs, so guided-experiment completions don't yet feed `strong_topics`/`weak_topics` in the aggregate learning profile — a real, confirmed, backend-side gap, out of scope for what was a frontend-only initiative (S9.1-S9.9 never touched the backend).
5. "Teacher analytics" is per-attempt data on the student-facing notebook/report, not a separate multi-student teacher dashboard — matches Chemistry World's own architecture (which has no such dashboard either).
6. Component drag/drop (moving the physical components themselves, not just wiring) was never implemented — confirmed throughout as an intentional, documented design constraint of Electricity Lab's fixed circuit-board layout, not a gap.

### Future optional improvements (not required, not started, purely for a future stage if ever prioritized)
- Backend-synced autosave (the S9.7 schema is already versioned and shaped for this migration without a reshape).
- Keyboard-accessible wiring as a genuine second input path.
- Extending `TASK_TOPICS` to recognize guided-experiment IDs for richer weak/strong-topic analytics.
- Component drag/drop, if a future design decision moves away from the fixed-layout board.
- Re-running Playwright once a working dev/backend server pairing is available in this environment.

### Electricity Lab is complete.
### Next project focus: GeoWorld.

## 5. GeoWorld Handoff — existing uncommitted work to review and continue (NOT started this checkpoint)
Per explicit instruction, S9.9 did **not** begin GeoWorld work — this section only records what already exists, uncommitted, in the working tree, left by prior (non-Claude) work, for whoever picks up GeoWorld next:
- **`frontend/components/geo/GlobeControls.tsx`** — new, untracked file (~10.5KB), a custom camera-control component for the globe.
- **`frontend/components/scenes/GeoWorldScene.tsx`** — small uncommitted diff (+6/-1 lines): imports and mounts the new `<GlobeControls />` inside the canvas; passes `orbitEnabled={false}` to `CanvasShell` (disabling the shared/default `OrbitControls` for GeoWorld specifically, in favor of `GlobeControls`'s own camera handling); disables the Earth group's per-frame auto-rotation in `EarthLayers`'s `useFrame` (the clouds layer still rotates independently) — a code comment already in place explains why: "spinning the group under the camera makes the surface drift mid-interaction."
- This is genuinely in-progress, internally consistent work (not a broken half-edit) — the next session should **review and continue it, not restart from scratch or revert it**. Nothing in S9.1-S9.9 touched, reviewed in depth, or made any judgment on the correctness of this GeoWorld work — it was deliberately left completely alone throughout, per explicit instruction each stage.