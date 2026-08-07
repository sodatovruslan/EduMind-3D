// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { useEffect } from "react";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { ExperimentStateProvider, useExperimentState } from "@/components/core/ExperimentStateProvider";
import { ElectricityLabExperienceProvider, useElectricityLabExperience } from "@/components/core/ElectricityLabExperienceProvider";
import { solveCircuit, type CircuitComponent } from "@/lib/circuit-engine";
import ElectricityGuidedLabPanel from "./ElectricityGuidedLabPanel";

/**
 * Stage S9.5 — Guided Experiments UI. Renders the REAL panel through the
 * same provider chain as the other S9.5 tests (real ExperimentStateProvider
 * -> real solveCircuit() -> real ElectricityLabExperienceProvider), driven
 * by real clicks on the "Далее" button, checking that the locked-hint area
 * surfaces the specific, reused measurement message once a real wiring
 * mistake exists, and only the generic fallback text otherwise.
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

// шунтирующая проводка: главный контур без амперметра в разрыве + амперметр
// параллельно резистору — та же реальная ошибка, что и в
// electricity-lab-catalog.test.ts/ElectricityGuidedExperiment.integration.test.tsx
function TestWireMistakeButton() {
  const { addConnection } = useExperimentState();
  return (
    <button
      type="button"
      data-testid="test-wire-mistake"
      onClick={() => {
        addConnection({ id: "c1", terminals: ["battery_pos", "switch_a"] });
        addConnection({ id: "c2", terminals: ["switch_b", "resistor_a"] });
        addConnection({ id: "c3", terminals: ["resistor_b", "bulb_a"] });
        addConnection({ id: "c4", terminals: ["bulb_b", "fuse_a"] });
        addConnection({ id: "c5", terminals: ["fuse_b", "battery_neg"] });
        addConnection({ id: "c6", terminals: ["ammeter_a", "resistor_a"] });
        addConnection({ id: "c7", terminals: ["ammeter_b", "resistor_b"] });
      }}
    >
      wire mistake
    </button>
  );
}

function AutoSelect({ experimentId }: { experimentId: string }) {
  const { selectExperiment, selectedExperiment } = useElectricityLabExperience();
  useEffect(() => {
    if (!selectedExperiment) selectExperiment(experimentId);
  }, [experimentId, selectExperiment, selectedExperiment]);
  return null;
}

function Bridge({ experimentId }: { experimentId: string }) {
  const { state } = useExperimentState();
  const solution = solveCircuit(state.components, state.connections);
  return (
    <ElectricityLabExperienceProvider simulationId="sim-electricity" stepContext={{ components: state.components, connections: state.connections, solution }}>
      <AutoSelect experimentId={experimentId} />
      <TestWireMistakeButton />
      <ElectricityGuidedLabPanel />
    </ElectricityLabExperienceProvider>
  );
}

function renderPanel(experimentId: string) {
  return render(
    <ExperimentStateProvider initialComponents={INITIAL_COMPONENTS}>
      <Bridge experimentId={experimentId} />
    </ExperimentStateProvider>
  );
}

function advance() {
  fireEvent.click(screen.getByTestId("electricity-guided-lab-advance"));
}

describe("ElectricityGuidedLabPanel — Stage S9.5 educational feedback", () => {
  it("на шаге сборки без проводки показывает только общую подсказку (нет конкретной ошибки — просто ничего не подключено)", async () => {
    await act(async () => {
      renderPanel("elec-beginner-measure-current");
    });

    advance(); // introduction -> theory
    advance(); // theory -> equipment
    advance(); // equipment -> assembly
    expect(screen.getByTestId("electricity-guided-lab-progress-label").textContent).toMatch(/Сборка/);

    const hint = screen.getByTestId("electricity-guided-lab-locked-hint");
    expect(hint.textContent).toBe("Кнопка станет активной, как только выполнится условие шага выше.");
  });

  it("после реальной ошибки подключения (амперметр параллельно) показывает конкретное объяснение", async () => {
    await act(async () => {
      renderPanel("elec-beginner-measure-current");
    });

    advance();
    advance();
    advance(); // -> assembly

    act(() => {
      fireEvent.click(screen.getByTestId("test-wire-mistake"));
    });

    const hint = screen.getByTestId("electricity-guided-lab-locked-hint");
    expect(hint.textContent).toMatch(/шунтирует/);
    expect(hint.className).toMatch(/amber/);
  });
});
