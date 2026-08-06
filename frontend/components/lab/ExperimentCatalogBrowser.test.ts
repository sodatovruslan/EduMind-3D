import { describe, expect, it } from "vitest";
import { computeActiveSaveMap } from "./ExperimentCatalogBrowser";

describe("computeActiveSaveMap", () => {
  it("does not offer Resume when the most recent save for an experiment is completed, even if older abandoned saves are still active", () => {
    // Reproduces the reported bug: a user abandons a few attempts (rows stay
    // "active" forever — nothing marks them otherwise), then later starts
    // fresh and finishes the experiment for real. /api/chemistry/saves
    // returns ALL of these rows, newest first.
    const saves = [
      { experiment_id: "lab-beginner-heating-water", status: "completed", snapshot: { rev: 20 }, updated_at: "2026-08-06T08:39:15Z" },
      { experiment_id: "lab-beginner-heating-water", status: "completed", snapshot: { rev: 3 }, updated_at: "2026-08-06T08:35:03Z" },
      { experiment_id: "lab-beginner-heating-water", status: "active", snapshot: { rev: 2 }, updated_at: "2026-08-05T22:45:53Z" },
      { experiment_id: "lab-beginner-heating-water", status: "active", snapshot: { rev: 4 }, updated_at: "2026-08-05T22:45:29Z" },
      { experiment_id: "lab-beginner-heating-water", status: "active", snapshot: { rev: 4 }, updated_at: "2026-08-05T22:44:51Z" },
      { experiment_id: "lab-beginner-heating-water", status: "active", snapshot: { rev: 18 }, updated_at: "2026-08-05T22:44:00Z" },
    ];

    expect(computeActiveSaveMap(saves)).toEqual({});
  });

  it("offers Resume when the most recent save for an experiment is still active", () => {
    const saves = [
      { experiment_id: "lab-beginner-heating-water", status: "active", snapshot: { rev: 5 }, updated_at: "2026-08-06T09:00:00Z" },
      { experiment_id: "lab-beginner-heating-water", status: "completed", snapshot: { rev: 3 }, updated_at: "2026-08-05T22:45:53Z" },
    ];

    expect(computeActiveSaveMap(saves)).toEqual({
      "lab-beginner-heating-water": { rev: 5 },
    });
  });

  it("keeps each experiment independent", () => {
    const saves = [
      { experiment_id: "lab-beginner-heating-water", status: "completed", snapshot: { rev: 1 }, updated_at: "2026-08-06T09:00:00Z" },
      { experiment_id: "lab-beginner-state-changes", status: "active", snapshot: { rev: 1 }, updated_at: "2026-08-06T08:00:00Z" },
    ];

    expect(computeActiveSaveMap(saves)).toEqual({
      "lab-beginner-state-changes": { rev: 1 },
    });
  });

  it("handles empty/missing input safely", () => {
    expect(computeActiveSaveMap([])).toEqual({});
    expect(computeActiveSaveMap(undefined)).toEqual({});
    expect(computeActiveSaveMap(null)).toEqual({});
  });
});
