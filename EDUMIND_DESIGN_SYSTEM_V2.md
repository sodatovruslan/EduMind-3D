# EduMind 3D — Design System V2

Status: **APPROVED — implementation in progress.** Sections 0–18 below are the original presentation-layer architecture (approved). Sections 19+ extend it to the full product (Public → Auth → Student/Teacher) per the 2026-08-08 follow-up brief, with a revised D0–D14 roadmap that supersedes the old D0–D9 table. **D0, D1, D2, D3 are done** (foundational tokens/primitives + theme system + Public Landing + Auth experience, §28–§29). **D4 (authenticated AppShell/navigation) is done** — see §30. D5 (Student Home + Student Profile) has not started; waiting for approval before continuing.

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
| `/dashboard` (`(app)/dashboard/page.tsx`) | "Мои симуляции" — search bar + flat card grid of all simulations, identical for every role | **Student Home** (learning hub): greeting/status, continue learning, worlds grid, recent activity, recommended next experiment, progress summary, achievements, AI Teacher entry point. Teachers no longer land here | Student | D5 | Not started (internal content). Now mounted inside `StandardAppShell` (D4) — page content itself untouched |
| `/teacher` (`(app)/teacher/page.tsx`) | Class stats (`ClassStats`) + student list + inline result table, gated via `ProtectedRoute allowedRoles={["teacher","admin"]}` | **Teacher Home**: class overview (same `/api/results/stats`), students needing attention, completion/assessment summary — same data, redesigned presentation | Teacher | D10–D11 | Not started (internal content). Now reachable via the Rail's role-gated "Students" destination (D4) — own `allowedRoles` gate unchanged |
| Teacher → student detail | Currently inline on `/teacher` (click a student in the list, result table renders below, no dedicated URL) | Promoted to its own view (e.g. `/teacher/students/[id]`) reusing `/api/results/student/:id` (`LabResult[]`) **and** the richer `LearningProfile` fields that already exist (`accuracy`, `average_hints`, `average_attempts`, `strong_topics`, `weak_topics`, `recent_mistakes`, `recommended_difficulty`, `current_streak`) — real mistake/hint/streak data, not fabricated | Teacher | D11 | Not started — new route |
| `/profile` (`(app)/profile/page.tsx`) | Shared form (full name/email/created_at edit) + `ProgressDashboard` (`/api/progress/me`: level, XP, streak, achievements, difficulty breakdown) | **Student Profile** — real Learning Profile data, restyled. Teacher variant of this same route emphasizes account/preferences over learning stats (teachers don't have a `LearningProfile` in the current data model — this is not invented for them) | Student (rich) / Teacher (account-focused) | D5 (student) / D12 (teacher) | Not started (internal content). Now reachable from `AccountMenu`/`MobileDrawer` (D4) |
| `/chemistry_world/[id]` | Chemistry World simulation page (`ChemistryWorldScene.tsx`) | Wrapped in shared `SimulationShell` (§9 of the presentation-layer plan) | Student | D7 | Shell moved to `(immersive)` route group in D4 (§30) — no permanent rail anymore. Internal scene content untouched, full floating-chrome `SimulationShell` still D6+ |
| `/electricity_lab/[id]` | Electricity Lab simulation page | Wrapped in shared `SimulationShell` | Student | D8 | Shell moved to `(immersive)` in D4 (§30), same as above |
| `/geo3d/[id]` | GeoWorld simulation page | Wrapped in shared `SimulationShell` | Student | D9 | Shell moved to `(immersive)` in D4 (§30), same as above |
| `/simlab/[id]` | Physics SimLab simulation page | Wrapped in shared `SimulationShell` (lowest-risk module — migrate alongside remaining-pages cleanup) | Student | D13 | Shell moved to `(immersive)` in D4 (§30), same as above |
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
| **D5** | Student Home + Student Profile (§23). | D4 | Not started |
| **D6** | SimulationShell — generic floating TopBar/panel-docking shell (§9 of the original plan), proved on one module. | D1, D4 | Not started |
| **D7** | Chemistry World visual migration onto SimulationShell. | D6 | Not started |
| **D8** | Electricity Lab visual migration onto SimulationShell. | D6, informed by D7 | Not started |
| **D9** | GeoWorld visual migration onto SimulationShell. | D6 | Not started |
| **D10** | Teacher Home (§24). | D4 | Not started |
| **D11** | Teacher → Classes/Students/Student-Detail analytics, new student-detail route (§20, §24). | D10 | Not started |
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

---

**Current task scope**: D4 (authenticated AppShell/navigation, done, this pass) — see §30. D5 (Student Home + Student Profile) does not begin until this is reviewed and approved.
