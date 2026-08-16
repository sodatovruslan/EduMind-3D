// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ResumeExperimentModal from "./ResumeExperimentModal";
import type { ChemistrySaveSnapshotV1 } from "@/lib/chemistry-save-schema";
import { LocaleProvider } from "@/lib/locale-context";
import { ru } from "@/lib/i18n/dictionaries/ru";

// D6.2 — ResumeExperimentModal now reads copy from useLocale(), so every
// render needs a LocaleProvider ancestor (default locale "ru" keeps the
// expected strings below unchanged from before this stage).
function renderModal(ui: React.ReactElement) {
  return render(<LocaleProvider>{ui}</LocaleProvider>);
}

describe("Stage S-8.4 — Resume Experiment Modal UI Tests", () => {
  afterEach(() => {
    cleanup();
  });
  const sampleSnapshot: ChemistrySaveSnapshotV1 = {
    schemaVersion: "1.0",
    saveId: "save-1",
    userId: "user-1",
    simulationId: "sim-1",
    experimentId: "exp-1",
    createdAt: "2026-08-04T12:00:00Z",
    updatedAt: "2026-08-04T12:05:00Z",
    revision: 2,
    workspace: { containers: [], stockBottles: [], burners: [], cabinets: [], itemTransforms: [] },
    experiment: {
      mode: "learning",
      currentStepIndex: 3,
      completedStepIds: ["step-1"],
      taskStatus: "in_progress",
      startedAt: "2026-08-04T12:00:00Z",
      elapsedMs: 60000,
      hintsUsed: 0,
      conclusionDraft: "",
    },
    progress: { xp: 20, achievements: [], completedExperimentIds: [] },
    observation: { sessionId: "sess-1", lastSequence: 10, events: [] },
    teacherReport: { latestReportId: null, pendingSyncKeys: [] },
  };

  it("1. Modal does NOT render when isOpen is false or snapshot is null", () => {
    const { container } = renderModal(
      <ResumeExperimentModal
        isOpen={false}
        experimentTitle="Нагрев воды"
        saveSnapshot={sampleSnapshot}
        onResume={vi.fn()}
        onRestart={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("2. Modal renders title, step number (4), formatted date and action buttons when open", () => {
    renderModal(
      <ResumeExperimentModal
        isOpen={true}
        experimentTitle="Нагрев воды"
        saveSnapshot={sampleSnapshot}
        onResume={vi.fn()}
        onRestart={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByTestId("resume-save-modal")).toBeDefined();
    expect(screen.getByText("Найдено сохранение эксперимента")).toBeDefined();
    expect(screen.getByText("Шаг 4")).toBeDefined();
    expect(screen.getByTestId("resume-modal-continue")).toBeDefined();
    expect(screen.getByTestId("resume-modal-restart")).toBeDefined();
    expect(screen.getByTestId("resume-modal-cancel")).toBeDefined();
  });

  it("D9: the icon-only close (X) button has an accessible name, not just an icon", () => {
    renderModal(
      <ResumeExperimentModal
        isOpen={true}
        experimentTitle="Нагрев воды"
        saveSnapshot={sampleSnapshot}
        onResume={vi.fn()}
        onRestart={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const closeButton = screen.getByTestId("resume-modal-close");
    expect(closeButton.getAttribute("aria-label")).toBeTruthy();
  });

  it("3. Clicking Continue triggers onResume callback", () => {
    const onResume = vi.fn();
    renderModal(
      <ResumeExperimentModal
        isOpen={true}
        experimentTitle="Нагрев воды"
        saveSnapshot={sampleSnapshot}
        onResume={onResume}
        onRestart={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("resume-modal-continue"));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it("4. Clicking Restart triggers onRestart callback only after a destructive confirmation is accepted", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onRestart = vi.fn();
    renderModal(
      <ResumeExperimentModal
        isOpen={true}
        experimentTitle="Нагрев воды"
        saveSnapshot={sampleSnapshot}
        onResume={vi.fn()}
        onRestart={onRestart}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("resume-modal-restart"));
    expect(window.confirm).toHaveBeenCalledWith(ru.chemistry.resume.restartConfirm);
    expect(onRestart).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });

  it("D10: declining the destructive confirmation does NOT discard the save", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onRestart = vi.fn();
    renderModal(
      <ResumeExperimentModal
        isOpen={true}
        experimentTitle="Нагрев воды"
        saveSnapshot={sampleSnapshot}
        onResume={vi.fn()}
        onRestart={onRestart}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("resume-modal-restart"));
    expect(onRestart).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("5. Clicking Cancel triggers onCancel callback", () => {
    const onCancel = vi.fn();
    renderModal(
      <ResumeExperimentModal
        isOpen={true}
        experimentTitle="Нагрев воды"
        saveSnapshot={sampleSnapshot}
        onResume={vi.fn()}
        onRestart={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByTestId("resume-modal-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
