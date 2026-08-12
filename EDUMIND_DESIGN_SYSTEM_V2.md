# EduMind 3D — Design System V2

Status: **APPROVED — implementation in progress.** Sections 0–18 below are the original presentation-layer architecture (approved). Sections 19+ extend it to the full product (Public → Auth → Student/Teacher) per the 2026-08-08 follow-up brief, with a revised D0–D14 roadmap that supersedes the old D0–D9 table. **D0–D4 are done** (foundational tokens/primitives + theme system + Public Landing + Auth experience + authenticated AppShell, §28–§30). **D5 (Student Home + Student Profile) is done** (§31), **D5.1** and **D5.2** (Student Dashboard visual rework + centered composition, both visually approved) are done — see §32–§33. **D6 (Immersive SimulationShell + Floating Glass HUD) is done** (§34, accepted as a baseline pending the D6.1 corrections below). **D6.1 (Immersive Visual Polish + Theme + Full RU/EN/TG Integration) is done** — see §35. **D6.2 (Remaining Lab UI Theme/i18n Cleanup) is done, approved.** **D7 (Teacher Learning Analytics Center + test-data cleanup — redefined by the user at D7 time; supersedes §27's original "Chemistry World visual migration" plan for this slot) is done, code-verified, awaiting manual visual approval** — see §37. D8 has not started.

## 0. Why this document exists
Current frontend architecture audit (2026-08-08) found **no prior redesign/design-system document** in the repo. Searched: `*design*.md`, `*redesign*.md`, `*ui*.md`, `*ux*.md`, `*vision*.md`, `*app-shell*.md`, `*design-system*.md`, `*frontend-plan*.md`, `*visual*.md` (none, outside `node_modules`), and `HANDOFF.md` for design/UI/UX/AppShell/layout/theme keywords — every hit is a point-fix changelog entry (autosave badges, fullscreen overflow bug, guided-lab panel tests), not an architectural plan. The `.glass-panel` / `neon-*` utility classes in `tailwind.config.ts` and `globals.css` reference a "дизайн-система Stitch" in their comments — that's the *current* look being replaced, not a document to build on. This file is the first canonical design plan and supersedes nothing.

## 1. Current-state audit (minimum needed to plan)

| Layer | File | Finding |
|---|---|---|
| App shell | `app/(app)/layout.tsx` | Fixed `w-64` sidebar + fixed `h-20` navbar, `<main className="ml-64 p-8 pt-24">`. Classic admin-dashboard skeleton — content is always offset by permanent chrome, on every route including simulation pages. |
| Sidebar | `components/ui/Sidebar.tsx` | Permanent 256px rail, always visible, never collapses. |
| Navbar | `components/ui/Navbar.tsx` | Transparent bar, just user menu — no page identity, no breadcrumbs. |
| Simulation shell | `components/scenes/CanvasShell.tsx` | 3D canvas is a **bounded card**: `h-[34rem]` (544px) with rounded corners/border/shadow unless `isFullscreen` — canvas competes for space with page chrome instead of owning the viewport. |
| Simulation page composition | `ChemistryWorldScene.tsx` (`ChemistryWorldInner`, ~L3530-3713), and structurally identical in `ElectricityLabScene.tsx` | Canvas + a **long vertical stack of `glass-panel` cards below it** (instructions, sound/debug toggles, tutorial panel, active-container selector, quality selector, safety warnings, `ExperimentPanel`, `GuidedLabPanel`/`LabModeSelector`, `LabNotebookPanel`), with `ChemistryTeacherChat` as a **fixed-width side column** (`lg:flex-row`). This is exactly the "SaaS dashboard containing a 3D iframe" pattern the redesign targets. |
| Visual language | `globals.css`, `tailwind.config.ts` | Dark-only (`surface-deep #020617` → `surface-container-highest #2e3447`), indigo/cyan/violet neon accents, `.glass-panel` (dark translucent + inset rim-light + neon glow shadow), heavy `font-mono` uppercase-tracking labels everywhere (HUD/terminal aesthetic), `pulse-glow` neon keyframe. Reusable primitives exist (`.glass-panel`, `.rim-light`, `.neon-glow-*`) but are dark-only and visually loud (glow shadows on every card) — a good *mechanism* (translucency + blur + border) to keep, wrong *tuning* to keep. |
| Fullscreen | `lib/useFullscreen.ts` (via `CanvasShell`/`*Scene.tsx`) | Real, working, recently hardened against a scrollbar/overflow bug (`globals.css` `scrollbar-gutter: stable`, `CanvasShell`'s height-snap comment). Must not be touched carelessly. |
| Camera/locomotion | `CanvasShell.tsx`, `sandbox-locomotion.ts` | Two working camera modes (`orbit`, `sandbox`/FPS with WASD), collider registry, reach-checks. Pure interaction logic, zero coupling to the panel layout above — safe to leave untouched while the shell around it changes. |
| Dashboard/catalog | `app/(app)/dashboard/page.tsx`, `components/ui/LessonCard.tsx` | Plain search bar + responsive card grid, per-module neon accent color. Reasonable bones, generic "admin panel" skin. |
| Quality/perf | `lib/quality-context.tsx` (`QUALITY_PRESETS`) | Existing low/medium/high DPR + shadow + bloom + contact-shadow presets, already threaded through `CanvasShell`. Redesign must keep using this, not reinvent it. |

**Engines explicitly not audited** (per instruction): chemistry/reaction/safety/pour engines, electricity circuit engine, GeoWorld globe/geo engines, AI context builders, autosave/save-serializer, backend. These are logic, not presentation, and this document does not touch them.

## 2. Design philosophy

**"An interactive scientific world, not a SaaS dashboard with a 3D iframe."**

The 3D simulation is the primary surface a student looks at, not a widget embedded in a page. Chrome (navigation, AI teacher, controls, measurements) is a set of **floating instruments** the student can summon, dismiss, and collapse around the world — never a fixed frame that shrinks it. Every permanent, always-on UI element is a tax on the 3D canvas's screen share; it must justify its permanence.

Three rules that resolve every layout dispute below:
1. **3D space first.** On a simulation page, the 3D world gets ~75–90% of visual attention. If a panel competes with the canvas for area at rest, it's wrong — collapse it, dock it thin, or make it contextual.
2. **Floating, not framing.** Panels sit *on top of* the world (translucent, elevated, dismissible), not *beside/below* it in a layout grid. The world's bounding box is the viewport, not a card.
3. **Contextual, not permanent.** Show controls/warnings/steps only when they're relevant to what the student is doing right now. A permanent 40%-height stack of "everything the student might ever need" is the anti-pattern being removed.

## 3. Color strategy

Move off saturated near-black (`#020617`) + neon-glow-on-everything toward a **calmer, brighter, more neutral spatial palette**, while keeping dark mode as a first-class option (this is a lab/study tool used in evening hours too).

- **Base surfaces**: replace the `surface-*` navy scale with a neutral spatial scale — light mode anchored near a soft warm-gray/off-white (not stark white), dark mode anchored near a deep neutral charcoal (not saturated indigo-black). Brand indigo becomes an *accent*, not the ambient tint of every shadow.
- **Glass surfaces**: keep the `.glass-panel` mechanism (translucency + blur + hairline border) but drop the permanent colored glow (`0 0 15px rgba(99,102,241,0.1)` on every panel) — glow becomes a state signal (active/selected/alert), not decoration. Panel backgrounds go semi-transparent neutral, not semi-transparent navy.
- **Module accent colors are kept** (indigo/cyan/violet/emerald per module in `LessonCard`) — they're a working wayfinding device (SimLab/GeoWorld/Electricity/Chemistry each has a color identity) and should carry into the new floating panel borders/badges for that module, at reduced intensity.
- **Semantic colors unchanged in meaning**: red/amber for safety and hazard states (`SafetyWarning`, emergency stop) keep their current saturation — these are the one place "loud" is correct, they're warnings.
- **No neon-cyberpunk, no HUD glow spam.** Reserve glow for: focus rings, active/selected state, and genuine alerts. Not idle decoration.

## 4. Typography

- Current stack (`--font-body`, `--font-headline`, `--font-mono`) is kept structurally — no font-loading rework needed.
- `font-mono` is currently overused for ordinary labels ("Мои симуляции", quality toggles, module tags) to fake a HUD/terminal look. Reserve mono for what's actually monospace-shaped data: measurements, coordinates, revision/version numbers, code-like state. Ordinary UI labels move to the sans/headline pair.
- Reduce uppercase-tracked mono labels as the default text treatment; use them sparingly as small eyebrow/kicker text, not as the default paragraph style for instructional copy (readability matters more here — this is a *learning* product).
- Establish a real type scale (display/title/body/caption + line-height pairs) as design tokens rather than ad hoc `text-sm`/`text-xs`/`text-2xl` picked per component.

## 5. Spacing / radius / shadow system

- Introduce a small numeric spacing scale as Tailwind theme tokens (4/8/12/16/24/32/48) instead of the current freehand `p-3 sm:p-5`, `gap-4`, `mt-4` mix — same values roughly, but named/tokenized so floating panels share consistent rhythm.
- **Radius**: go larger on floating surfaces (`rounded-2xl`/`rounded-3xl` already used in places — standardize on one "large-radius spatial surface" token, e.g. 20–24px, for all floating panels/cards) vs. small radius (8–10px) for inline controls/buttons/pills.
- **Shadow**: replace neon-tinted glow shadows with soft, mostly-neutral elevation shadows (large blur, low opacity, slight cool or warm tint depending on light/dark) — the "floating glass above a bright world" look, not "glowing terminal panel."

## 6. Glass / translucent surface rules

Keep `.glass-panel` as the one reusable primitive, retune it:
- Background: neutral translucent (light: white/70–80% + blur; dark: neutral charcoal/60–70% + blur) instead of navy/60%.
- Border: hairline neutral (`rgba(0,0,0,0.08)` light / `rgba(255,255,255,0.08)` dark) as default; accent-colored border only when the panel is "owned" by a module or in an active/selected state.
- Blur: keep `backdrop-filter: blur(16px)` — it's the single biggest contributor to the "floating over the world" feel and is cheap.
- Elevation via shadow, not glow, by default (see §5).
- **When to use glass vs. solid**: glass for anything floating over the 3D canvas (top bar, AI teacher, guided-step card, tool tray). Solid/opaque surfaces for anything in a scroll-heavy, text-dense context off the canvas (dashboard cards, notebook/report content, settings) — glass-over-text-heavy-content hurts readability and isn't the point there.
- Nested glass-on-glass (a glass panel inside a glass panel) is explicitly disallowed — this is the literal "cards inside cards" pattern called out as an anti-pattern.

## 7. AppShell redesign

Replace the permanent 256px sidebar + full-width offset `<main>` with:
- A **thin, collapsible left rail** (icon-only by default, ~64–72px, expandable on hover/click to show labels) for global navigation (dashboard, teacher view, profile) — present on non-simulation pages (dashboard, teacher, profile) at moderate weight, but **absent/auto-hidden on simulation pages**, where it's replaced entirely by the floating top bar's "back" affordance (§9).
- No fixed navbar. User menu/logout moves into the rail (bottom) or a corner menu, not a permanent full-width transparent header eating vertical space on every page.
- `<main>` no longer carries a hardcoded `ml-64 p-8 pt-24` — layout offset becomes a CSS variable driven by rail state (collapsed/expanded), and simulation pages opt out of the padded-content shell entirely (they render edge-to-edge).

## 8. Navigation redesign

- Dashboard/teacher/profile keep a conventional (if restyled) page shell — these are list/text-heavy screens, not spatial ones; no need to force "floating panel" language where a normal page works better.
- Simulation pages get **no persistent app-level nav chrome** — navigation there is exactly one floating control: "back" in the top bar (§9). This is the biggest single change: today `app/(app)/layout.tsx` wraps every route including `chemistry_world/[id]` in the same sidebar+navbar shell.
- Route structure (`(app)/chemistry_world/[id]`, etc.) is unchanged — this is a shell/layout change, not a routing change.

## 9. Simulation page architecture

Target structure (Chemistry/Electricity/SimLab/GeoWorld all converge on this shape):

```
┌───────────────────────────────────────────────────────────┐
│  ↖ floating top bar (glass): back · title · progress · ⛶ · ⚙ │
│                                                               │
│  [opt. left tool  │                        │  [opt. right    │
│   tray: floating]  │      3D CANVAS         │   AI Teacher:   │
│                     │   (fills remaining     │   floating,     │
│                     │      viewport)         │   collapsible]  │
│                     │                        │                 │
│         [floating guided-step card, bottom-left/center]        │
│         [contextual bottom control bar — only relevant ctrls]  │
└───────────────────────────────────────────────────────────┘
```

- `CanvasShell` stops being a bounded `h-[34rem]` card at rest — on simulation routes it becomes the full viewport height minus the floating top bar's touch area (top bar overlays on top via `position: fixed/absolute` + z-index, it does not reserve layout height). Fullscreen becomes the *default visual impression*, not a special mode — `isFullscreen` toggle stays as a real feature (true OS/browser fullscreen) but the non-fullscreen state should already look like "the world fills the screen," just windowed.
- The current stacked card column (instructions, toggles, tutorial, container selector, quality, safety, `ExperimentPanel`, `GuidedLabPanel`, notebook) is **redistributed**, not deleted:
  - Persistent/frequent → floating top bar or thin bottom bar.
  - Occasional/contextual (safety warnings, hazard alerts) → transient overlay near the relevant object or top-of-canvas toast, auto-dismiss/collapse.
  - Deep/optional (lab notebook, full experiment catalog, quality settings) → slide-out panel or modal triggered from the top bar's `⚙`, not permanently on-screen.
  - AI Teacher chat → right-side floating panel, collapsible to a small tab/icon (see §10).
- Module-specific 3D content (glass library, cabinets, room, workbench in Chemistry; circuit board in Electricity; globe in GeoWorld) is untouched — this is presentation-shell work only.

## 10. Floating AI Teacher UX

- Default state: **collapsed to a small floating avatar/tab** on the right edge (or bottom-right), not an always-open chat column consuming ~25% width as it effectively does today via `lg:flex-row` beside the canvas.
- Expanded state: floating glass panel, fixed max-width (e.g. 360–400px), full-height or docked-height on the right, dismissible/collapsible without navigating away or losing chat history (keep it mounted, just visually collapsed — `ChemistryTeacherChat`'s internal state/history logic is untouched).
- Never reserves canvas layout space when collapsed — it overlays, it doesn't push.
- Same component contract (`context`, `onMessageSent`, `showFullHints`) — this is a wrapper/positioning change around `ChemistryTeacherChat`/`AITeacherChat`, not a rewrite of their logic.

## 11. Guided experiment UX

- `GuidedLabPanel`'s current content (title, step counter, autosave badge, exit) moves into a **compact floating step card**, anchored bottom-left or bottom-center over the canvas, not a full-width block stacked in page flow.
- Step detail (goal/safety-briefing/explain text, hint, advance button) expands from that compact card on demand rather than always showing full step content inline — keeps the default footprint small, matching §2 rule 3.
- Experiment catalog / mode selector (`ExperimentCatalogBrowser`, `LabModeSelector`) move behind an explicit "choose experiment" entry point (top bar or an initial overlay before entering the world), not a permanently visible section.
- Completion screen (`CompletionScreen`) stays a full overlay/modal — that's already the right pattern for a terminal state.

## 12. Fullscreen behavior

- `lib/useFullscreen.ts` and the recent overflow/scrollbar fix in `globals.css` + `CanvasShell.tsx` (`scrollbar-gutter: stable`, immediate height-snap vs. animated border-radius/shadow only) are **not touched**. The redesign changes what surrounds the canvas, not the fullscreen mechanism itself.
- Because the windowed state will already look near-fullscreen (§9), the *visual* jump between windowed and fullscreen shrinks — good, reduces the layout-shift risk class that caused the original overflow bug — but the same care (measure before animating, snap layout-affecting properties, animate only cosmetic ones) applies to any new floating-panel show/hide transitions near the fullscreen boundary.

## 13. Responsive rules

- Desktop is primary; the floating-panel model degrades on smaller viewports as follows:
  - Left tool tray and right AI Teacher panel: collapse to icon-only / bottom-sheet-triggered on narrow viewports rather than sitting side-by-side with the canvas.
  - Top bar: stays, but non-essential items (settings, secondary progress detail) collapse into an overflow menu below a breakpoint.
  - Bottom guided-step card and contextual controls: full-width bottom sheet on narrow viewports instead of a floating card.
- Must not regress: fullscreen, WASD/sandbox locomotion, pointer/touch drag interactions (`ChemistryDragProvider`, `WireDragProvider`, `ComponentDragProvider`), or existing accessibility behavior (focus rings, `aria-label`s already present on controls like `guided-lab-exit`).
- No new dependency on hover-only interaction for anything functionally required (collapsed panels must have a tap/click affordance, not hover-only reveal).

## 14. Reusable component inventory (net-new shared primitives)

To build once in D1 and reuse across D3–D6:

- `FloatingPanel` — the retuned glass surface (§6), with variant props for docking (top-bar / left-rail / right-dock / bottom-sheet / free-floating) and collapse state.
- `TopBar` — simulation-page floating header (back, title, progress, fullscreen toggle, settings trigger), replaces per-scene ad hoc headers.
- `CollapsibleSidePanel` — used for AI Teacher (§10) and optional left tool tray; handles the collapsed-tab ↔ expanded-panel transition.
- `StepCard` — compact floating guided-experiment step UI (§11).
- `ContextualToast` / `HazardOverlay` — replaces the permanently-mounted safety-warnings block with transient, positioned alerts.
- `MeasurementBadge` — small spatial overlay widget for readouts (temperature, mass, voltage, etc.) anchored near the relevant 3D object via `<Html>` (drei), instead of a text line in a side panel.
- Design tokens: color, spacing, radius, shadow, type-scale as Tailwind theme extensions (§3–§5), consumed by all of the above.

These are additive to, not replacements for, the existing domain components (`GuidedLabPanel`, `ChemistryTeacherChat`, `ExperimentPanel`, etc.) — those keep their state/logic and get re-skinned/re-positioned using the new primitives.

## 15. Migration strategy

- **Additive-first**: new tokens and primitives (`FloatingPanel`, `TopBar`, etc.) are built alongside the existing `.glass-panel`/Tailwind theme, not by ripping out the old classes in place — avoids a big-bang break across four simulation modules at once.
- **One module at a time** after the shell/AppShell/tokens land (D3 before D4–D6): pick Chemistry World first (largest, most representative — confirmed via this audit), validate the pattern, then port Electricity (near-identical structure per HANDOFF.md history) and GeoWorld.
- **No engine/domain-provider changes.** Every migration step only touches the render/layout tree of `*Scene.tsx` files and the panel components' JSX shell — not `ChemistryWorkspaceProvider`, `ChemistryInteractionProvider`, autosave, safety, reaction, or any `lib/*-engine.ts` file.
- **Feature-by-feature parity check** before closing each module's stage: every current panel/control must have a home in the new layout (moved, collapsed, or made contextual) — nothing silently dropped.
- Old `.glass-panel`/neon utility classes stay in `globals.css` until the last consuming module migrates off them, then get removed in D9 cleanup — not deleted early.

## 16. What must NOT be changed

- Physics, chemistry, electricity, GeoWorld domain engines and their tests.
- AI context builders and AI Teacher backend contract (`/api/ai/teacher`, `ChemistryAIContext`/`LabAIContext` shapes).
- Backend, autosave engine, save serializer/hydrator, offline sync, resume flows.
- Progress/assessment/experiment-validation logic.
- `useFullscreen.ts` mechanics and the scrollbar/overflow fix already in place.
- Camera modes (`orbit`/`sandbox`), collider/reach system, WASD locomotion.
- Route structure under `app/(app)/...`.
- Sound engine (`chemistry-sound.ts`) and its trigger points.
- Existing `data-testid` hooks used by tests/Playwright-style checks, unless a component they're on is genuinely restructured — in that case tests get updated in the same stage, not left broken.

## 17. Accessibility requirements

- Preserve and extend current baseline: visible focus rings (`focus-visible:ring-2`), `aria-label`s on icon-only controls — every new floating/collapsed control (collapsed AI Teacher tab, collapsed tool tray, top-bar icons) needs the same.
- Collapsed-by-default panels must be keyboard-reachable and screen-reader-announced (expanded/collapsed state), not purely a hover reveal.
- Maintain `prefers-reduced-motion` handling (`usePrefersReducedMotion` pattern already used in Chemistry World) for all new panel enter/exit and collapse/expand transitions.
- Color contrast: brighter/lighter surface option (light mode, §3) must be checked against text contrast independently of the current dark-mode-only assumption baked into today's palette.
- Maintain minimum tap-target sizes for floating controls, especially collapsed tabs/icons on touch.

## 18. Performance requirements

- No regression to `QUALITY_PRESETS` (`lib/quality-context.tsx`) behavior — DPR/shadow/bloom/contact-shadow scaling stays wired through `CanvasShell` exactly as today.
- New floating panels use CSS `backdrop-filter: blur` (already proven cheap in this codebase via `.glass-panel`) — avoid introducing additional expensive full-screen blur layers stacked on top of each other (no glass-on-glass, §6, is also a perf rule, not just visual).
- Panel mount/unmount vs. show/hide: prefer CSS-visibility/collapse (keep mounted, animate) over full unmount/remount for frequently toggled panels (AI Teacher, step card) to avoid re-fetching/re-computing context on every open — consistent with `ChemistryTeacherChat` already keeping its own message history in state today.
- Canvas resize: since the canvas now resizes far less often (it's viewport-sized at rest instead of toggling between card-size and fullscreen), this should *reduce* R3F `ResizeObserver` churn versus today, not increase it — but any new layout-affecting panel animation near the canvas must follow the same "snap layout, animate cosmetics only" rule from the existing fullscreen fix (§12).

## 19. Product architecture — Public → Auth → Student/Teacher → 3D worlds

EduMind 3D is not just an authenticated dashboard with simulations bolted on. The full product flow:

```
PUBLIC LANDING (/)
      │  "Get Started" / "Sign In"
      ▼
LOGIN / REGISTER  (auth)
      │  AuthProvider resolves session + role
      ▼
AUTHENTICATED APP SHELL
      │
      ├── role = student ──▶ STUDENT EXPERIENCE ──▶ 3D LEARNING WORLDS
      │                       (Home, Profile)         (Chemistry/Electricity/
      │                                                 SimLab/GeoWorld)
      └── role = teacher/admin ──▶ TEACHER EXPERIENCE
                                    (Home, Class/Students, Student Detail,
                                     Profile/Settings)
```

Today `app/page.tsx` immediately redirects everyone to `/dashboard` or `/login` — there is no public landing, and `/dashboard` (the old "Мои симуляции" grid) is the same screen for every role. This section defines the real product shell around the existing simulation/auth/progress systems, all of which are kept exactly as-is (§16).

## 20. Route inventory & migration matrix

Full inventory of `frontend/app/**/*.tsx` (route/domain-engine files were not read for this pass, only route shells and the auth/profile/teacher pages needed to know what real data exists — see §0/§1 for the prior presentation-layer audit).

| Current route | Current purpose | New design destination | Audience | Stage | Status |
|---|---|---|---|---|---|
| `/` (`app/page.tsx`) | Client-side redirect only (`user ? /dashboard : /login`), renders nothing | Real public Landing page (navbar, hero, world showcase, how-it-works, AI Teacher, student/teacher sections, CTA, footer). Redirect logic narrows to: authenticated users hitting `/` still bounce to their home; unauthenticated users see the Landing instead of `/login` | Public | D2 | **Done — see §28** (redirect removed entirely; authenticated users see the Landing too, per the D2 brief's explicit instruction, not just a narrower redirect) |
| `/login` (`(auth)/login/page.tsx`) | Email/password form, `AuthLayout` glass card on gradient-orb background | Redesigned auth panel (visual/spatial side + focused glass or solid form side), same `useAuth().login` contract | Public | D3 | **Done — see §29** |
| `/register` (`(auth)/register/page.tsx`) | Registration form | Redesigned auth panel, same `useAuth().register` contract | Public | D3 | **Done — see §29** |
| Forgot password | **Does not exist in the app today** — no route, no backend contract found in this pass | Not fabricated. Flagged as future/unavailable; no page will be created for it until a backend contract exists | Public | Out of scope | N/A — re-confirmed absent in D3, no link/UI added |
| `(auth)/layout.tsx` | Shared centered-card shell for login/register | Restyled to match new Landing/auth visual language, same structural role | Public | D3 | **Done — see §29** (thin server wrapper around new `components/auth/AuthShell.tsx`) |
| `app/layout.tsx` | Root layout: fonts, `<AuthProvider>` | Gains theme bootstrap (inline no-FOUC script + `ThemeProvider`, §25) only — no structural change | Shared | D1 | **Done** (D2/D3 additionally added `LocaleProvider` and `cyrillic-ext`, additive) |
| `(app)/layout.tsx` | `ProtectedRoute` + permanent `Sidebar` + `Navbar` + `ml-64 p-8 pt-24` main, identical for every role/route incl. simulation pages | Adaptive authenticated AppShell: compact/collapsible rail for Student/Teacher pages, **no permanent chrome** on simulation routes (replaced by SimulationShell's floating TopBar) | Shared (branches by role) | D4 | **Done — see §30.** Now a thin wrapper around `StandardAppShell`; simulation routes moved out to a new `(immersive)` route group (§30) |
| `/dashboard` (`(app)/dashboard/page.tsx`) | "Мои симуляции" — search bar + flat card grid of all simulations, identical for every role | **Student Home** (learning hub): greeting/status, continue learning, worlds grid, recent activity, recommended next experiment, progress summary, achievements, AI Teacher entry point. Teachers no longer land here | Student | D5 | **Done — see §31.** Teachers still reach this route (Rail's "Home" is role-agnostic) but see a minimal world-browse fallback, not the student widgets |
| `/teacher` (`(app)/teacher/page.tsx`) | Class stats (`ClassStats`) + student list + inline result table, gated via `ProtectedRoute allowedRoles={["teacher","admin"]}` | **Teacher Home**: class overview (same `/api/results/stats`), students needing attention, completion/assessment summary — same data, redesigned presentation | Teacher | D10–D11 | Not started (internal content). Now reachable via the Rail's role-gated "Students" destination (D4) — own `allowedRoles` gate unchanged |
| Teacher → student detail | Currently inline on `/teacher` (click a student in the list, result table renders below, no dedicated URL) | Promoted to its own view (e.g. `/teacher/students/[id]`) reusing `/api/results/student/:id` (`LabResult[]`) **and** the richer `LearningProfile` fields that already exist (`accuracy`, `average_hints`, `average_attempts`, `strong_topics`, `weak_topics`, `recent_mistakes`, `recommended_difficulty`, `current_streak`) — real mistake/hint/streak data, not fabricated | Teacher | D11 | Not started — new route |
| `/profile` (`(app)/profile/page.tsx`) | Shared form (full name/email/created_at edit) + `ProgressDashboard` (`/api/progress/me`: level, XP, streak, achievements, difficulty breakdown) | **Student Profile** — real Learning Profile data, restyled. Teacher variant of this same route emphasizes account/preferences over learning stats (teachers don't have a `LearningProfile` in the current data model — this is not invented for them) | Student (rich) / Teacher (account-focused) | D5 (student) / D12 (teacher) | **Done for student — see §31.** Teacher-specific variant (de-emphasize `ProgressDashboard`) still D12 — today a teacher visiting `/profile` sees the same identity card + the same "fresh profile" empty state from `ProgressDashboard` (harmless, not fabricated, just not yet teacher-tailored) |
| `/chemistry_world/[id]` | Chemistry World simulation page (`ChemistryWorldScene.tsx`) | Wrapped in shared `SimulationShell` (§9 of the presentation-layer plan) | Student | D7 | **Shell — done, see §34.** `SimulationShell` (floating header) + `AITeacherDock` (collapsible AI chat) wired in D6, code-verified, awaiting manual visual approval. Scene's own internal panel composition (info grid below canvas) intentionally NOT restructured yet — see §34's explicit scope boundary |
| `/electricity_lab/[id]` | Electricity Lab simulation page | Wrapped in shared `SimulationShell` | Student | D8 | Shell — done, same as above (§34) |
| `/geo3d/[id]` | GeoWorld simulation page | Wrapped in shared `SimulationShell` | Student | D9 | Shell — done (§34); GeoWorld's own overlays untouched per explicit "wrap only" instruction, no G-stage files modified |
| `/simlab/[id]` | Physics SimLab simulation page | Wrapped in shared `SimulationShell` (lowest-risk module — migrate alongside remaining-pages cleanup) | Student | D13 | Shell — done (§34); still not linked from any navigation, unchanged from D2 |
| `(dev)/sandbox-prototype` | Internal locomotion/interaction prototype, dev-only, not part of the product surface | **Unchanged.** A second, new dev-only page is added in the same `(dev)` route group for the D1 visual proof (§26) — it does not replace or modify this file | Internal | D1 | New sibling page added |

Every existing page has a destination above; nothing is silently dropped. No teacher-facing "safety incidents" list exists in the current data model (`ChemistryWorkspaceProvider`'s `accidentLog` is per-session client state, not persisted/queried per-student anywhere yet) — it is **not** promised in the Teacher Student Detail view (§24) until a real backend field is confirmed.

## 21. Public Landing architecture (target for D2)

Sticky/floating glass navbar: logo · nav (Product / Worlds / Students / Teachers / About) · right side (Sign In / Get Started), collapsing to a compact menu on mobile.

Page sections, in order: **Hero** (large spatial/atmospheric visual, "EduMind transforms science and geography into interactive 3D worlds," CTAs "Get Started" / "Explore Worlds," restrained motion, respects `prefers-reduced-motion`) → **Interactive world showcase** → **Learning worlds** (Physics/Electricity Lab, Chemistry World, GeoWorld — using the real `MODULE_LABEL` names already defined in `LessonCard.tsx`, describing actual capabilities, no invented features) → **How EduMind works** → **AI Teacher** (as a named product feature, §10/§22) → **Student experience** → **Teacher experience** → **Educational benefits** → **Final CTA** → **Footer**.

"Get Started" routes into `/register`; "Sign In" into `/login`. No dashboard chrome (sidebar/navbar from `(app)/layout.tsx`) appears anywhere on the public route group.

## 22. Auth experience (target for D3)

Login/Register/`(auth)/layout.tsx` are restyled to feel like a continuation of the Landing, not a disconnected admin login: a spatial/visual side (product atmosphere, consistent with the Hero) paired with a focused glass-or-solid auth panel (per §6's rule: forms are dense/text-heavy → solid, readable surface, not stacked glass). `useAuth()` (`login`, `register`) and the token/session contracts in `lib/api.ts`/`lib/token-storage.ts` are not touched — this is a visual/layout pass only.

## 23. Student architecture (target for D5)

**Student Home** replaces the flat "Мои симуляции" grid with a hub answering *"what should I learn or continue now?"*, built only from data that already exists: greeting, continue-learning (last active simulation), the four worlds grid (reusing `Simulation`/`LessonCard` data), recent activity, a recommended-next suggestion (can be derived client-side from `LearningProfile.recommended_difficulty` + `last_completed_lab` — no new backend endpoint required for D5), progress summary and achievements (`GET /api/progress/me` via `getMyProgress()`, already wired in `ProgressDashboard.tsx`), and an AI Teacher entry point.

**Student Profile** reuses `ProgressDashboard` and the existing profile-edit form, restyled: avatar (placeholder/initial, no upload system exists — not fabricated), name/role/email/joined-date (`User`), level/XP/streak/achievements/completed-labs (`LearningProfile`), strong/weak topics and recent mistakes (already returned by the backend, currently rendered nowhere — real fields, safe to surface). Anything not present in `LearningProfile`/`User` (e.g. a numeric "assessment history" timeline beyond `LabResult[]`) is marked unavailable/future rather than mocked.

## 24. Teacher architecture (target for D10–D12)

**Teacher Home**: class overview cards from `ClassStats` (`total_students`, `active_students`, `average_score`, `completion_rate` — identical source as today's `StatCard`s), a "needs attention" list (derivable client-side today by sorting/filtering the existing `/api/users/` + per-student results, no fabricated metric), recent activity.

**Teacher → Student Detail** (new route, §20): per-student `LabResult[]` (simulation/score/duration/completed_at — already fetched) plus the real `LearningProfile` fields for that student where the backend exposes them per-user (accuracy, hints/attempts averages, strong/weak topics, recent mistakes, streak). Safety-incident and "where mistakes happen" aggregate views are **not** built until a real persisted/queryable source is confirmed (see §20 note) — this is called out explicitly rather than silently mocked.

**Teacher Profile/Settings**: same `/profile` route as students, account-focused variant (name/email/password/preferences) without the student `LearningProfile` panel, since teachers don't have one in the current data model.

## 25. Light / Dark / System theming strategy

- Three states: **Light**, **Dark**, **System** (default). Selection persists (`localStorage`) and is applied before first paint via a small inline script in `app/layout.tsx`'s `<head>`, so there is no flash of the wrong theme — the same pattern used by `next-themes` and similar libraries, implemented directly (no new dependency) to keep the dependency surface unchanged.
- Mechanism: Tailwind `darkMode: "class"` (confirmed zero existing `dark:` usage in the codebase, so this is a pure addition, not a behavior change); resolved theme is applied as a `dark` class on `<html>`. "System" resolves via `matchMedia("(prefers-color-scheme: dark)")` and stays live-subscribed so an OS-level theme change updates the app without reload.
- All new semantic color tokens (§26) are defined as CSS custom properties with a light default and a `.dark` override — no component hardcodes a light or dark literal color when a token exists, per the brief.
- **Existing dark-only pages are not touched or reskinned in D1.** The new tokens/primitives are additive; old `.glass-panel`/`surface-*`/`brand`/`neon-*` Tailwind keys and every page that uses them today keep rendering byte-for-byte identically. Theme switching becomes visible first on the D1 visual-proof page (§26), then on real pages as each one migrates (D2+), exactly as the additive migration strategy in §15 already specifies.

## 26. Glassmorphism rules (global, applies to all future stages)

Glass is a tool for **floating chrome over a visual/3D background**, not a default surface: navigation, floating controls, AI Teacher, guided-experiment steps, contextual actions, modals/overlays, simulation HUD, and Landing hero cards get glass. Dense, text-heavy, or read-critical surfaces — analytics tables, long-form text, forms, teacher data grids, reports — use solid, opaque, highly-readable surfaces instead; wrapping a data table in blur actively hurts the exact audience (teachers scanning results) this product needs to serve well. No nested glass-on-glass (§6, restated here as a global rule, not just a simulation-shell rule). Glass characteristics: real `backdrop-filter: blur`, subtle translucency, a thin low-contrast border (the retuned `glass-border` token, §25), a soft neutral shadow, a restrained top highlight, and — non-negotiably — text contrast that passes at both the light and dark token values. No permanent neon glow as decoration (glow is reserved for focus/active/alert states, §3).

## 27. Revised stage-by-stage roadmap (D0–D14, supersedes §19's old D0–D9 table)

| Stage | Scope | Depends on | Status |
|---|---|---|---|
| **D0** | Product/route/design architecture — this update (§19–§26). | — | **Done, this pass** |
| **D1** | Theme tokens (semantic, light/dark/system) + minimum shared primitives (`Button`, `Surface`, `GlassPanel`, `ThemeToggle`) + `ThemeProvider`/persistence, additive only, zero visual change to existing pages. Visual-proof demo in `(dev)`. | D0 | **In progress, this pass** |
| **D2** | Public Landing (§21). | D1 | **Done — see §28** |
| **D3** | Auth experience — Login/Register/`(auth)/layout` (§22). | D1, informed by D2 | **Done — see §29** |
| **D4** | Authenticated AppShell/navigation — adaptive rail, drop permanent sidebar+navbar on simulation routes (§7–§8 of the original plan, generalized to role-aware shell). | D1 | **Done — see §30** |
| **D5** | Student Home + Student Profile (§23). | D4 | **Done — see §31** |
| **D6** | SimulationShell — generic floating TopBar/panel-docking shell (§9 of the original plan), proved on one module. | D1, D4 | **Done, see §34 — code-verified, awaiting manual visual approval** |
| **D7** | ~~Chemistry World visual migration onto SimulationShell~~ — **superseded at D7 time**: the user redirected this slot to the Teacher Learning Analytics Center + test-data cleanup (§37) instead, since a manual review of `/teacher` found it unacceptably weak and the dev DB had accumulated 409 junk E2E accounts. Chemistry/Electricity/GeoWorld were already migrated onto Design V2 directly in D6/D6.1/D6.2 without a dedicated SimulationShell-migration stage, so this slot's original scope was largely moot. | D6 | **Done, see §37 — code-verified, awaiting manual visual approval** |
| **D8** | Electricity Lab visual migration onto SimulationShell — same note as D7: largely already covered by D6.1/D6.2. | D6, informed by D7 | Not started |
| **D9** | GeoWorld visual migration onto SimulationShell. | D6 | Not started |
| **D10** | Teacher Home (§24) — **delivered early, as part of D7** (§37) at the user's explicit request. | D4 | **Done, see §37** |
| **D11** | Teacher → Classes/Students/Student-Detail analytics, new student-detail route (§20, §24) — **student-detail analytics delivered early as part of D7** (§37); a separate `Classroom`/`ClassMembership` model + `/api/classes/*` CRUD (teacher-scoped class rosters) was also added directly to `main` by the user in a concurrent commit (`c59f706`, outside this D-stage's scope) — see §37's "Concurrent work" note for how the two relate and what's still open. | D10 | **Partially done — see §37** |
| **D12** | Teacher Profile/Settings (§24). | D4, D5 (shares `/profile` shell) | Not started |
| **D13** | Remaining existing pages — SimLab visual migration onto SimulationShell, any leftover shells. | D6 | Not started |
| **D14** | Responsive + accessibility + performance + final cross-module consistency audit; remove now-unused old `.glass-panel`/neon utility classes (§15). | D2–D13 | Not started |

No stage after D6 should require touching a domain engine, provider, or backend contract file (§16 still holds).

## 28. D2 implementation notes — Public Landing (done)

**Routing.** `app/page.tsx` no longer redirects at all — it renders the Landing unconditionally, for both authenticated and unauthenticated visitors (this is stricter than §21's original "narrower redirect" idea; the 2026-08-08 D2 brief explicitly requires an authenticated user still be able to visit `/`). CTAs adapt instead: `useAuth().user` is read directly in `LandingNavbar`/`Hero`/`FinalCta`/`Footer` and swaps "Get Started"/"Sign In" for "Open Dashboard" → `/dashboard`. No loading gate blocks first paint — during the brief window before `AuthProvider` resolves the session, the page renders the logged-out copy, then swaps if a session turns out to exist (simple, deterministic, no flash-of-loader on a public page). `/` lives outside `app/(app)/layout.tsx`, so the legacy `Sidebar`/`Navbar` shell never mounts on it — confirmed by an explicit test asserting `"Мои симуляции"` (the old dashboard heading) is absent.

**i18n (new, additive infrastructure).** RU/EN/TG multilingual support, added mid-D2 at the user's request, scoped to the Landing + shared public nav per that request:
- `lib/i18n/locales.ts` — `Locale` union, `DEFAULT_LOCALE = "ru"`, short/long labels.
- `lib/i18n/dictionaries/{ru,en,tg}.ts` — `ru.ts` is the structural source of truth; `en.ts`/`tg.ts` are typed as `typeof ru`, so a missing or renamed key is a **compile error**, not a silent blank string or fallback.
- `lib/locale-context.tsx` — `LocaleProvider`/`useLocale()`, same shape as `ThemeProvider`/`QualityProvider` (`localStorage["edumind:locale"]`, default `"ru"`). Mounted globally in `app/layout.tsx` (additive — no visual effect on any page that doesn't call `useLocale()` yet), specifically so **D3+ can migrate Login/Register/Dashboard/Teacher onto the same dictionaries without re-plumbing the provider.**
- `components/design-system/LocaleSwitcher.tsx` — RU/EN/TG glass pill, same visual pattern as `ThemeToggle`, added to the design-system primitive set (not landing-only).
- `app/layout.tsx`'s Inter (body font) subset gained `cyrillic-ext` (was `latin`+`cyrillic` only) — Tajik-specific characters (ӣ, ҷ, қ, ғ, ҳ, ӯ) aren't covered by the base `cyrillic` subset and would have silently fallen back to a system font mid-word without it. `Hanken_Grotesk` (headline) already had `cyrillic-ext`.
- Tajik copy was written natively (not machine-translated) but was **not** reviewed by a native speaker — flagged as a limitation, see final report.

**Theme.** No changes to the D1 theme system itself. Every landing color is a semantic token (`bg-background`, `text-text-primary`, `text-accent-*`, etc.) or the `.ds-glass`/`Surface`/`GlassPanel` primitives — nothing hardcodes a light- or dark-only literal. `MotionConfig reducedMotion="user"` wraps the whole page so every `framer-motion` animation (section reveals, HUD float, mobile menu) respects `prefers-reduced-motion` automatically, with zero per-component motion-guard code.

**Sections implemented** (`components/landing/`): `Navbar` (floating glass, anchor nav, responsive hamburger menu, `LocaleSwitcher`+`ThemeToggle`, auth-aware CTAs) → `Hero` (+ `HeroVisual`: pure CSS/SVG "one universe" composition — gradient core, orbit rings, small circuit/molecule motifs, floating glass HUD chips for the 3 worlds — deliberately **not** a mounted `@react-three/fiber` Canvas, see Performance below) → `WorldsShowcase` (`#worlds`, one accented card per real world) → `HowItWorks` (`#how-it-works`, 3-step flow with a connecting line, not three disconnected cards) → `ForStudents` (`#students`) → `ForTeachers` (`#teachers`) → `AITeacherHighlight` (compact, one `GlassPanel`, not a full section — AI is support, not the identity) → `FinalCta` (restrained radial-gradient transition through the 3 accent colors, not a solid glow block) → `Footer`.

**Real capabilities represented, nothing invented:**
- *Worlds*: exactly 3 — Electricity Lab, Chemistry World, GeoWorld (`lib/landing-worlds.ts`) — SimLab/Physics intentionally excluded from the Landing per the brief, even though it exists as a route (still gets migrated in D13).
- *Students*: full 3D drag/connect/pour interaction, guided step-by-step labs (`GuidedLabPanel`/`ElectricityGuidedLabPanel`), XP/level/streak/achievements (`LearningProfile`), AI Teacher.
- *Teachers*: class overview (`ClassStats`), per-student lab results (`LabResult[]`), and — grounded specifically in fields that exist but are **not yet surfaced anywhere in the UI** (`weak_topics`, `recent_mistakes`, `accuracy` on `LearningProfile`) — "where students actually struggle." No live classroom surveillance, no safety-incident dashboard, no assignment system: none of these exist in the codebase.
- *AI Teacher*: worded from the real behavior in `ChemistryTeacherChat`/`AITeacherChat` — grounded in current experiment state, answers questions, does not replace the teacher.

**Per-world CTA routing.** No world has a public route to a specific simulation `[id]` — a concrete simulation is only ever chosen from the catalog after auth (`/dashboard` → `SWR` fetch of `/api/simulations/`). So every per-world "Open world" CTA and the Hero/FinalCta primary CTA route to `/register` (unauthenticated) or `/dashboard` (authenticated) — never a guessed `/chemistry_world/<id>`. "Explore Worlds" (Hero/Navbar/FinalCta secondary) is an in-page anchor to `#worlds`, not a route.

**New shared D1 primitive (justified gap, per §15's "may be improved only if a real landing requirement proves a gap"):** `components/design-system/ButtonLink.tsx`. The Landing needed CTA buttons that are real navigational links (correct semantics/accessibility — an `<a>` cannot nest inside a `<button>`), styled identically to `Button`. `Button.tsx` now exports `buttonClassName(variant, className)` as the single source of truth for the visual, consumed by both `Button` (renders `<button>`) and `ButtonLink` (renders `next/link`) — no style duplication, no drift risk.

**Testing.** `app/page.test.tsx` (7 tests): Landing renders instead of redirecting (and the old dashboard heading is absent), logged-out CTA hrefs (`/register`/`/login`), authenticated CTA swap (`/dashboard`), mobile menu open/close (`aria-expanded`), locale switch re-renders copy live + persists to `localStorage`, persisted locale restored on mount, all 3 worlds present in `#worlds`. Uses a real `ThemeProvider`+`LocaleProvider` (not mocked — tests the actual integration) with only `useAuth` mocked (to control auth state deterministically) and a minimal `IntersectionObserver` stub (jsdom doesn't implement it; `framer-motion`'s `whileInView` needs it to mount without throwing). No `@testing-library/jest-dom` in this repo — assertions use plain DOM (`.textContent`, `.getAttribute()`), matching the existing test-suite convention.

**Performance.** No `@react-three/fiber`/`three` import anywhere in the Landing's module graph — `HeroVisual` is gradients/SVG/`GlassPanel` only. `public/textures/earth_*` and `public/models/**/*.glb` (real assets, but built for in-scene WebGL use, wrong shape/weight for flat hero decoration) are untouched and unused here.

**Deferred / not done in D2 (intentionally, out of scope):** `/login`, `/register`, `/dashboard`, `/teacher`, `/profile`, and all 4 simulation scenes are **not** visually touched — same DOM/classes as before D2, still on the old dark-only look, still without `useLocale()`. Tajik copy needs native-speaker review before this is considered production-final. No native-language auto-detection (`navigator.language`) — default is always `ru` until a user explicitly switches, per the brief's "Default locale: Russian."

## 29. D3 implementation notes — Auth experience (done)

**Contract audit (before any UI change).** `/login`: `email` + `password`, `useAuth().login(email, password)` → `router.push("/dashboard")` on success; no client-side pre-validation beyond HTML5 `required`/`type="email"`. `/register`: `fullName` + `email` + `password`, one client-side check (`password.length < 8`) before calling `useAuth().register(email, password, fullName)` → `router.push("/dashboard")` on success. Both show `err.message` when `err instanceof ApiError`, else a generic fallback string. No forgot-password route/link/backend contract exists anywhere (re-confirmed, matches the D0 audit) — nothing was added for it. No role selection at registration — the backend assigns a role, the form never asks. `router.push("/dashboard")` is unconditional for both roles; role resolution still happens downstream of `/dashboard`, unchanged — D4's job, not D3's. **None of this changed** — `lib/auth-context.tsx`, `lib/api.ts`, `lib/token-storage.ts` were not touched.

**AuthShell (`components/auth/AuthShell.tsx`).** Replaces the old `(auth)/layout.tsx` (dark orb-blur + `.glass-panel` card). `(auth)/layout.tsx` is now a two-line server component that just renders `<AuthShell>{children}</AuthShell>`. Desktop (`lg:`): split layout — left panel reuses the **exact D2 `HeroVisual` component** (`components/landing/HeroVisual.tsx`, imported directly, not duplicated) over a subject-accent atmospheric gradient, with its own brand-mark link back to `/`; right panel is a solid `Surface` (not `GlassPanel` — dense form content follows §26's glass-vs-solid rule, restated explicitly in the D3 brief). Mobile: visual side hidden entirely (`hidden lg:flex`), the form-side top bar carries its own back-to-`/` link + `LocaleSwitcher`/`ThemeToggle` so those three things are always present exactly once as rendered. Fixed one glass-on-glass violation caught while building this: `LocaleSwitcher`/`ThemeToggle` already render their own `.ds-glass` pill internally, so they're placed directly in a plain flex row, **not** re-wrapped in an outer `GlassPanel`.

**Login/Register pages.** Rewritten to consume `useLocale()` for all copy (no hardcoded strings) and the shared `.ds-input`/`ds-focus-ring` classes + new `components/auth/PasswordField.tsx` (visibility toggle, correct `autoComplete="current-password"`/`"new-password"`, shared by both pages). Submit buttons use the D1 `Button` primitive. Error text now renders into a `role="alert"` container with a reserved `min-h` so its appearance doesn't shift the submit button (§ brief "no layout jump when errors appear"). `autoComplete="email"`/`"name"` added to the plain inputs. **Every other behavior is byte-identical to before**: same state shape, same validation order, same error fallback logic, same success redirect.

**Autofill readability (Light/Dark).** New `.ds-input` component class in `globals.css` includes a `-webkit-autofill` override (`-webkit-text-fill-color` + a huge inset `box-shadow` matching `--ds-background`/`--ds-text-primary`) — without this, a password manager's autofill renders its own yellow/white background that Tailwind classes can't override normally, producing unreadable text in dark mode specifically. This is the one new global CSS addition in D3; everything else is component-scoped.

**i18n.** Extended the D2 dictionaries (`lib/i18n/dictionaries/{ru,en,tg}.ts`) with a new top-level `auth` namespace (`common`, `visual`, `login`, `register`) — same "typed against `ru`" guarantee as D2, so a missing EN/TG key is a compile error. Tajik auth copy was written natively, reviewed for consistency with the D2 Tajik copy already in the file, but — like all D2 Tajik text — **not** reviewed by a native speaker; this remains an open item across both stages, not new to D3.

**Theme.** No new theme mechanism. All auth surfaces use only semantic tokens; `MotionConfig reducedMotion="user"` wraps `AuthShell` (independently of the Landing's own instance — the two pages are never mounted together) so entrance/HUD motion respects `prefers-reduced-motion` the same way it does on the Landing.

**Testing.** `app/(auth)/login/page.test.tsx` (6 tests) and `app/(auth)/register/page.test.tsx` (5 tests): render inside the real `AuthShell` (not mocked) with real `ThemeProvider`/`LocaleProvider`, only `useAuth` and `next/navigation`'s `useRouter` mocked. Cover: shell chrome present (back-link, theme/locale controls), no forgot-password text anywhere, live language switch changes the rendered heading, exact success contract (`login`/`register` called with the right args, `router.push("/dashboard")`), exact error contract (`ApiError` message rendered, no redirect), loading state (button disabled + loading copy while the call is in flight, using a manually-resolved `Promise` to freeze the pending state), password-visibility toggle, the register password-length guard firing without calling the API, and the login/register cross-links. Same `IntersectionObserver` stub pattern as D2's `app/page.test.tsx` (needed because `AuthShell` mounts `HeroVisual`).

**Known pre-existing issue, not caused by D3, not fixed (git-safety boundary).** `npx tsc --noEmit` reports 2 errors in `components/geo/TileDebugLayer.tsx` (`string | undefined` not assignable to `string`) — this file belongs to the parallel GeoWorld session (last touched in their committed `9feb102 feat(geoworld): G2 tile LOD architecture`, untouched and unmodified in this working tree throughout D3). Confirmed by filtering `tsc`'s output: every error line traces to that one file; nothing else in the project fails type-checking. Per the explicit instruction not to touch GeoWorld work, this was left alone and is flagged here for visibility, not fixed.

## 30. D4 implementation notes — Authenticated AppShell + Navigation (done)

**Old shell audit.** `(app)/layout.tsx` wrapped every authenticated route — `/dashboard`, `/teacher`, `/profile`, and (critically) all 4 simulation routes — in one fixed structure: `ProtectedRoute` → `QualityProvider` → permanent `Sidebar` (fixed `w-64`, role-filtered links already existed: student sees `/dashboard`, teacher/admin additionally sees `/teacher`) → `Navbar` (fixed `h-20`, name/role/profile-link/logout) → `<main className="ml-64 p-8 pt-24">`. Two real problems: (1) the sidebar/navbar consumed a fixed 256px+80px of every page including the 3D labs, exactly the "SaaS dashboard with a 3D iframe" pattern this whole redesign targets; (2) `QualityProvider` wrapped pages that never call `useQuality()` (confirmed by grep — only `ChemistryWorldScene.tsx`/`ElectricityLabScene.tsx` call it; `SimLabScene`/`GeoWorldScene` don't).

**Route-group split (the "smallest clean architectural adjustment").** Created `app/(immersive)/` and moved `simlab/`, `geo3d/`, `electricity_lab/`, `chemistry_world/` into it via `git mv` — **zero URL change** (Next.js strips route-group parens from the path; `/chemistry_world/[id]` resolves identically before and after). `(app)/layout.tsx` now mounts `StandardAppShell`; the new `(immersive)/layout.tsx` mounts `MinimalShell`. `QualityProvider` moved to wrap **only** `(immersive)` — confirmed via the same grep that only the two scenes that actually consume it live there, so this is a pure correctness fix, not a behavior change for the pages that never used it (`/dashboard`/`/teacher`/`/profile`).

**StandardAppShell** (`components/appshell/StandardAppShell.tsx`) = `Rail` (desktop, `components/appshell/Rail.tsx`) + `TopBar` (`components/appshell/TopBar.tsx`) + `MobileDrawer` (`components/appshell/MobileDrawer.tsx`), still wrapped in the same `ProtectedRoute` as before (no auth-guard behavior change). Layout is plain flexbox with `Rail` as a `sticky` (not `fixed`) flow child — the content column reflows automatically when the rail's width changes between collapsed/expanded, avoiding a fragile fixed-position + manually-computed-margin approach (an early draft of this used a CSS-variable trick that doesn't work with `display:contents` inheritance direction — caught and fixed before it shipped).

**Rail** = pure navigation (brand mark, role-aware nav items from `lib/appshell-nav.ts`, collapse toggle) — collapsed width `4.5rem` / expanded `15rem`, collapsed state persisted to `localStorage["edumind:rail-collapsed"]` (same pattern as theme/locale/quality). Icon-only collapsed state uses a native `title` attribute as a tooltip fallback (no new tooltip dependency). **Theme/Locale/Account deliberately live in `TopBar`, not the Rail** — the brief offered either location; putting six toggle buttons (3 locale + 3 theme) in a 72px collapsed column was the concrete reason for this choice, documented here since it's a real design decision, not an oversight.

**TopBar** carries: mobile hamburger (opens `MobileDrawer`), brand mark (mobile only — Rail already shows it on desktop), `LocaleSwitcher`, `ThemeToggle`, `AccountMenu`. **No per-page title was added** — every existing page (`dashboard`/`teacher`/`profile`) already renders its own `<h1>`; a shell-level title would just duplicate it. This is a deliberate scope-minimization, not a missed requirement.

**AccountMenu** (`components/appshell/AccountMenu.tsx`) replaces the old `Navbar`'s plain name+logout row: avatar-with-initials button opens a `GlassPanel` popover (name, role via new `shell.role.*` i18n keys, Profile link, Logout button) with click-outside + Escape to close. `logout()` behavior is untouched — same `clearTokens()` + state reset as before.

**MobileDrawer** (`components/appshell/MobileDrawer.tsx`) — drawer/sheet pattern (not a shrunk rail, per the brief), solid `Surface` (not glass — dense labelled nav follows the same glass-vs-solid rule as everywhere else), backdrop click / Escape / nav-click all close it, `document.body.style.overflow = "hidden"` blocks background scroll while open, focus moves to the close button on open. Contains the same role-aware nav items as the Rail, plus Locale/Theme/Profile/Logout (since the Rail — and therefore TopBar's desktop-only Locale/Theme — are hidden on mobile, the drawer is the only place those controls exist there).

**Simulation routes ("immersive").** `MinimalShell` (`components/appshell/MinimalShell.tsx`) = `ProtectedRoute` + `QualityProvider`, nothing else — no Rail, no TopBar. This is explicitly **not** the full floating-chrome `SimulationShell` from §9/D6 (that's a later stage redesigning each scene's own internal panel layout); D4's job was narrower and is done: prove the shell architecture no longer forces a permanent rail onto the canvas. The scenes' own internal JSX (`ChemistryWorldScene.tsx` etc.) was **not touched**.

**i18n.** New `shell` namespace (`nav`, `role`, `account`, `rail`, `mobile`) added to all three dictionaries, same typed-against-`ru` guarantee. Role labels (`student`/`teacher`/`admin`) are now real i18n keys — the old hardcoded `ROLE_LABEL` object in `profile/page.tsx` was **not** touched (that page's content is still D5/D12 scope) and will naturally get consolidated onto `shell.role.*` when `/profile` is migrated.

**Theme.** No new mechanism; `MotionConfig reducedMotion="user"` added to `StandardAppShell` (mirrors Landing/Auth) — this was in fact caught as a real gap while fixing a test flake (`MobileDrawer`'s `AnimatePresence` exit didn't complete synchronously in jsdom without it being properly configured — see Testing below) and is a genuine accessibility improvement, not just a test fix.

**Legacy shell removal.** `components/ui/Sidebar.tsx` and `components/ui/Navbar.tsx` are **deleted**, not just deprecated — confirmed zero remaining imports via `grep -rn "^import.*components/ui/(Sidebar|Navbar)"` before removing (the only remaining textual matches were this document's own prose and unrelated substring collisions like `LandingNavbar`). Per §13's process: identify consumers (found exactly one: `(app)/layout.tsx`) → migrate it → prove nothing else depends on the legacy files → then delete.

**Testing.** `lib/appshell-nav.test.ts` (5 tests, pure logic): student/teacher/admin nav sets, undefined-role fallback, real routes only. `components/appshell/StandardAppShell.test.tsx` (8 tests): student vs teacher nav rendering, `aria-current="page"` on the active route, mobile drawer open/Escape-close/nav-click-close, `AccountMenu` shows the real name+role and `logout()` fires, live language switch changes rendered nav labels, rail-collapsed preference persists across remounts. `components/appshell/MinimalShell.test.tsx` (3 tests): no nav landmarks render, `QualityProvider` is available to a real `useQuality()` consumer, the auth guard still redirects a logged-out visitor. One real bug caught and fixed while writing these: `MobileDrawer`'s `AnimatePresence` exit animation doesn't complete inside a single synchronous `act()` in jsdom — switched those two assertions to `waitFor`, and added the `MotionConfig` mentioned above to the real component (not just the test).

**Known limitation.** `usePathname()`-based active-route matching (`pathname?.startsWith(href)`) means `/dashboard` would also read as "active" for any future sub-route literally prefixed `/dashboard...` — harmless today (no such routes exist) but worth remembering if `/dashboard/settings`-style routes appear later without re-checking this matcher.

## 31. D5 implementation notes — Student Home + Student Profile (done)

**Real-data audit (the load-bearing part of this stage).** Went past the frontend into the backend routers (read-only — no backend files changed) to classify every proposed widget honestly:

| Data | Source | Status |
|---|---|---|
| `User` (name/email/role/created_at) | `useAuth()` | REAL NOW |
| `LearningProfile` (level, xp, completed_labs, accuracy, streak, avg hints/attempts, strong/weak topics, recommended_difficulty, achievements, `last_completed_lab`) | `GET /api/progress/me`, already wired via `lib/progress-client.ts` | REAL NOW |
| Achievement definitions | `lib/achievements.ts` (`ACHIEVEMENTS`, `ALL_ACHIEVEMENT_CODES`) — real, pre-existing registry | REAL NOW |
| Simulation catalog | `GET /api/simulations/`, already used by the old dashboard | REAL NOW |
| **Own lab results** (for "Recent Results") | `GET /api/results/me` — **exists in `backend/app/routers/results.py`, self-access for any authenticated user, but was never called from the frontend** (only the teacher-only `/api/results/stats` and `/api/results/student/:id` were). Added `lib/results-client.ts` as the first frontend consumer — a thin client, no backend change. | REAL NOW (newly wired) |
| **Resumable Chemistry experiment** (for "Continue Learning") | `GET /api/chemistry/saves` — **exists in `backend/app/routers/chemistry_saves.py`, lists ALL of the current user's saves across every experiment, but `lib/autosave-engine.ts` only ever POSTs/PATCHes the save for whichever experiment it's currently running inside — nothing previously listed them.** Added `lib/chemistry-saves-client.ts`, first consumer of the list endpoint. | REAL NOW (newly wired) |
| Resumable Electricity/GeoWorld/SimLab state | — | **NOT AVAILABLE.** Grep-confirmed: no `electricity_saves`-style router exists at all — Electricity Lab's autosave has no server-side list/resume surface reachable from the dashboard. Not fabricated; "Continue Learning" can only ever resume Chemistry. |
| Global AI Teacher / dashboard chatbot | — | **NOT AVAILABLE.** `ChemistryTeacherChat`/`AITeacherChat` are mounted only inside their respective simulation scenes, tied to that scene's live context (container state, safety warnings, etc.) — there is no context-free/global variant. No dashboard entry point was built; inventing one would mean either a fake chatbot with no context or a real backend feature that doesn't exist. |
| Avatar upload | — | **NOT AVAILABLE** (unchanged from before D5) — initials-in-a-circle, no upload UI, none implied. |

**Student Home** (`app/(app)/dashboard/page.tsx`, same route, same `/api/simulations/` fetch as before — only the presentation changed): `Hero` (real name + time-of-day greeting + inline level/XP/completed-labs/streak pulse) → `ContinueLearning` → `WorldSection` (`#worlds`) → `ProgressSnapshot` (4-metric compact grid, not the fuller Profile breakdown) → `RecentResults` → `FocusNext`. Teacher/admin visiting `/dashboard` (still reachable — Rail's "Home" is role-agnostic) get a minimal fallback: heading + `WorldSection` only, no student-identity widgets — not a Teacher Dashboard redesign (still D10/D11), just refusing to show a teacher fabricated/empty `LearningProfile`-shaped UI.

**Continue Learning logic** (`components/dashboard/ContinueLearning.tsx`), in strict priority order, per the brief's explicit caution against fabricating a "last lesson":
1. An `active`-status Chemistry save (most recent by `updated_at`, backend-sorted) → framed as **"Unfinished experiment"**, links straight back into `/chemistry_world/{simulation_id}`.
2. Else `LearningProfile.last_completed_lab` (a real `simulation_id`, resolved to a title/module via the already-fetched simulations list — no extra request) → framed as **"Recent work"**, deliberately NOT "unfinished" since it's a completed lab, links to `/${module}/${id}`.
3. Else an honest empty state ("No lessons yet — choose a world below").

**Explore the Worlds** (`components/dashboard/WorldSection.tsx`) reuses `lib/landing-worlds.ts` — the exact same 3 promoted worlds + accent mapping as the D2 Landing (SimLab excluded, same reasoning). Rather than 3 generic "Enter World" tiles routing somewhere approximate, each world section groups the **real simulations that exist for that module** (`Simulation.module`) using the restyled `LessonCard` — the world tiles *are* the real catalog, organized and accented, not a separate invented overview. `components/ui/LessonCard.tsx` was restyled to Design V2 module accents (`accent-physics`/`accent-chemistry`/`accent-geo`, falling back to base `accent` for the untouched `simlab` case) — same routing/data, only classNames changed. It remains the only consumer-facing card component; nothing was duplicated.

**Progress Snapshot vs. Student Profile's `ProgressDashboard`** — deliberately not the same view twice: Home's `ProgressSnapshot` shows 4 numbers (XP, completed labs, accuracy, level) with no topics/achievements; Profile's `ProgressDashboard` (existing Stage-4 component, **restyled to Design V2 tokens + i18n, its fetch/state logic untouched**) keeps the full breakdown (avg hints/attempts, recommended difficulty, strong/weak topics, achievement grid). One real bug fixed while restyling: `ProgressDashboard` previously showed a wall of zeros for a genuinely fresh profile (a successful, real, all-zero `LearningProfile` is not an error) instead of a friendly empty state — added the same `completed_labs === 0 && xp === 0` empty-state check `ProgressSnapshot` already had, so both places treat "fresh" consistently.

**Recent Results** (`components/dashboard/RecentResults.tsx`) — up to 5 most recent `LabResult`s (title, score if present, completed date, duration), sorted client-side by `completed_at`. `LabResult` has no module/accent field (confirmed against `LabResultRead` backend schema), so the list stays neutral-styled rather than guessing a subject color from the title text.

**Focus Next** (`components/dashboard/FocusNext.tsx`) — `LearningProfile.weak_topics`, same constructive framing ("Стоит повторить"/"Worth revisiting") the existing `ProgressDashboard` already used before D5 — kept consistent, just promoted to its own compact Home section per the brief.

**Student Profile** (`app/(app)/profile/page.tsx`) — identity card (initials avatar, name, `shell.role.*` label, read-only email, editable full name, read-only join date) as a solid `Surface`, then `ProgressDashboard` below. **Edit contract is byte-identical**: same `PATCH /api/users/{id}` call, same `refreshUser()`, same disabled-until-changed logic, same error fallback. Removed one redundant nested `<ProtectedRoute>` (the page had its own on top of `(app)/layout.tsx`'s — already double-wrapped before D4 even existed; `StandardAppShell` already guards every route in this group, so the inner one was dead weight, not a guard being removed).

**Loading/empty states** — every new async section (`Hero`, `ContinueLearning`, `WorldSection`, `ProgressSnapshot`, `RecentResults`, `FocusNext`, `ProgressDashboard`) uses the new `components/design-system/Skeleton.tsx` primitive (`animate-pulse`, `motion-reduce:animate-none`) while loading instead of a full-page `Loader`/spinner, and a written empty state (never mock data) when the real fetch resolves to "nothing yet."

**i18n.** New `dashboard` (greeting/continueLearning/worlds/progress/recentResults/focusNext/teacherFallback) and `profile` namespaces in all three dictionaries, same typed-against-`ru` guarantee. Role labels reuse D4's `shell.role.*` rather than duplicating a third copy.

**Testing.** `app/(app)/dashboard/page.test.tsx` (10 tests): real-name greeting, all 3 real worlds render (SimLab never does), Continue Learning empty state, Continue Learning resume from a real active Chemistry save with the correct href, real progress numbers vs. the fresh-profile empty state, real recent results vs. empty state, constructive weak-topics framing, and the teacher fallback (no student widgets, worlds still browsable). `app/(app)/profile/page.test.tsx` (3 tests): real identity fields render, no fabricated achievements/stats for a fresh profile, and the exact edit contract (PATCH call + `refreshUser` + disabled-until-changed). Both use `SWRConfig value={{provider: () => new Map()}}` per test to avoid SWR cache bleed between cases (a real risk once multiple components in the same tree share a cache key like `"progress-me"`).

**Known pre-existing issue, not caused by D5, not fixed (git-safety boundary).** `npx tsc --noEmit` reported 1 error in `components/scenes/GeoWorldScene.tsx` (missing `exaggeration` prop) during this stage — confirmed via `git status` that this file (and `components/geo/RealEarthTileLayer.tsx`) were actively modified by the parallel GeoWorld session (G4 relief work, in progress) at the time; filtering it out left zero errors elsewhere. Left untouched per the standing instruction not to touch GeoWorld files; by the final verification pass the rest of the project type-checked clean.

## 32. D5.1 implementation notes — Student Dashboard visual rework (done)

**Why this stage exists.** After manual browser review of D5, the composition read as an admin list, not a hub: every section (`Hero`, `ContinueLearning`, `WorldSection`, `ProgressSnapshot`, `RecentResults`, `FocusNext`) was stacked full-width in a single `max-w-6xl` column via `space-y-10`, so even correct real data produced a page dominated by vertical whitespace and small, database-record-like world listings. D5.1 is a **visual/composition correction only** — no data source, contract, or D5 priority logic changed; every widget still reads from exactly the same real endpoints audited in §31.

**Page composition** (`app/(app)/dashboard/page.tsx`) reworked from one stacked column into a real hierarchy: `Hero` (full width) → `ContinueLearning` + `ProgressSnapshot` side by side (`lg:grid-cols-[2fr_1fr]`, Continue Learning dominant) → `WorldSection` (full width, 3-column) → `RecentResults` + `FocusNext` side by side (`lg:grid-cols-2`). Container widened `max-w-6xl` → `max-w-7xl`. Added `MotionConfig reducedMotion="user"` (was missing on this page — D5.1 caught it while adding `whileInView` entrance motion to the world cards).

**Explore the Worlds — the major rework (§5 of the brief).** `WorldSection.tsx`'s D5 version rendered a stacked list of small text headers, one LessonCard grid per module — reads as a filtered database view. Rebuilt as 3 large "portal" cards (`WorldPortal`), reusing the Landing `WorldsShowcase` visual recipe (layered radial-gradient header + large ghost icon) but richer: taller header (`h-40`), **two** layered gradient blobs for depth instead of one, icon hover-scale, whole-card hover-lift, `whileInView` stagger entrance. Each card shows real tagline/name/description (`lib/landing-worlds.ts`, same as Landing), and a real availability line: the most recently created real simulation for that module (`"Available: {title}"`, `+{N}` if more than one exists — no fabricated count), with a strong CTA that either links straight into that simulation or — for a module with zero real simulations — shows an honest disabled **"Coming soon"** state (new `dashboard.worlds.comingSoon` i18n key) instead of a dead/fake link. No screenshots, no mounted WebGL — still pure CSS/SVG/gradient, per the explicit constraint.

**Hero.** Added a faint atmospheric 3-accent gradient band (same recipe as Landing's `FinalCta`/`AuthShell` visual side, kept subtle) so the page reads as the same product from the first pixel. The level/XP/streak pulse moved from plain inline text into a `GlassPanel` badge — the brief explicitly names "compact progress HUD" as a glass use case, and this is exactly that, now with real atmospheric context behind it for the blur to read against (glass rule from §26: "must have actual background/context behind it").

**Continue Learning.** Same D5 priority logic verbatim (active Chemistry save → `last_completed_lab` → honest empty state — **kept, not touched**). Visually: bigger icon badge, more padding to carry the wider `2fr` column, and one new **real** status line for the active-save case — `"Saved: {activeSave.updated_at}"` (new `dashboard.continueLearning.lastSavedLabel` key). This is the only real "status" signal a `ChemistrySave` actually carries (no completion-percentage field exists on the backend schema) — deliberately not a fabricated progress bar, per the brief's explicit "no fake percentages."

**Progress Snapshot.** Converted from a solid 2×2 card grid to a `GlassPanel` vertical stat list (Level/XP/Completed labs/Accuracy — same 4 real metrics, same fresh-profile empty state from D5) to fit the new narrower `1fr` column. This is the other explicit glass case from §6 of the brief ("compact progress HUD").

**Recent Results / Focus Next.** Unchanged data logic; both wrapped in `flex h-full flex-col` so they align to equal height in their new side-by-side row. Stayed solid `Surface` (dense/text content — §6's other rule).

**Removed developer-facing copy (§11).** The teacher fallback previously rendered `t.dashboard.teacherFallback.subtitle` — "Панель ученика для учителей не отображается — используй раздел «Ученики»" — implementation-oriented prose explaining the app's own routing logic to the reader. Deleted from the rendered output; the fallback is now just the heading + the real `WorldSection`. The dictionary key itself was left defined (unused) in all three locale files rather than restructuring the typed dictionary shape for a one-line removal — harmless, no behavioral effect.

**A real bug found and fixed while writing tests, not just a test workaround.** The "Available: {title}" line was written as adjacent JSX text/expression children of one `<div>` (`{label}: {title}`) — React does create separate text nodes for each, but they concatenate into one continuous run in the rendered `element.textContent`, which is what `@testing-library`'s default `getByText` exact-matches against. So `getByText("Простая цепь")` couldn't isolate the title from `"Доступно: Простая цепь"` — not a false test failure to route around, but a genuine sign the title wasn't its own semantic unit. Fixed by wrapping the simulation title in its own `<span className="font-medium text-text-secondary">` — this simultaneously fixed the tests *and* gives the real title a visually distinct weight in the card, which is a legitimate small visual improvement, not just a test accommodation.

**i18n.** Three new keys across all three dictionaries: `dashboard.worlds.availableLabel`, `dashboard.worlds.comingSoon`, `dashboard.continueLearning.lastSavedLabel`. No restructuring of existing keys.

**Testing.** Reused the D5 dashboard test file, added an `IntersectionObserver` stub (the world portals now use `whileInView`, same requirement as the D2 Landing tests) and 3 new tests: the developer-facing subtitle text is confirmed absent from the teacher fallback; a world with zero real simulations renders the honest "Coming soon" state (and the other two worlds are unaffected); an active Chemistry save renders the real `updated_at` date as "Saved: …" with no fabricated percentage anywhere on the page. All 13 tests pass (10 from D5 unmodified in intent, verified still-correct against the new markup).

**Known pre-existing issue, not caused by D5.1, not fixed (git-safety boundary).** The full `vitest` run failed to *transform* (syntax-level, not a logic failure) exactly one file: `frontend/lib/geo/vector-geojson.test.ts` — confirmed via `git status` as an untracked file belonging to the parallel GeoWorld session's in-progress work, not touched by this stage. Every other test (806) passed.

## 33. D5.2 implementation notes — Student Dashboard centered composition + visual balance (done)

**Root cause of the "left-heavy" composition.** `StandardAppShell`'s content column (`components/appshell/StandardAppShell.tsx`) is a plain `<div className="min-w-0 flex-1">` — it spans the *entire* remaining viewport width after the Rail (e.g. ≈1680–1848px of a 1920px display, depending on collapsed/expanded Rail width), and `<main>` inside it has no width constraint of its own. `app/(app)/dashboard/page.tsx`'s own top-level wrapper was `<div className="max-w-7xl space-y-10">` — a `max-width` **with no `margin-inline: auto`**. A block element with a `max-width` but no auto margins does not center itself inside a wider parent; it simply stays flush against the parent's left edge and lets the excess space sit on the right. That is the entire mechanism behind the reported "stuck to the left edge, large dead zone on one side" — not a Rail/TopBar issue, not a Tailwind breakpoint issue, just a missing `mx-auto`. Confirmed by inspecting `StandardAppShell.tsx`, `Rail.tsx`, and the dashboard page together — nothing else in the ancestry constrains or centers width.

**What changed.**
- `app/(app)/dashboard/page.tsx`: both the student branch and the teacher fallback branch's outer container changed from `max-w-7xl` (no margin) to `mx-auto max-w-[90rem]` (1440px, up from 1280px). `mx-auto` is the actual fix; the width bump is a secondary, deliberate choice — at 1280px centered inside a ≈1680–1848px wide desktop content column, the composition would still read as "a narrow column with generous margins" rather than "a wide command center," per the brief's own framing. 1440px was chosen as a *sensible* cap (not full-bleed): at 1920px viewport width it still leaves real breathing room on both sides (Rail 240/72px + `main`'s own `lg:p-8` edge padding + the remaining margin outside 1440px), and at 1366px/1440px it simply never engages (the column is narrower than the cap, so it fills the available width exactly as before — no regression on smaller desktops, confirmed by reasoning through the arithmetic for all four brief-specified breakpoints: 1366, 1440, 1600, 1920).
- `components/dashboard/WorldSection.tsx`: the section's own heading (`t.dashboard.worlds.title`) and subtitle are now wrapped in `mx-auto max-w-2xl text-center` (same pattern as the D2 Landing's `WorldsShowcase` header) — this alone was applied per the brief's explicit, *optional* suggestion ("the section title itself may be centered if that improves composition") to give Explore the Worlds the "centerpiece" weight §2 of the brief asks for. **Nothing else was centered** — Hero's greeting/subtitle, the Continue Learning/Progress Snapshot text, Recent Results/Focus Next content, and all text *inside* each world portal card remain left-aligned, exactly as the brief warned against "blindly adding `text-center`" everywhere.

**How the 3 world portals are centered.** Not directly — they don't need their own centering rule. `WorldSection` is a plain block child of the now-`mx-auto`-centered page container, so its `grid grid-cols-1 gap-6 md:grid-cols-3` (unchanged from D5.1) automatically spans and centers within that already-centered parent. The grid's `align-items: stretch` default (unchanged, was already relying on this in D5.1) is what gives the three `Surface`-based portal cards equal height; this was not touched.

**Depth hierarchy (§5 of the brief).** Reviewed but left unchanged: `Hero`'s atmospheric gradient band (background → atmospheric layer), `Surface`/`GlassPanel` (surfaces vs. glass/HUD), and the portal cards' existing `elevated` shadow + hover-lift (interactive layer) already form the 4-step hierarchy the brief describes. Considered adding a stronger shadow specifically to the world portals via a conflicting `shadow-ds-sm`/`shadow-ds-md` class pair, but that relies on Tailwind's generated-CSS declaration order to resolve the conflict (not guaranteed-safe to eyeball without a build inspection) for a purely cosmetic nuance — skipped as not worth the risk for a "slightly stronger" ask that the existing hierarchy already reasonably satisfies. No new blur, glow, or gradient was added anywhere.

**Data integrity.** No component with real data logic was touched — `Hero`, `ContinueLearning`, `ProgressSnapshot`, `RecentResults`, `FocusNext`, and the world-portal availability/CTA logic in `WorldSection` are byte-identical to D5.1 except for the two className/wrapper changes described above. No new fabricated values of any kind.

**Responsive.** The `mx-auto max-w-[90rem]` rule applies at every breakpoint but is a no-op below 1440px (content already narrower than the cap fills the space exactly as it did in D5.1). `WorldSection`'s centered header uses `mx-auto max-w-2xl text-center`, which also degrades harmlessly on mobile (a centered short heading reads fine at any width). No `lg:`-gated override was needed since the underlying `main` on mobile is already narrower than either cap.

**Testing.** No text or DOM structure inside components changed (only wrapper `className`s), so the existing D5.1 dashboard test suite (`app/(app)/dashboard/page.test.tsx`, 13 tests) required no edits and was re-run unmodified to confirm no regression. Full suite re-run clean.

## 34. D6 implementation notes — Immersive SimulationShell + Floating Glass HUD (code-verified, awaiting manual visual approval)

### Audit findings (before any edit)

A dedicated read-only research pass (not this document) inspected the actual current code — not assumed from earlier D-stage notes, since GeoWorld development has continued in parallel throughout D1–D5.2. Findings that shaped every decision below:

- **Route shell**: `app/(immersive)/layout.tsx` → `MinimalShell` (`ProtectedRoute` + `QualityProvider` only, confirmed unchanged since D4). Each `[id]/page.tsx` (all 4 identical in structure) rendered a plain in-flow `<h1>+<p>` header above the scene — no shell existed yet.
- **`CanvasShell`**: non-fullscreen height was a fixed `h-[34rem]` (544px) regardless of viewport size; fullscreen height is `h-full`, relying on an ancestor `fixed inset-0` element that each scene manages itself.
- **`useFullscreen`** (`lib/useFullscreen.ts`): shared hook, but only Chemistry and Electricity call it. **GeoWorld and SimLab have zero fullscreen support today** — confirmed by grep, not assumed.
- **Chemistry World / Electricity Lab structure**: both use an `lg:flex-row` container — a main column (canvas + a large in-flow `glass-panel` info grid holding instructions/tutorial/quality selector/safety/guided-lab/notebook/etc.) plus the AI Teacher chat as a **permanently-mounted flex sibling**, `w-full lg:w-80` (320px on desktop), with no collapse state at all. Critically: each scene's own fullscreen wrapper (`wrapperRef`) only encloses the **canvas + its mode-toggle overlay** — the guided-lab panel, AI chat, safety warnings, and notebook are **outside** that wrapper and become genuinely invisible (native browser Fullscreen API behavior, not a CSS/z-index issue) while fullscreen is active. This was true before D6 and is unchanged by D6 — documented here as a known, pre-existing characteristic, not something this stage introduced or was asked to fix.
- **GeoWorld / SimLab structure**: simpler — canvas + an in-flow control grid below it, and a genuinely different, already-collapsible AI component (`AIAssistantChat`, floating bottom-right bubble, `isOpen` state) rather than the always-open `ChemistryTeacherChat`/`AITeacherChat` pattern used by Chemistry/Electricity.
- **GeoWorld git state at audit time**: latest committed stage was G5 (`bc571ec feat(geoworld): G5 countries borders and labels`), working tree clean (no uncommitted GeoWorld files). By the time D6 finished, the parallel session had progressed further (untracked `lib/geo/providers/volcanoes.ts`+test appeared during D6's own test runs) — confirmed via `git status` immediately before committing D6 that none of it was touched.
- **The Electricity "Лабораторная работа завершена" issue** (flagged in the D6 brief as something to investigate but not fix): confirmed real, and confirmed presentation-only. `lib/electricity-lab-catalog.ts:207`'s `finishStep()` sets a **static** `instruction: "Лабораторная работа завершена."` string for the 8th/last catalog step, unconditional on whether that step is actually unlocked. `components/lab/ElectricityGuidedLabPanel.tsx` renders `currentStep.instruction` verbatim once the student reaches step 8/8 — only the box's *color* changes with lock state (the "Завершить лабораторную работу" button is correctly `disabled` when not unlocked, with a separate hint explaining why), but the instruction text itself always reads as an announcement of completion. **Not fixed in D6** — per the brief's explicit instruction, this is logged here as a follow-up bug for a dedicated, narrowly-scoped stage, not folded into a shell/presentation stage.
- **SimLab reachability**: re-confirmed still true from D2 — a dedicated regression test (`dashboard/page.test.tsx`) asserts SimLab never appears on the dashboard; the route works but is reachable only by direct URL, by design.

### Shell vs. scene responsibility boundary (the important part for future development)

| Owned by **`SimulationShell`** (new, `components/simulation/SimulationShell.tsx`) | Owned by the **individual scene** (unchanged) |
|---|---|
| Back/exit control (→ `/dashboard`) | Fullscreen enter/exit (`useFullscreen`, per-scene toggle inside `SandboxModeOverlay`/`ElectricitySandboxOverlay` — Chemistry/Electricity only) |
| World identity (icon + accent from `lib/landing-worlds.ts`, real `simulation.title`) | Camera modes (`orbit`/`sandbox`), WASD locomotion, E-interaction, collider/reach system |
| Locale (`LocaleSwitcher`) | Drag systems (component/wire/chemistry object drag) |
| Theme (`ThemeToggle`) | Guided labs, experiment catalog, notebook, safety warnings, quality selector — all still in-flow below the canvas, **not** restructured in D6 (see explicit scope-limit below) |
| — (no fullscreen control: Chemistry/Electricity already own one via `SandboxModeOverlay`; GeoWorld/SimLab don't have one and D6 does not add one, per the brief's explicit "wrap only, nothing more" instruction for GeoWorld) | AI Teacher **contents** (chat UI, context building, backend contract) — only the *positioning* wrapper is new (`AITeacherDock`) |

`SimulationShell` floats (fixed positioning, zero layout height of its own) over the top edge of the scene rather than pushing it down, exactly matching the brief's "UI should float above the simulation." Its row wrapper is `pointer-events-none` with `pointer-events-auto` re-enabled only on the actual control clusters (back button + world identity pill, and the locale/theme cluster) — required per §14 of the brief: without this, the header's full-width transparent bounding box would otherwise silently swallow orbit-drag/WASD/wire-drag pointer events starting underneath its empty left/right margins.

### What changed, concretely

- **`components/simulation/SimulationShell.tsx`** (new) — described above. Resolves world icon/accent via a new `getWorldByModule()` helper added to the existing `lib/landing-worlds.ts` (not a second/conflicting world registry — same `LANDING_WORLDS` array the D2 Landing and D5 dashboard already use, just looked up by `Simulation["module"]` instead of the landing-only `key`). Falls back to a neutral accent for `simlab` (not in the promoted-worlds array, by design).
- **`components/simulation/AITeacherDock.tsx`** (new) — collapsible floating wrapper. Collapsed by default (a small `Bot` icon trigger pill, bottom-right); expanded state renders its `children` — the **exact, unmodified** `ChemistryTeacherChat`/`AITeacherChat` component — inside a `fixed bottom-4 right-4 w-80` container with its own close (×) affordance. No chat logic, context-building, or backend call was touched; only two call sites changed, both one-line wraps:
  - `ChemistryWorldScene.tsx`'s `ChemistryTeacherChatPanel` now returns `<AITeacherDock><ChemistryTeacherChat .../></AITeacherDock>` instead of the bare component.
  - `ElectricityLabScene.tsx`'s `TeacherChatPanel` — identical one-line wrap around `<AITeacherChat .../>`.
  - Neither file's `lg:flex-row` container structure was touched — removing the AI panel from normal flow (it's `fixed` now) means the main canvas column automatically reclaims the ~320px it used to cede to the sidebar, with zero JSX restructuring required beyond the two wraps above.
- **`components/scenes/CanvasShell.tsx`** — non-fullscreen height changed from the fixed `h-[34rem]` to `h-[75vh] min-h-[28rem] max-h-[48rem]`. This is the single highest-leverage, lowest-risk change for "the 3D world must dominate" (§2 of the brief): it's a pure CSS value, touches zero interaction/physics code, and applies uniformly to all four scenes (the shared component). The existing "snap instantly, don't transition height" bug-fix behavior (documented in a comment already in this file, protecting against a real prior scrollbar bug) was explicitly preserved — only the static value changed, not the animate/snap mechanism.
- **`app/(immersive)/*/[id]/page.tsx`** (all 4) — replaced the plain `<div><h1>+<p></div>` header with `<SimulationShell simulation={simulation}>{children}</SimulationShell>`. The old `<p>{simulation.subject}</p>` line was dropped (not replaced with an i18n string) — world category is now conveyed by the shell's icon+accent instead of a redundant repeated text label; `simulation.title` (real, per-simulation) is the shell's primary identity text.
- **i18n**: new `simulation` namespace (`back`, `aiTeacher.trigger/expand/collapse`) added to all three dictionaries, same typed-against-`ru` guarantee as every prior stage. `simulation.aiTeacher.trigger` deliberately reuses the same word already established by `aiTeacher.eyebrow` from the D2 Landing dictionary (not a new, inconsistent label).

### Explicit scope limits (what was deliberately NOT done, and why)

- **The large in-flow info grid below the canvas in Chemistry/Electricity** (instructions, tutorial panel, quality selector, safety warnings, guided-lab/catalog/notebook) was **not** converted into a floating bottom-sheet/drawer in this pass. That block is a heterogeneous mix — some pieces are genuinely primary interactive controls (Electricity's voltage/resistance sliders), others are secondary status (Chemistry's instructions text) — and safely restructuring ~3700 and ~1700-line files' internal composition without a way to visually verify the result carried real risk of a subtle behavioral regression the brief explicitly warned against ("Do NOT rewrite... D6 is presentation/shell integration... reuse existing components and state"). This is the same staged-caution pattern already established by D5→D5.1→D5.2 (ship a real improvement, get manual visual sign-off, iterate). It remains fully reachable exactly as before — below the now much-taller canvas, not removed or hidden.
- **GeoWorld and SimLab's own overlay JSX/controls** were not restyled or repositioned beyond the shared `CanvasShell` height change and the new `SimulationShell` wrap — per the brief's explicit "D6 may wrap GeoWorld in SimulationShell and style its existing UI overlays. Nothing more." No GeoWorld G-stage file (`components/geo/*`, `lib/geo/*`, `GlobeControls`, tile/imagery/elevation/border/label engines) was opened for editing.
- **No fullscreen was added to GeoWorld/SimLab.** Adding it would mean wiring a new `wrapperRef`/`useFullscreen()` call into scenes that never had one — a real behavior addition, not a shell/visual change, and out of scope here.
- **The Electricity finish-step copy bug** — documented above, not fixed, logged as a candidate for its own narrowly-scoped follow-up.

### Testing

`components/simulation/SimulationShell.test.tsx` (5 tests) and `components/simulation/AITeacherDock.test.tsx` (3 tests) — both render the real component tree (`ThemeProvider`+`LocaleProvider`, not mocked) and verify: real simulation title + children render; back link points at `/dashboard`; no `<nav>`/Rail is rendered (confirms this is not `StandardAppShell` leaking into immersive routes); Locale/Theme controls present; world icon/accent resolves for all three real modules plus the `simlab` fallback without crashing; the AI dock is collapsed by default, expands to show the **exact** passed-in children (not a rebuilt chat UI) on trigger click, and collapses again via its own close control. Existing Chemistry/Electricity/GeoWorld/SimLab test suites (interaction/physics-focused, not layout-focused) were re-run unmodified and stayed green — the two isolated wrap points (`ChemistryTeacherChatPanel`, `TeacherChatPanel`) don't touch anything those tests assert on.

### Known limitations

- Visual/interactive correctness (does the floating header actually look right over each scene's specific color palette, does the taller canvas cause any per-scene camera/FOV framing to feel off, does dragging near the very top of the canvas ever brush against the header's pointer-events-auto zone in practice) has **not** been verified in a real browser — no browser automation tool is available in this environment. Everything reported here is: static analysis of the audit, `tsc`/`lint`/`vitest` (all green), and `curl`-level SSR/compile checks (200 status, no error markers) for all 4 immersive routes.
- The Chemistry/Electricity in-flow info grid is unstyled by D6 — it will look visually inconsistent next to the new floating chrome until a future stage addresses it (tracked above, not silently ignored).

---

## 35. D6.1 implementation notes — Immersive Visual Polish + Theme + RU/EN/TG Integration (code-verified, awaiting manual visual approval)

### Why this stage exists

D6 built a real `SimulationShell` (floating header) and `AITeacherDock` (collapsible AI panel), but manual browser inspection of Electricity Lab found the *rest* of each scene — the canvas frame, the whole info block below it, the AI chat's own internals, the sandbox HUD — untouched: still the pre-Design-V2 `.glass-panel`/`slate-*`/`neon-violet` palette, and still 100% hardcoded Russian. D6.1 is a **presentation + localization correction**, not a rewrite: zero interaction/physics/state-machine code was touched in either `ChemistryWorldScene.tsx` or `ElectricityLabScene.tsx`.

### Exact cause of the incomplete translation (§1 of the brief)

A dedicated read-only audit (two parallel research passes, one per world) inventoried every visible string and every legacy CSS class across the full component tree each scene mounts — `SandboxModeOverlay` (shared), both AI chat components, both guided-lab panels, both experiment/task panels, both autosave badges, plus the catalog browsers, notebook/report panels, resume modals, tutorial panels, and completion screen. Finding, confirmed by grep across all ~26 files: **zero** of them imported `useLocale` or `useTheme`, and **zero** used any Design V2 token (`bg-background`, `text-text-*`, `bg-accent`, `.ds-glass`, etc.) — every one relied exclusively on the legacy `.glass-panel`/`border-glass-border`/`neon-violet`/`slate-*` vocabulary from before D1. The root cause wasn't a bug in the LocaleProvider/ThemeProvider (those have worked correctly since D1/D2) — it's that D0–D6 only ever wired the *shell around* the labs (AppShell, Landing, Auth, and now SimulationShell) onto the new system; nobody had yet touched the lab UI *inside* the shell. D6.1 is that missing pass, applied to a deliberately bounded, high-visibility subset (below).

### Bounded scope (§1–§3 of the brief) — what's translated/retuned vs. deferred

The audit surfaced roughly 120–150 UI-chrome strings per world *plus* a separate, much larger surface: **147–202+ Cyrillic string literals inside the catalog data files** (`lib/electricity-lab-catalog.ts`, `lib/chemistry-lab-catalog.ts` — per-experiment titles/descriptions/goals/theory paragraphs/step instructions/question prompts) and a handful of dynamically-generated safety-engine messages (`lib/chemistry-safety.ts`, the electricity safety checker). Translating catalog/safety-engine content would mean changing those files' **data schema** (each field becoming a `{ru,en,tg}` object or a translation-key lookup) — a real data-model change, not a presentation fix, and exactly the kind of "risky domain change" both the D6 and D6.1 briefs explicitly say not to fold into a shell/visual stage.

**Translated + retuned to D1 tokens in this pass** (the main interactive surface — everything a student sees during a normal session: open lab → adjust controls → work through a guided step → ask the AI → check status):
- `components/chemistry/sandbox/SandboxModeOverlay.tsx` (shared by both worlds — mode badge, fullscreen button, mode-toggle button + F2 hint, sandbox control-hints panel; dev-only F3 diagnostics panel intentionally left unlocalized/unstyled, it's a developer tool)
- `components/lab/AutosaveBadge.tsx` + `ElectricityAutosaveBadge.tsx` (all status labels/tooltips)
- `components/ai/ChemistryTeacherChat.tsx` + `AITeacherChat.tsx` (header, greeting, placeholder, send/copy/clear-history, thinking/error states, and the 6-item suggested-questions list — small and static, unlike the catalog)
- `components/lab/GuidedLabPanel.tsx` + `ElectricityGuidedLabPanel.tsx` (step counter, headings, buttons, conclusion field; `currentStep.instruction`/`.objectives`/`.safetyNotes`/`.goal` stay untranslated — catalog data, see above; dev-only "Dev Autosave" block left as-is)
- `components/experiments/ExperimentPanel.tsx` + `components/tasks/TaskPanel.tsx` (status/difficulty labels, counters, buttons; `experiment.title`/`.description`/`.goal` and validator error/warning messages stay untranslated — catalog/validator data)
- The large in-flow info block in both `ChemistryWorldScene.tsx` and `ElectricityLabScene.tsx` (instructions blurb, sound toggle, active-container selector, quality selector, section headings, emergency-stop panel, terminal legend, voltage/resistance slider labels, clock/reset controls, the 4-state circuit-status message) — the single biggest visible source of the "still feels like an old page" complaint (§11 of the brief)

**Explicitly deferred, not silently dropped** — lower-frequency screens the audit also found still on the legacy palette/language, listed here as a concrete follow-up target rather than left undocumented: `ExperimentCatalogBrowser.tsx`/`ElectricityExperimentCatalogBrowser.tsx`, `CompletionScreen.tsx`, `LabNotebookPanel.tsx`/`ElectricityLabNotebookPanel.tsx`/`ElectricityLabReportPanel.tsx`, `ResumeExperimentModal.tsx`/`ElectricityResumeModal.tsx`, `ChemistryTutorialPanel.tsx`/`TutorialPanel.tsx` — plus, permanently out of scope for a shell/visual stage: all catalog experiment content and safety-engine-generated message text.

### Locale architecture after this fix (§2, §7 of the brief)

No new i18n system — everything routes through the exact same `useLocale()`/`lib/i18n/dictionaries/{ru,en,tg}.ts` typed-dictionary architecture from D2. Two new top-level namespaces, `chemistry` and `electricity` (plus a small shared `sandboxHud` namespace for the one component both worlds render), added to all three dictionaries with the same "typed against `ru`" compile-time guarantee as every prior namespace — a missing EN/TG key fails the build. Dynamic values (voltage readings, wall-registry counts, step numbers) use a plain `"{placeholder}".replace(...)` convention consistent with how the rest of the codebase already interpolates — no new templating mechanism introduced. Switching language updates every retuned string immediately (verified by test, see below) with no reload, because it's the same React context re-render D2 already established.

### Theme architecture after this fix (§4–§7 of the brief)

Also unchanged — the existing D1 `ThemeProvider`/semantic-token system. What changed is that the lab components now actually *consume* those tokens (`bg-surface`, `text-text-primary/secondary/muted`, `border-border`, `bg-accent`, `.ds-glass`) instead of hardcoded `slate-*`/`neon-violet`/`.glass-panel`, so Light/Dark now visibly propagates into them for the first time. One deliberate exception, per the brief's own instruction to separate "UI chrome theme" from "physical/scientific environment": `CanvasShell.tsx`'s WebGL scene-background gradient (`backgroundTop`/`backgroundBottom`, the texture behind the 3D room) is **not** wired to the theme — it was retuned from a saturated indigo-navy (`#1e2340`→`#04050c`) to a neutral graphite-with-a-cool-undertone gradient (`#1c1f26`→`#05060a`), addressing the "old dark-blue identity" complaint directly, but stays the same in both Light and Dark, since it's scene atmosphere, not UI.

### What changed navy → Design V2, concretely (§4, §9–§11 of the brief)

- Both scenes' outer canvas-column wrapper: `bg-gradient-to-b from-slate-900 via-slate-950 to-black` → `bg-surface border border-border/[0.08]` (the "big navy rectangle" is gone).
- `CanvasShell`'s scene-background gradient: retuned as above (applies uniformly to all four scenes, including GeoWorld/SimLab, via the one shared component — zero G-stage files touched to get this).
- The below-canvas info block in both scenes: `.glass-panel` → real `.ds-glass`; every `text-slate-*`/`border-glass-border`/`neon-violet` → the matching semantic token (`text-text-primary/secondary/muted`, `border-border/[0.1]`, `text-accent`/`bg-accent`); status colors (danger/warning/success) moved from raw Tailwind `red-*`/`amber-*`/`emerald-*` to the semantic `danger`/`warning`/`success` tokens.
- `SandboxModeOverlay` — the top HUD unification (§9 of the brief): its mode badge, fullscreen button, and mode-toggle button now all use the same `.ds-glass` pill styling as `SimulationShell`'s header, so the two floating chrome pieces read as one coherent system instead of "unrelated buttons," without merging them into a single DOM element (they stay two small floating groups, matching the brief's own "one or two coherent floating glass groups" framing). Small bonus: the mode-toggle button's raw 🎥/🚶 emoji were replaced with `Camera`/`Footprints` lucide icons, matching the icon language used everywhere else in Design V2 rather than reading as a gamified HUD.
- Both AI chat components (`ChemistryTeacherChat`/`AITeacherChat`) — full retune to `.ds-glass`/`ds-input`/semantic tokens, so the AI dock (functionally already collapsible since D6) now also *visually* matches the rest of the shell and responds to Light/Dark, addressing "AI Teacher looks separate from the overall shell" (§13).

### Fullscreen (§14 of the brief) — investigated, not force-changed, limitation documented

Re-confirmed from the D6 audit: each scene's `useFullscreen(wrapperRef)` wraps only the canvas + `SandboxModeOverlay`, not `SimulationShell` (which renders one level up, at the `page.tsx` level, entirely outside that `wrapperRef`). Making `SimulationShell`'s header/AI dock visible *during* native browser fullscreen would require lifting fullscreen ownership from inside each Scene component up to `SimulationShell` itself — a real inversion of control (the `isFullscreen`/`toggleFullscreen` values are currently consumed by `SandboxModeOverlay` and `CanvasShell` deep inside each scene's own render tree), not a class-name-level presentation change. Per the brief's own explicit fallback instruction ("if it requires risky restructuring, do NOT force it — document the limitation"), this was **not implemented**. Documented precisely here as the limitation: **while in fullscreen, only the in-canvas `SandboxModeOverlay` chrome (mode/fullscreen toggle, sandbox hints) remains visible — `SimulationShell`'s header and the `AITeacherDock` trigger are not visible during fullscreen**, exactly as was already true before D6/D6.1 (not a regression, a pre-existing characteristic now explicitly written down instead of implicit). The existing fullscreen mechanics (`useFullscreen.ts`, the scrollbar/overflow fix, snap-not-animate height behavior) were not touched at all.

### Electricity completion-copy bug (§18 of the brief)

Re-confirmed present (`lib/electricity-lab-catalog.ts:207`'s static finish-step instruction, `components/lab/ElectricityGuidedLabPanel.tsx` rendering it verbatim regardless of unlock state) — **not fixed** in D6.1, per the brief's explicit instruction not to mix it into this stage even if the fix looked trivial. It remains an open, separately-scoped follow-up item.

### GeoWorld boundary (§15 of the brief)

Confirmed via `git status` immediately before every commit in this stage: no file under `components/geo/`, `lib/geo/`, or `components/scenes/GeoWorldScene.tsx` was opened for editing — the parallel G-session was actively modifying several of these files (`GlobeControls.tsx`, `elevation-sampling.ts`, `tile-lod.ts`, a new `GlobeControls.test.ts`) throughout this stage, none of it touched. GeoWorld benefits from D6.1 only indirectly and safely: the shared `CanvasShell` background retune (applies to all four scenes uniformly, zero G-file changes required) and — if a student opens GeoWorld — the same `SimulationShell` header from D6. GeoWorld's own `AIAssistantChat` (a different, already-collapsible component, not `AITeacherChat`/`ChemistryTeacherChat`) and its own control grid were not touched.

### Testing (§21 of the brief)

11 new/updated tests, all exercising the *actual* locale-switch mechanism (not just checking default-locale strings): `SandboxModeOverlay.test.tsx` (new, 6 tests) — renders in Russian by default, switches every visible string to English with no reload, correct fullscreen-state labels, per-caller `disabledReason` override still respected, click still calls `onToggleMode`. `AITeacherDock.test.tsx` — one new test confirming the collapsed trigger label follows the active locale. `SimulationShell.test.tsx` — one new test confirming a real click on the `LocaleSwitcher` (not a localStorage simulation) updates the shell's back-link text immediately while the real simulation title (data) stays unchanged. `AutosaveBadge.test.tsx` and `ElectricityGuidedLabPanel.test.tsx` — updated to wrap in `LocaleProvider` (now required, since these components call `useLocale()`) and, for the latter, to assert the new semantic `text-warning` class instead of the retired literal `amber` class name — a legitimate test update reflecting an intentional token rename, not a workaround. Full suite: **101 files / 874 tests, all passing** (up from 101/860 before the two `LocaleProvider`-related fixes were applied — those were real, caught regressions, not pre-existing failures, both fixed in this same pass). `tsc`/`lint` both clean.

### Known limitations

- No browser automation available — actual visual/interactive correctness (does the retuned HUD look coherent against each scene's specific palette, does Light mode read as intentional rather than "inverted dark," does the AI dock's new styling look right mid-conversation) has not been visually verified, only reasoned through code + `tsc`/`lint`/`vitest` + `curl`-level compile/SSR checks (all four immersive routes: clean 200s, no error markers, both on hot-reload and a full fresh `.next` rebuild).
- The deferred-content list above (catalog browsers, notebook/report panels, resume modals, tutorial panels, completion screen) remains on the legacy palette/language — a real, acknowledged gap, not an oversight.
- Fullscreen chrome-visibility limitation documented above stands; not resolved in this stage.

## 36. D6.2 implementation notes — Remaining Lab UI Theme/i18n Cleanup (code-verified, awaiting manual visual approval)

### Root cause

D6.1 §521's "explicitly deferred" list — the catalog browsers, completion/report panels, notebook panels, resume modals, tutorial panels — was deferred as lower-frequency screens, but a real Light Mode screenshot of the Chemistry catalog showed exactly why that deferral had a visible cost: those files still used `bg-white/5` for "card" backgrounds. `bg-white/5` (5%-opacity white) only reads as a visible card *against a dark background* — composited over the new light `bg-surface`, it is nearly invisible, so cards, the search input, and the difficulty `<select>` all looked like plain flat light-gray shapes with no depth, and their `text-slate-*` labels (a dark-mode-only color ramp) read as low-contrast on light backgrounds. This is the same root mechanism D6.1 already fixed for the main HUD (§519) — legacy non-theme-aware classes — just in the files D6.1 deliberately hadn't reached yet.

### Audit (§1 of the brief)

No new research pass was needed — D6.1's own two-agent audit had already inventoried every visible string and legacy class in these exact 10 files (`ExperimentCatalogBrowser.tsx`, `ElectricityExperimentCatalogBrowser.tsx`, `CompletionScreen.tsx`, `ElectricityLabReportPanel.tsx`, `LabNotebookPanel.tsx`, `ElectricityLabNotebookPanel.tsx`, `ResumeExperimentModal.tsx`, `ElectricityResumeModal.tsx`, `ChemistryTutorialPanel.tsx`, `TutorialPanel.tsx`) with file+line precision; this stage re-read each file's current exact content (unchanged since that audit) and executed the same migration pattern D6.1 established, rather than re-discovering the same facts.

**A second, real gap found while re-verifying D6.1's own claimed scope**: `ChemistryWorldScene.tsx`'s and `ElectricityLabScene.tsx`'s main info blocks (confirmed via grep to be genuinely fully migrated — the "moved from `.glass-panel`/`slate-*`" matches remaining in those files are exclusively this-stage's own documentation comments, or the explicitly-excluded dev-only F3/Dev-Autosave panels, or in-3D `<Html>` tooltip badges, or the fullscreen wrapper's deliberately-dark background) — but three small pieces D6.1's own written scope (§529's file list) never actually named were still on the legacy palette: `LabModeSelector.tsx` (the Guided/Practice/Exam mode buttons rendered directly inside the already-migrated Chemistry info block — would have visually clashed against its now-retuned siblings), and Electricity's `ProgressBanners`/`CompleteLabSection` (the achievement/repeated-mistake toasts and the "Завершить попытку" completion controls). All three are fixed in this pass.

### What was migrated

- **Catalog browsers** (`ExperimentCatalogBrowser.tsx`, `ElectricityExperimentCatalogBrowser.tsx`) — the component explicitly named in the brief as unacceptable: search input and difficulty `<select>` now use `.ds-input` (already theme-correct, including the D3 autofill fix); experiment cards `bg-white/5` → `bg-surface-elevated` with `border-border/[0.1]`; every label/button ported to `t.chemistry.catalog.*`/`t.electricity.catalog.*`.
- **Completion/report panels** (`CompletionScreen.tsx`, `ElectricityLabReportPanel.tsx`) → `bg-surface`/`bg-surface-elevated`, semantic `success`/`accent` tokens, `t.chemistry.completion.*`/`t.electricity.report.*`. Assessment category *scores* and AI-generated summary text stay untranslated (real per-attempt data).
- **Notebook panels** (`LabNotebookPanel.tsx`, `ElectricityLabNotebookPanel.tsx`) → D1 tokens, `t.*.notebook.*`, and the hardcoded `.toLocaleString("ru-RU")` calls now resolve via a new `INTL_LOCALE_TAG: Record<Locale, string>` map (`lib/i18n/locales.ts`: `ru→"ru-RU"`, `en→"en-US"`, `tg→"tg-TJ"`) keyed off the active `useLocale()` locale — dates now format in the selected language, not always Russian.
- **Resume modals** (`ResumeExperimentModal.tsx`, `ElectricityResumeModal.tsx`) → solid `bg-surface-elevated` (dense structured data — glass-vs-solid rule, §26/§6), `t.*.resume.*`, same `INTL_LOCALE_TAG` date-locale fix. The `"{title}"`-interpolated body sentence is rendered by splitting the localized template on the literal placeholder and inserting the real (untranslated) experiment title as a `<strong>` in between, so the bold title still renders correctly in all three languages regardless of where the placeholder falls in the sentence.
- **Tutorial panels** (`ChemistryTutorialPanel.tsx`, `TutorialPanel.tsx`) → D1 tokens, `t.*.tutorial.*`. `currentInstruction` (per-step tutorial data) stays untranslated.
- **`LabModeSelector.tsx`** → D1 tokens; its 3 mode labels (Guided/Practice/Exam) are now sourced from `t.chemistry.hud.labMode{Guided,Practice,Exam}` in this component only — `lib/chemistry-lab-modes.ts` itself (and its `getModeConfig(m).label`, potentially used elsewhere) was **not** touched, since only this one component's *display* needed the fix.
- **`ProgressBanners`/`CompleteLabSection`** (inside `ElectricityLabScene.tsx`) → D1 tokens (`warning`/`accent-geo`/`accent`/`danger` replacing raw `amber`/`sky`/`neon-violet`/`red`), new `t.electricity.hud.{completeAttempt,completeAttemptError,scoreLabel,nextStepLabel,newAchievementsLabel,newAchievementSuffix,repeatedMistakeMessage}` keys.

### i18n architecture (unchanged mechanism, extended coverage)

Same `useLocale()`/typed-dictionary system as D2/D6.1 — five new sub-namespaces per world (`catalog`, `completion`/`report`, `notebook`, `resume`, `tutorial`) nested under the existing `chemistry`/`electricity` dictionary keys, same `{placeholder}`-string `.replace()` interpolation convention, same "typed against `ru`" compile-time completeness guarantee. One real structural bug caught and fixed while writing the RU dictionary: an early edit inserted the new `chemistry.*` sub-keys *after* `chemistry`'s own closing `}`, producing invalid object-literal syntax (orphaned keys between two top-level dictionary entries) — caught immediately by an isolated `tsc` check on the single file before propagating the same insertion pattern to `electricity`/EN/TG, not left for the full build to discover.

### Theme (§4–§7 of the brief, Light Mode specifically)

No new theming mechanism — this stage is entirely about *finishing* D1/D6.1's existing token adoption in files D6.1 hadn't reached, not inventing new rules. The specific Light Mode failure mode (`bg-white/5` invisible against light `bg-surface`) cannot recur in the migrated files since none of them reference raw `white/`-alpha or `slate-*` literals anymore — everything routes through `bg-surface`/`bg-surface-elevated`/`text-text-*`/`border-border`, which were already validated to work in both themes since D1.

### GeoWorld boundary

Untouched — confirmed via `git status` before staging; this stage's file list contains zero `components/geo/`, `lib/geo/`, or `GeoWorldScene.tsx` entries.

### Domain logic

Zero changes to physics/chemistry engines, backend contracts, experiment/task validators, safety engines, scoring, drag/pour/wire logic, or any state-machine/completion rule (including the still-open Electricity finish-step copy bug from D6.1 §557 — re-confirmed still present, still intentionally not touched here either).

### Testing (§21 of the brief)

Two pre-existing test files broke and were fixed — not pre-existing failures, real regressions caught by the full suite, same pattern as D6.1's own `AutosaveBadge.test.tsx` fix: `ResumeExperimentModal.test.tsx` and `ElectricityResumeModal.test.tsx` rendered the (now `useLocale()`-dependent) modals directly with no `LocaleProvider` ancestor; both fixed with the same `renderModal()`-wrapper pattern already established in D2/D3/D6.1's own tests. Full suite: **101 files / 874 tests, all passing** (up from 101/867 before the two fixes — both genuine catches, not workarounds). `tsc`/`lint` both clean. Manual `curl` check: `/chemistry_world/[id]` and `/electricity_lab/[id]` both compile and return 200 with no error markers on a fresh hit (first-compile latency on the ~3750-line Chemistry scene file noted, not an error).

### Known limitations

- No browser automation — the actual Light Mode fix (does the catalog now look like a real light surface, not just "less obviously dark") is reasoned through the same token substitutions already proven correct elsewhere (Landing, Dashboard, AppShell), not visually re-verified pixel-by-pixel in this pass.
- Deep-nested per-experiment catalog content (`lib/*-lab-catalog.ts`) and safety-engine-generated message text remain untranslated, unchanged from D6.1 — still a data-model change, still out of scope for a presentation stage.
- The dev-only F3 diagnostics panel (`SandboxModeOverlay.tsx`) and "Dev Autosave" block (`GuidedLabPanel.tsx`) remain unstyled/unlocalized by design (developer tooling, not product surface).
- Electricity finish-step misleading-completion-copy bug (D6.1 §557) remains open, unaddressed, by explicit instruction.

## 37. D7 implementation notes — Teacher Learning Analytics Center + test-data cleanup (code-verified, awaiting manual visual approval)

D7 diverged from §27's original plan (which had this slot as a SimulationShell visual migration) at the user's explicit direction, after a manual review of `/teacher` found it unacceptably weak (four KPI cards + a raw student list + an empty detail panel) and the dev database had accumulated 409 junk E2E-test student accounts. Two independent halves: **(A)** a one-time, audited, allowlist-based database cleanup, and **(B)** a real Teacher Learning Analytics Center rebuild.

### A. Student data cleanup

**Data model audit first** (backend is SQLAlchemy, not Prisma — `backend/app/models/*.py`): `User.role` (`student`/`teacher`/`admin`) with five `cascade="all, delete-orphan"` relationships (`lab_results`, `ai_logs`, `learning_profile`, `learning_events`, `chemistry_saves`) — no separate `Class`/`Student` entity existed at the time (confirmed via `results.py`'s own `# TODO: фильтр по классу, когда появится сущность Class` comment). No DB-level `ON DELETE CASCADE` on the foreign keys, so cleanup had to go through the ORM (`session.delete(user)` per row, not a raw bulk `DELETE`) for the cascades to fire correctly.

**Audit query** (read-only, run against the real dev Postgres DB via `DATABASE_URL`) found: **411 total users** — 409 students, 2 teachers, 0 admins. Of the 4 allowlist emails, only `sodatovjr@gmail.com` and `sodatovvv@gmail.com` existed (`sodatovruslan14@gmail.com` and `sodatovjr21@gmail.com` were absent — reported as absent, not created). Domain histogram across all 409 student rows: **407 were `@example.com`, 2 were `gmail.com`** (the two keep-list matches) — zero ambiguous domains, zero real-looking accounts outside the keep-list. Breakdown of the 407: 330 `e2e_*`, 72 `user_a_/user_b_/concurrency_*`, 5 one-off ad-hoc emails (`capability_*`, `catalog_check@`) whose originating script is no longer present in the tracked repo (likely a manual/ad-hoc run, not a committed spec).

**Source of the leak**: every Playwright spec under `frontend/e2e/**` that needs an authenticated session (`chemistry-isolated.ts`, `chemistry-water-pouring*.spec.ts`, `electricity-*.spec.ts`, `dashboard-catalog.spec.ts`) calls `POST /api/auth/register` against the real dev backend with a throwaway `@example.com` address and never deletes it. Backend pytest tests were already correctly isolated (in-memory SQLite per test, `tests/conftest.py`) — the leak was 100% from E2E, not from the pytest suite.

**Cleanup execution**: a dry-run (flush + rollback, no commit) was run first and printed exact before/after counts and the cascaded row totals, then the same query was re-run with `--commit`. Result: **407 student rows deleted** (0 lab_results, 0 ai_logs, 2 learning_events, 120 chemistry_saves, 2 learning_profiles cascaded with them), **2 keep-list students and both teacher accounts untouched**. Post-cleanup DB: 4 users (2 students, 2 teachers).

**Stopping future accumulation**: added `POST /api/auth/dev/cleanup-test-users` (`backend/app/routers/auth.py` + `cleanup_test_students()` in `auth_service.py`) — 404s outside `ENVIRONMENT=development` so it's not an attack surface in prod; deletes `role=student AND email LIKE '%@example.com'` via the same ORM-cascade pattern (domain-based, not prefix-based, so it doesn't need updating every time a new spec introduces a new test-email prefix). Wired into `frontend/playwright.config.ts` as `globalTeardown` (`e2e/global-teardown.ts`), which calls that endpoint once after the full Playwright run. Verified end-to-end live (register → 5 users → call endpoint → back to 4) before wiring it into the config.

### B. Teacher Learning Analytics Center

**Real data audit** (backend routers/services, not guessed): classified every candidate widget —

| Data | Classification | Source |
|---|---|---|
| total/active students, average score, completion rate | REAL NOW | existing `GET /api/results/stats` (unchanged) |
| per-student level/XP/completed labs/accuracy/weak topics/recent mistakes/streak/achievements | REAL NOW, but only exposed for `me` before D7 | `progress_service.compute_derived_stats` — same function, new teacher-facing endpoint |
| "needs attention" | DERIVABLE, deterministic | new: `completed >=1 task AND (accuracy < 50% OR has a weak topic)` — same thresholds already used by the student's own profile, no AI score |
| per-student/class world (module) breakdown | DERIVABLE | `LabResult` joined to `Simulation.module`, grouped; a module with zero results is omitted, never fabricated (this is how GeoWorld — which has no learning-result data yet — naturally disappears instead of showing a fake 0) |
| recent class activity | REAL NOW | `LabResult` + `User` + `Simulation` join, ordered by `completed_at desc` |
| "active"/"inactive" directory filter | DERIVABLE, not invented | same definition `ClassStats.active_students` already uses (has ≥1 `LabResult` ever) — deliberately **not** an invented recency window (e.g. "active in last 7 days"), which the brief explicitly warned against |

New backend: `backend/app/routers/teacher.py` (`GET /api/teacher/students-overview`, `/student/{id}`, `/recent-results`, `/module-breakdown`, all `require_role(TEACHER, ADMIN)`) + `backend/app/schemas/teacher.py`. Added a `module` field to `LabResultRead`/`LabResult` (mirrors the existing `simulation_title` computed property) so results can be grouped by world without a second query. No change to `progress_service.py`, no new scoring model, no AI risk score.

New frontend: `lib/teacher-client.ts` (typed client, same convention as `lib/progress-client.ts`), `components/teacher/{Hero,KpiRow,AttentionList,StudentDirectory,StudentDetailPanel,RecentClassResults,ModuleBreakdown,module-meta}.tsx`, full rewrite of `app/(app)/teacher/page.tsx` as the orchestrator (owns `selectedStudentId`, composes the sections in the brief's order: Hero → KPIs → Needs Attention → Directory+Detail → Recent Results → World Breakdown). Directory has search + a real filter set (`all`/`needs attention`/`active`/`inactive`) + sort (`activity`/`name`). Mobile: directory and detail never sit side by side — selecting a student swaps the directory out for a detail view with a "back" control (`lg:hidden`/`hidden lg:block` pair), per the brief's explicit mobile requirement. All new components use only D1 semantic tokens (`bg-surface`/`bg-surface-elevated`/`text-text-*`/`.ds-glass`/`.ds-input`) and a new `t.teacher.*` i18n namespace (RU/EN/TG) — glass for the floating KPI/attention chrome, solid `Surface` for the directory list and recent-results table, per the existing glass-vs-solid rule (§26).

### Concurrent work note — `Classroom`/`ClassMembership` (commit `c59f706`)

While this stage was in progress, a separate commit (`c59f706 feat(teacher): add classroom authorization foundation`, same author, not part of this D7 pass) landed on the branch adding a `Classroom`/`ClassMembership` model, an Alembic migration, `app/core/classroom_scope.py` (per-teacher student-access scoping helpers), and `/api/classes/*` CRUD — a real foundation for "a teacher only sees their own class's students." **D7's new `/api/teacher/*` endpoints do not use this scoping** — they follow the same MVP "one teacher sees all students" model the pre-existing `/api/users/` and `/api/results/stats` endpoints already use (documented as the deliberate MVP scope in `results.py`'s own comment, predating both D7 and `c59f706`). With only 2 real students and 2 real teachers in the DB today this has no visible effect, but it is a real, deliberate scope gap: if multiple teachers are meant to see only their own class's students, `/api/teacher/*` needs to be retrofitted with `classroom_scope.accessible_student_ids()` the same way `/api/classes/*` already uses it. Flagging this explicitly rather than either silently building around it or silently duplicating it — recommend a dedicated follow-up stage once the classroom feature itself is reviewed/approved.

### GeoWorld boundary

Untouched — confirmed via `git status` before staging; zero `components/geo/`, `lib/geo/`, `GeoWorldScene.tsx` changes. `frontend/app/(dev)/geoworld-engine-spike/page.tsx` also appeared modified in `git status` during this stage (the parallel session's own work) and was deliberately excluded from D7's `git add`.

### Domain logic

Zero changes to physics/chemistry engines, safety systems, experiment/task validators, scoring, drag/pour/wire logic, or `progress_service.py`'s XP/accuracy/weak-topic math — the new teacher endpoints call the same functions the student-facing `/api/progress/me` already used.

### Testing

Backend: `backend/tests/test_teacher.py` (5 new tests — role protection, real level/XP/needs-attention values, 404 for unknown student, module breakdown, recent-results/module-breakdown correctly omitting modules with zero data). Full backend suite: **80/80 passing** (includes the concurrent `c59f706`'s own 11 classroom tests — confirmed compatible together). Frontend: `app/(app)/teacher/page.test.tsx` (11 new tests — role protection, real KPIs, attention flagging + honest empty state, directory search, selected-student analytics, empty detail state, recent results + empty state, module-breakdown omission, EN locale rendering). Full frontend suite: **102 files / 885 tests passing**. `tsc --noEmit` and `next lint` both clean.

### Known limitations

- No browser automation was available in this session to visually confirm the layout; all checks are `tsc`/`lint`/`vitest`/`pytest` plus manual reasoning from the same token system already proven correct on other pages. Code/tests passing is not visual approval.
- `/api/teacher/*` is not yet classroom-scoped (see the concurrent-work note above) — every teacher currently sees every student, same as the pre-existing `/api/users/`.
- The known Electricity finish-step completion-copy bug (D6.1 §557) remains open, unaddressed, unrelated to this stage.

---

## 38. D8 implementation notes — Student Learning Center (code-verified, awaiting manual visual approval)

D7 was approved; the user also reported that a separate, parallel Codex session had independently completed T4/D7.1 (classroom-scoped Teacher Analytics), landing directly on this branch as multiple commits (`c59f706`, `71191b5`, `dea58e0`) outside this session. D8 was scoped strictly to Student Dashboard UX — explicitly not touching the classroom/chat/GeoWorld/physics work other sessions are running concurrently on the same working tree.

### Parallel-session safety

Per the brief's explicit §26, `git status`/`git log --oneline -15` were run before any edit. Found in-progress, uncommitted work belonging to the performance/security session (`backend/app/models/{ai_log,lab_result,learning_event}.py` modified, a new alembic migration for performance indexes) — none of it was touched, read, or staged. No `git reset`/`checkout .`/`clean`/blind `git add .` was used anywhere in this stage.

### Audit — what the "old" Student Dashboard actually was

D5/D5.1/D5.2 had already built a real hierarchy (Hero → Continue Learning + Progress → Worlds → Recent Results + Focus Next) — D8 did not start from a blank/weak page, unlike D7's `/teacher`. The actual gap (matching the user's "Teacher Center is now stronger than Student side" framing) was narrower than a full rebuild: no achievements anywhere on the Dashboard (only on `/profile`), Worlds cards showed catalog info but zero real progress per world, weak topics were shown without their strong-topic counterpart, and there was no synthesized "what should I do next" beyond raw resume mechanics.

### Data classification

| Data | Classification | Source |
|---|---|---|
| level/XP/streak/completed_labs/accuracy | REAL NOW | `GET /api/progress/me` (unchanged) |
| strong_topics/weak_topics | REAL NOW | same endpoint, already fetched, previously only weak topics were shown on Dashboard |
| achievements (unlock codes) | REAL NOW | same endpoint; **display metadata (title/description) was hardcoded English/Russian mixed text in `lib/achievements.ts`, never localized** — a real i18n bug, fixed this stage (see below) |
| active Chemistry save (resume) | REAL NOW | `GET /api/chemistry/saves` (unchanged) |
| Electricity resume | **NOT AVAILABLE** | confirmed (again) — no server-side Electricity saves router exists; Continue Learning correctly never fabricates one |
| recent lab results (score/duration/date) | REAL NOW | `GET /api/results/me` (unchanged) |
| per-result `module` (world) | REAL NOW but unexposed | the backend schema already returns it (added in D7 for the teacher endpoints, same `LabResultRead.module`) — `lib/types.ts`'s `LabResult` just didn't declare it; added as a pure type-level fix, zero backend change |
| per-world completed count / avg score / last activity | DERIVABLE | `GET /api/results/me` grouped by `module` client-side — no new endpoint |
| "what's next" recommendation | DERIVABLE, deterministic | see NextStep logic below — no AI, no invented copy |
| GeoWorld per-world progress | **NOT AVAILABLE (honestly represented)** | zero LabResult rows for `geo3d` today — world card shows "не начато", never a fake 0% |

### Information architecture — what was added, and what was deliberately NOT added

Final composition: Hero → (Continue Learning + Progress) → **NextStep** → Worlds (enhanced) → **Strengths/Needs Practice** (replaces the old weak-only Focus Next) → (Recent Results (enhanced) + **Achievements teaser**).

- **NextStep is not a duplicate of Continue Learning.** Continue Learning's job stays "resume what's in progress" (unchanged logic). NextStep only ever suggests something *different*: (1) a real weak topic, attributed to the student's most-recently-active world (from the newest `LabResult.module` — a real, derivable signal, not a fabricated topic→world mapping), with a CTA into that world; else (2) a world with real simulations but zero completed results — "try {world}"; else (3) renders **nothing** — a brand-new student (`completed_labs === 0`) or a student with no weak topics and no unexplored world left has nothing honest to add here, so the component returns `null` rather than inventing a message. This is the brief's §2 "remove the block if there's no honest data" instruction applied per-instance, not just at the page level.
- **A separate "Quick Actions" block (brief IA item I) was deliberately not built** — every actionable CTA already lives inside Continue Learning / NextStep / Worlds / Achievements; a standalone block would only repeat those same links. Documented here per the brief's own "trim blocks without honest independent purpose" instruction, not silently dropped.
- **Achievements teaser is a preview, not a second trophy wall** — up to 4 tiles (unlocked first), a real "All achievements" link to `/profile` (where the full grid, `ProgressDashboard.tsx`, already lives, untouched in structure). No duplication of the full grid.
- **Profile vs Dashboard boundary (brief §13)**: already reasonably separated before this stage (Dashboard = current state + resume; Profile = account + full `ProgressDashboard` with avg hints/attempts/recommended difficulty/full achievement grid) — D8 did not need to restructure `/profile`, only fix the achievement-text i18n bug it shared with the new Dashboard teaser (one shared `lib/achievements.ts`, fixed once, benefits both pages).

### i18n bug found and fixed (not scope creep — required by brief §17 for the new Achievements teaser)

`lib/achievements.ts` hardcoded achievement title/description as a mix of English (`"First Circuit"`) and Russian (`"Собрал первую замкнутую цепь"`) — never routed through the locale system, on both the pre-existing `/profile` grid and now the new Dashboard teaser. Fixed by moving title/description into a new top-level `t.achievements.<code>` dictionary namespace (RU/EN/TG, 8 codes), leaving `lib/achievements.ts` with only the emoji map (`ACHIEVEMENT_EMOJI`). Three real call sites updated: `ProgressDashboard.tsx` (`/profile`), the new `AchievementsTeaser.tsx`, and — found only by `tsc` failing after the refactor — two achievement-toast strings inside `ElectricityLabScene.tsx`'s `ProgressBanners`/`CompleteLabSection` (the same functions D6.2 already retuned) that also read the old hardcoded `ACHIEVEMENTS[code].title`; both now resolve through `t.achievements[code]` too, so the in-lab achievement toast is now genuinely localized for the first time.

### Continue Learning / Worlds / Progress

Continue Learning and Progress logic untouched (still exactly the D5.1 3-tier resume priority). Worlds (`WorldSection.tsx`) gained a real per-world stat line — completed count, average score, last activity — computed from `GET /api/results/me` (same `"results-me"` SWR key `RecentResults` already used, so this is zero extra network requests, not a new fetch per card) grouped by `module`. A world with real simulations but zero results says "не начато" (`t.dashboard.worlds.notStarted`), never a fabricated percentage; a world with zero simulations at all keeps the pre-existing "coming soon" state, which is a different, correct condition.

### Recommendation logic (NextStep)

Documented above under Information Architecture — restated for the report checklist: deterministic, two real tiers plus a silent "nothing to add" fallback, no AI-attributed copy anywhere (`t.dashboard.nextStep.*` never claims "AI recommends").

### Recent activity / Achievements

`RecentResults.tsx` gained a world-name badge per row (`getWorldByModule` + the same accent tokens Landing/Dashboard/Worlds already use), using the now-exposed `LabResult.module`. List stays capped at 5, unchanged. Achievements teaser described above.

### Empty states

Brand-new student: Hero shows real zeros (unchanged, pre-existing), Continue Learning shows its existing honest empty state, Progress shows its existing empty state, NextStep renders nothing, Strengths/Needs Practice shows a new honest empty state (`t.dashboard.strengths.empty`) instead of two empty cards, Worlds shows real simulation availability with "не начато" per world once any simulations exist, Achievements teaser shows a real "complete your first lab" empty state instead of a locked/empty grid. No `0%`, no empty chart, no empty table anywhere on first login.

### Mobile / tablet / desktop

No new grid patterns beyond what D5.1/D5.2 already established (`grid-cols-1` → `sm:`/`lg:` breakpoints throughout); NextStep's strip stacks the CTA under the text below `sm:`; Achievements teaser's tile grid is `grid-cols-2` on mobile, `sm:grid-cols-4` from tablet up; Strengths/Needs Practice is `grid-cols-1 sm:grid-cols-2`. No horizontal-scroll risk introduced (no fixed-width elements added).

### Light/Dark/System

No new theming mechanism — every new component uses only existing D1 semantic tokens (`bg-surface`/`bg-surface-elevated`/`text-text-*`/`border-success`/`border-warning`/`text-accent`/`GlassPanel`/`Surface`); grep-confirmed zero `bg-white/5`/`text-slate-*`/`.glass-panel`/hardcoded colors in any new or edited file.

### RU/EN/TG

All new strings (`t.dashboard.worlds.*` additions, `t.dashboard.strengths.*`, `t.dashboard.nextStep.*`, `t.dashboard.achievementsTeaser.*`, `t.achievements.*`) added to all three locale files, typed against `ru` (`Dictionary = typeof ru`) so a missing EN/TG key would be a compile error. Grep-confirmed zero hardcoded Cyrillic strings in any new component file.

### Accessibility

All new interactive elements (`ButtonLink`s) reuse the existing `ds-focus-ring`/semantic-`<a>` pattern already used everywhere else on this page — no new custom interactive widgets were introduced. Achievement tiles' locked/unlocked state uses a border/opacity pair (not color alone) plus a `title` tooltip with the real description, matching the exact pattern the pre-existing, already-approved `/profile` grid uses — not a new a11y gap.

### Performance

No new network requests: every new/changed component reuses an already-established SWR key (`"progress-me"`, `"results-me"`, or the `simulations` prop already fetched once at the page level) — confirmed by reading each `useSWR` call site, not by fabricated instrumentation. No chart library added; all stats are plain text/CSS. `WorldSection`'s per-card stat computation is a cheap array filter/reduce over an already-fetched, small (per-student) result list, not a new request per card.

### Testing

`app/(app)/dashboard/page.test.tsx`: extended from 15 to 23 tests (module field added to the existing mock `LabResult`, `focusNext`→`strengths` references updated, new coverage for real per-world stats/honest "not started" state, both NextStep recommendation tiers plus its silent brand-new-student fallback, and the achievements teaser's real-unlock + empty states). `app/(app)/profile/page.test.tsx`: +1 test locking in the achievement i18n fix (real unlocked achievement renders the localized RU title/description, not the old hardcoded mix) — required converting its `mockProgress` from `const` to `let` with a `beforeEach` reset, matching the dashboard test's existing convention. Full suite and `tsc`/`lint` results below.

### GeoWorld boundary

Untouched — confirmed via `git status`/`git diff` before staging; zero `components/geo/`, `lib/geo/`, `GeoWorldScene.tsx`, Cesium/MapLibre changes. The performance-session's in-progress model/migration files and the Codex classroom/chat work were left exactly as found.

### Domain logic

Zero changes to physics/chemistry engines, safety systems, scoring/XP formulas, achievement unlock rules, classroom/teacher authorization, or any backend contract — the one backend-adjacent fact used (`LabResultRead.module`) already existed from D7; nothing new was added to the backend in this stage.

### Known limitations

- No browser automation available this session — layout/spacing/visual weight reasoned through the same token system already proven on other pages, not visually re-verified pixel-by-pixel.
- `NextStep`'s "recently active world" heuristic (newest `LabResult.module`) is a real, derivable signal but an approximation — it doesn't guarantee the weak topic itself came from that exact world, just that it's the world the student most recently worked in. Documented rather than silently assumed to be exact.
- Achievements teaser's locked-tile accessibility matches the pre-existing `/profile` grid's pattern (border/opacity + title tooltip) — neither has an explicit `aria-label` stating "locked"; a genuine improvement opportunity, not introduced by this stage, not fixed here to avoid scope creep into an already-approved component's a11y contract without a dedicated review.

---

## 39. D9 implementation notes — Product-wide UX & Visual QA / Consistency Pass (code-verified, awaiting manual visual approval)

D8 was approved. D9 is not a single-page redesign — it's a QA pass across the whole product so Dashboard/Profile/Teacher Center/Chemistry/Electricity/shared chrome read as one finished product rather than stitched-together D-stages. Per the brief's explicit safety requirements, `git status`/`git log --oneline -15` were run before any edit, and again before staging.

### Parallel-session state at the start of D9

Several other sessions were active on this same working tree: a performance/security pass (`backend/app/models/{ai_log,lab_result,learning_event}.py` mid-edit, a new alembic migration for performance indexes) and a new GeoWorld MapLibre spike (`frontend/app/(dev)/geoworld-maplibre-spike/`, untracked). Neither was touched, read for editing, or staged — confirmed clean via `git status` again immediately before commit.

### Audit method

Rather than one pass, three parallel read-only audits were run (student-facing routes/components, teacher-facing routes/components including the Classes feature a separate Codex session added on top of D7, and the shared AppShell/design-system-primitives layer) against the same reference: `EDUMIND_DESIGN_SYSTEM_V2.md` §26 (glass-vs-solid rule) and the semantic token set. Combined, they surfaced ~35 concrete findings with file+line citations. This section only lists what was actually fixed and what was deliberately deferred — the full raw findings aren't reproduced here.

### Consistency fixes (shared layer — highest blast radius)

- **`app/globals.css`**: `body` was still hardcoded `bg-surface-deep text-slate-100` (pre-V2 legacy, non-theme-reactive) — the single highest-blast-radius legacy leak in the app, since every page inherits it. Fixed to `bg-background text-text-primary`. Also removed confirmed-dead CSS (`.ai-assistant-pulse`/`pulse-glow` keyframe — grep-confirmed zero remaining references anywhere).
- **`components/ui/Loader.tsx`**: rendered by `ProtectedRoute` on every protected-route load, used `border-brand` (legacy static color) with no background of its own — combined with the `body` bug above, this produced a full-screen dark flash on every auth check even in Light Mode. Retuned to `border-accent` + explicit `bg-background`.
- **`components/appshell/TopBar.tsx`**: was `.ds-glass` itself, while `LocaleSwitcher`/`ThemeToggle` (rendered inside it) and `AccountMenu`'s dropdown (`GlassPanel`) are *also* glass — nested glass-on-glass on every standard-shell page, directly violating `GlassPanel.tsx`'s own documented "never nest a GlassPanel inside another GlassPanel" rule (§6). Changed `TopBar` to a solid bar (`bg-surface` + `border-b border-border/[0.08]`), matching `Rail`'s existing solid treatment — the nested controls now sit on solid chrome, not glass-on-glass.
- **`components/design-system/Button.tsx`**: stale doc comment claiming it was "not wired into any existing page yet" — now used across Profile/Auth/Dashboard/Teacher/Classes; comment corrected.

### Consistency fixes (Teacher Center — Classes/ClassDetail)

The Classes feature (added on top of D7 by a separate Codex session) turned out to be *substantially* on-token already — correct `Surface` usage, correct glass-vs-solid rule, fully localized RU/EN/TG (confirmed by the audit, not assumed). The real, narrow gaps fixed:
- `ClassesList.tsx`/`ClassDetail.tsx` used the legacy `Loader` full-screen spinner (including one case where it rendered *inside* a `p-6` wrapper, breaking out to full viewport height) instead of the `Skeleton` pattern every D7 reference component uses. Replaced with sized `Skeleton`s; `ClassDetail`'s loading state now also keeps the back-link visible instead of blanking the whole page.
- Both files formatted dates via bare `toLocaleDateString(locale)` instead of `INTL_LOCALE_TAG[locale]` (the one inconsistent spot in the whole Teacher Center's date formatting — every D7 component already does this correctly). Fixed at both sites.
- Three hand-rolled inputs duplicated `.ds-input`'s exact rule set instead of using the class — replaced with `ds-input ds-focus-ring` (+ the same pill/icon treatment `StudentDirectory`'s own search input already uses, for the search-with-icon case).
- `ClassDetail.tsx`'s archived-class banner tinted itself by overriding `Surface`'s own `border`/`bg` classes via `className` — two same-property Tailwind classes fighting, with the winner determined by generated-CSS rule order, not visually guaranteed. Changed to a bare tinted `div`, matching how every other single-color tint in the app is applied directly rather than through a primitive's own slots.
- `ClassFilter.tsx` was a bare `<label>` sitting directly on the page background between `Hero` and `KpiRow` (no panel, no section semantics) and used a different select shape (`rounded-ds-control`) than `StudentDirectory`'s pill filters (`rounded-full`) for the same "filter" role on the same page. Wrapped in a `Surface` bar and switched to the pill-select treatment.

### Consistency + accessibility fixes (student layer)

- **4 immersive routes** (`chemistry_world`/`electricity_lab`/`geo3d`/`simlab` `[id]/page.tsx`) each had an identical bare `<p className="text-sm text-slate-400">Симуляция не найдена.</p>` fallback — legacy color (invisible in Light Mode), hardcoded Russian never routed through `useLocale()`, and no way back to the app. Replaced all 4 with one new shared `components/simulation/SimulationNotFound.tsx` (real `t.simulation.notFound`/`.backToDashboard` keys, a `Surface` + `ButtonLink` back to `/dashboard`) instead of four copies to keep in sync.
- **`ChemistryTeacherChat.tsx`** was missing `role="log" aria-live="polite"` on its message history and `aria-label` on its send button — both present on its structurally-identical sibling `AITeacherChat.tsx`. Also its `t.chemistry.aiChat` dictionary block was missing the `sendAria` key entirely (not just unused in the component — genuinely absent from all 3 locale files). Added the key to RU/EN/TG and wired both attributes.
- **Hardcoded unit abbreviations** inside otherwise-fully-localized components: `LabNotebookPanel.tsx` had a literal `кПа` after a real interpolated number; `ElectricityLabReportPanel.tsx` had literal `В`/`А`/`Ом`/`Вт` in its measurement rows. In English locale these rendered as e.g. "R = 12.0 Ом". Added `kpaUnit`/`unitVolt`/`unitAmpere`/`unitOhm`/`unitWatt` to the relevant dictionary namespaces (RU/EN/TG) and wired them in.

### Accessibility fixes (interaction consistency)

- **`AccountMenu.tsx`**: closing via Escape now returns focus to its trigger button (the standard disclosure-menu pattern) — previously focus was left on the now-hidden menu, stranding keyboard users. Outside-click close deliberately does *not* steal focus back (the user's attention already moved elsewhere).
- **`MobileDrawer.tsx`**: (a) now saves and restores whatever had focus before it opened (the hamburger trigger, external to the component) instead of leaving focus on the vanished close button; (b) gained a real Tab/Shift+Tab focus trap — previously a keyboard user could Tab straight through the drawer into the visually-obscured background page despite the backdrop and scroll-lock. `TopBar.tsx`'s hamburger button now also explicitly focuses itself on click (some browsers, notably Safari, don't focus buttons on click by default — this made the "restore previous focus" behavior deterministic everywhere, not just where the OS/browser happens to focus on click).
- **`ResumeExperimentModal.tsx`**: icon-only close (X) button had no accessible name (screen readers announced only "button") — added `aria-label={r.cancelButton}`, reusing the same locale string the visible Cancel button already uses.

### Deliberately deferred (documented, not silently skipped)

- **`GeoWorldScene.tsx`'s control panel** (full legacy-token vocabulary — `.glass-panel`, `neon-cyan`/`neon-violet`, `surface-deep`, `text-slate-*`) — the single largest remaining visual-maturity gap found by the audit. Not touched: this file is inside the explicit GeoWorld boundary this session (and every prior D-stage) has been instructed never to touch, and `git log` shows very recent, actively in-progress GeoWorld commits (G6.6.1, plus the untracked MapLibre spike) — editing it risks colliding with concurrent work on the exact same file. Recommended as a dedicated, GeoWorld-team-coordinated stage.
- **`AIAssistantChat.tsx`** (GeoWorld/SimLab's floating AI chat, full legacy palette — `bg-slate-900/70`, `border-white/15`, `text-slate-*`) — not under `components/geo/`/`lib/geo/` so not strictly inside the GeoWorld boundary, but a full migration to the `AITeacherChat`/`ChemistryTeacherChat` pattern is a non-trivial component rewrite; deferred to keep this pass's diff reviewable rather than rushed.
- **Chemistry vs. Electricity "resume saved session" UX gap**: Chemistry's `ResumeExperimentModal` is a true overlay modal with Cancel/Restart/Continue, triggered from an in-catalog active-save badge; Electricity's `ElectricityResumeModal` is a non-dismissable inline card with only Restart/Continue (no way to just go back to browsing), and its catalog has no active-save badge at all. This is a real behavioral inconsistency, not just a style difference — fixing it means changing interaction flow inside `ElectricityLabScene.tsx` (1700+ lines, real e2e coverage), which is bigger/riskier than a token/consistency fix. Documented for a dedicated follow-up rather than rushed alongside ~20 other fixes in one pass.
- **Heading-scale (`text-ds-title`) and body-scale (`text-ds-body`/`text-ds-caption`) sweep across all Chemistry/Electricity lab panels** (catalog browsers, notebook panels, report panels, resume modals, tutorial panels, guided-lab panel) — confirmed by the audit to be genuinely inconsistent (4 different heading sizes across otherwise-equivalent panels, raw `text-sm`/`text-xs`/`text-[10px]` instead of the DS scale throughout). This is real and worth doing, but touches ~10 files each with their own D6.1/D6.2-era test coverage — a mechanical sweep at that scale risked turning a QA pass into a rewrite. Deferred as a named, scoped follow-up rather than attempted piecemeal.
- **Lab action buttons' `rounded-full` pill shape** vs. the shared `Button` primitive's `rounded-ds-control` — consistent *within* the lab family, but a second, never-reconciled button language. Not changed: unlike the other fixes here, this is a visual *decision* (pill vs. rounded-rect), not an unambiguous bug, and changing button shape across ~8 files is a more visible change than this pass's other token-level fixes — left for an explicit design decision rather than made unilaterally.
- **Classes' `window.confirm()`** for archive/remove actions — visually off-brand (native browser dialog) but there is no in-app confirmation-modal primitive anywhere in the codebase yet to replace it with, and building one is a new subsystem the brief explicitly says not to add speculatively. Also already accessible by default (native dialogs are keyboard/AT-friendly), so this is a polish gap, not a functional or accessibility regression.

### Light/Dark/System

No new theming mechanism. Every fix in this pass either removes a legacy non-theme-aware class or reuses an already-proven semantic token — the `body`/`Loader` fix specifically closes the one Light-Mode "dark flash" bug found. No component audited was found using raw hex/rgb colors within this pass's fixed scope.

### RU/EN/TG

Every new/changed string (`t.simulation.*` additions, `t.chemistry.aiChat.sendAria`, `t.chemistry.notebook.kpaUnit`, `t.electricity.report.unit{Volt,Ampere,Ohm,Watt}`) added to all three locale files, typed against `ru` so a missing EN/TG key is a compile error, not a runtime gap.

### Accessibility

Covered above (AccountMenu/MobileDrawer focus handling, ResumeExperimentModal aria-label, ChemistryTeacherChat aria-live/aria-label parity). Not attempted as a full audit-to-zero pass — per the brief's own "don't turn this into a giant accessibility rewrite" instruction, fixes were limited to concrete, confirmed gaps with an exact known-good sibling to match, not a speculative sweep.

### Performance-related frontend findings

No backend performance work done (none needed — no shared contract changed). No new duplicate-request patterns introduced: all new/changed components reuse existing SWR keys or props. No chart libraries added. No layout-shift-prone changes (token/class swaps only, no structural reflow).

### Testing

`components/simulation/SimulationNotFound.test.tsx` (new — real message + working back-link). `components/lab/ResumeExperimentModal.test.tsx` (+1 — close button has a real accessible name). `components/appshell/StandardAppShell.test.tsx` (+2 — mobile drawer and account menu both return focus to their trigger on Escape, exercised through the real integrated shell, not a mocked sub-component). One real regression caught and fixed while adding the mobile-drawer test: the "restore previously-focused element" approach only works if the trigger was actually focused when the drawer opened, which isn't guaranteed by a raw click in every browser (Safari doesn't focus buttons on click by default) — fixed by having `TopBar`'s hamburger explicitly focus itself on click, which also made the test deterministic. Full suite: **104 files / 906 tests passing** (up from 103/902 before this stage). `tsc --noEmit` and `next lint` both clean.

### Manual visual QA

Not performed — no browser automation tool available this session, and the frontend dev server was not running (stopped earlier at the user's own request for manual inspection, not restarted since). Every fix in this pass is reasoned from the same token system already visually proven on other approved pages (Dashboard, Teacher Center), not re-verified pixel-by-pixel. Code/tests passing is not visual approval.

### GeoWorld boundary

Confirmed untouched via `git status`/`git diff` before staging — zero changes to `components/geo/`, `lib/geo/`, `GeoWorldScene.tsx`, or the MapLibre spike. The performance-session's in-progress model/migration files were also left exactly as found.

### Domain logic

Zero changes to physics/chemistry/electricity engines, safety systems, scoring/XP, classroom/teacher authorization, or any backend contract — this entire stage is frontend presentation/interaction-consistency only, no backend files touched.

---

**Current task scope**: D9 (Product-wide UX & Visual QA / Consistency Pass, done, this pass) — see §39. **Code/tests passing is not visual approval** — D10 does not begin until this pass is manually inspected in the browser (Light/Dark, mobile drawer/account-menu keyboard behavior, Classes loading states, the 4 not-found fallbacks) and approved.
