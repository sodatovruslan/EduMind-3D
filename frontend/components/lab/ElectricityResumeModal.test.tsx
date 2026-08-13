// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ElectricityResumeModal from "./ElectricityResumeModal";
import type { ElectricitySaveSnapshotV1 } from "@/lib/electricity-save-schema";
import { LocaleProvider } from "@/lib/locale-context";
import { ru } from "@/lib/i18n/dictionaries/ru";

afterEach(cleanup);

// D6.2 — ElectricityResumeModal now reads copy from useLocale(), so every
// render needs a LocaleProvider ancestor (default locale "ru" keeps the
// expected strings below unchanged from before this stage).
function renderModal(ui: React.ReactElement) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

function sampleSnapshot(overrides: Partial<ElectricitySaveSnapshotV1> = {}): ElectricitySaveSnapshotV1 {
  return {
    schemaVersion: "1.0",
    saveId: "electricity-save-sim-1",
    simulationId: "sim-1",
    revision: 4,
    createdAt: new Date(1000).toISOString(),
    updatedAt: new Date(2000).toISOString(),
    circuit: { components: [], connections: [] },
    experiment: {
      experimentId: "elec-beginner-measure-current",
      currentStepIndex: 3,
      completedStepIds: ["introduction", "theory", "equipment"],
      taskStatus: "in_progress",
      startedAt: new Date(500).toISOString(),
      hintsUsed: 1,
      measurements: [],
      questionAnswers: {},
      observationsDraft: "",
      conclusionDraft: "",
      evidenceEvents: [],
      sessionObservations: {
        minVoltageV: 12,
        maxVoltageV: 12,
        minResistanceOhm: 4,
        maxResistanceOhm: 4,
        maxCurrentA: 0,
        maxBulbBrightness: 0,
        fuseBlownObserved: false,
        openCircuitObserved: false,
        shortCircuitObserved: false,
      },
    },
    ...overrides,
  };
}

describe("ElectricityResumeModal — Stage S9.7 UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("рендерит название работы, номер шага (currentStepIndex+1) и ревизию", () => {
    renderModal(
      <ElectricityResumeModal
        experimentTitle="Измерение тока"
        snapshot={sampleSnapshot()}
        onContinue={() => {}}
        onStartOver={() => {}}
        onCancel={() => {}}
      />
    );
    expect(screen.getByTestId("electricity-resume-modal")).toBeTruthy();
    expect(screen.getByText("Измерение тока")).toBeTruthy();
    expect(screen.getByText(/Шаг 4/)).toBeTruthy();
    expect(screen.getByText("#4")).toBeTruthy();
  });

  it("Продолжить вызывает onContinue", () => {
    const onContinue = vi.fn();
    renderModal(
      <ElectricityResumeModal
        experimentTitle="Измерение тока"
        snapshot={sampleSnapshot()}
        onContinue={onContinue}
        onStartOver={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("electricity-resume-continue"));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it("D10: Начать заново calls onStartOver only after a destructive confirmation is accepted", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onStartOver = vi.fn();
    renderModal(
      <ElectricityResumeModal
        experimentTitle="Измерение тока"
        snapshot={sampleSnapshot()}
        onContinue={vi.fn()}
        onStartOver={onStartOver}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("electricity-resume-restart"));
    expect(window.confirm).toHaveBeenCalledWith(ru.electricity.resume.restartConfirm);
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it("D10: declining the destructive confirmation does NOT discard the save", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onStartOver = vi.fn();
    renderModal(
      <ElectricityResumeModal
        experimentTitle="Измерение тока"
        snapshot={sampleSnapshot()}
        onContinue={vi.fn()}
        onStartOver={onStartOver}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("electricity-resume-restart"));
    expect(onStartOver).not.toHaveBeenCalled();
  });

  it("D10: has a real Cancel action (close X and Cancel button), unifying with Chemistry's resume modal — does not discard the save", () => {
    const onCancel = vi.fn();
    const onStartOver = vi.fn();
    renderModal(
      <ElectricityResumeModal
        experimentTitle="Измерение тока"
        snapshot={sampleSnapshot()}
        onContinue={vi.fn()}
        onStartOver={onStartOver}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByTestId("electricity-resume-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onStartOver).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("electricity-resume-close"));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
