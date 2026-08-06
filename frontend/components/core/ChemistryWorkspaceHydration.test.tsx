// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { ChemistryWorkspaceProvider, useChemistryWorkspace } from "./ChemistryWorkspaceProvider";
import { serializeChemistrySave, hydrateChemistrySave } from "@/lib/chemistry-save-serializer";
import type { ChemistrySaveSnapshotV1 } from "@/lib/chemistry-save-schema";

describe("ChemistryWorkspaceProvider — Hydration & Burner State", () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ChemistryWorkspaceProvider>{children}</ChemistryWorkspaceProvider>
  );

  it("1. burner.isOn toggles to true and is correctly updated in state.tools", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper });

    let burner = result.current.state.tools.find((t) => t.id === "burner-1");
    expect(burner?.kind === "burner" && burner.isOn).toBe(false);

    act(() => {
      result.current.toggleBurner("burner-1");
    });

    burner = result.current.state.tools.find((t) => t.id === "burner-1");
    expect(burner?.kind === "burner" && burner.isOn).toBe(true);
  });

  it("2. hydrateFromSave restores burner.isOn === true to workspace.state.tools", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper });

    const sampleSnapshot: ChemistrySaveSnapshotV1 = {
      schemaVersion: "1.0",
      saveId: "save-burner-test",
      userId: "user-1",
      simulationId: "sim-chem",
      experimentId: "lab-water-heating",
      revision: 1,
      createdAt: "2026-08-04T12:00:00Z",
      updatedAt: "2026-08-04T12:00:00Z",
      workspace: {
        containers: [
          {
            id: "beaker-1",
            kind: "beaker",
            position: [2.6, 1.4],
            rotationY: 0,
            elevation: 0.65,
            storageSlotId: null,
            heatingSourceId: "burner-1",
            isSealed: false,
            pressureKPa: 101.3,
            contents: [{ substanceId: "water", grams: 100 }],
            temperatureC: 45.0,
            aggregateState: "liquid",
            precipitate: [],
            hazardLevel: "none",
            capState: "open",
          },
        ],
        stockBottles: [],
        burners: [
          {
            id: "burner-1",
            isOn: true,
            position: [2.6, 1.4],
            rotationY: 0,
            elevation: 0,
            storageSlotId: null,
          },
        ],
        cabinets: [],
        itemTransforms: [],
      },
      experiment: {
        mode: "guided",
        currentStepIndex: 1,
        completedStepIds: [],
        taskStatus: "in_progress",
        startedAt: new Date().toISOString(),
        elapsedMs: 5000,
        hintsUsed: 0,
        conclusionDraft: "",
      },
      progress: {
        xp: 0,
        achievements: [],
        completedExperimentIds: [],
      },
      observation: {
        sessionId: "sess-1",
        lastSequence: 5,
        events: [],
      },
    };

    act(() => {
      result.current.hydrateFromSave(sampleSnapshot);
    });

    const burner = result.current.state.tools.find((t) => t.id === "burner-1");
    expect(burner?.kind === "burner" && burner.isOn).toBe(true);

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1");
    expect(beaker?.data.temperatureC).toBe(45.0);
    expect(beaker?.heatingSourceId).toBe("burner-1");
  });
});
