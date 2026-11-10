// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SimulationShell from "./SimulationShell";
import { LocaleProvider } from "@/lib/locale-context";
import { ThemeProvider } from "@/lib/theme-context";
import type { Simulation } from "@/lib/types";

function makeSimulation(overrides: Partial<Simulation> = {}): Simulation {
  return {
    id: "sim-1",
    title: "Нейтрализация",
    module: "chemistry_world",
    visibility: "public",
    subject: "Химия",
    config: {},
    difficulty: 2,
    created_at: "2026-01-01",
    ...overrides,
  };
}

function renderShell(simulation: Simulation) {
  return render(
    <ThemeProvider>
      <LocaleProvider>
        <SimulationShell simulation={simulation}>
          <p>3d scene placeholder</p>
        </SimulationShell>
      </LocaleProvider>
    </ThemeProvider>
  );
}

describe("SimulationShell — D6 immersive route chrome", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the real simulation title and the scene children", async () => {
    renderShell(makeSimulation());
    await act(async () => {});

    expect(screen.getByText("Нейтрализация")).toBeDefined();
    expect(screen.getByText("3d scene placeholder")).toBeDefined();
  });

  it("has a back link to /dashboard, not a full Rail/StandardAppShell", async () => {
    renderShell(makeSimulation());
    await act(async () => {});

    const back = screen.getByRole("link", { name: "Назад" });
    expect(back.getAttribute("href")).toBe("/dashboard");
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("has no Locale/Theme controls (they overlapped the scene's own top-right buttons)", async () => {
    renderShell(makeSimulation());
    await act(async () => {});

    expect(screen.queryByRole("radiogroup", { name: "Язык" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Тема оформления" })).toBeNull();
  });

  it("resolves world accent/icon for each real module without crashing", async () => {
    for (const simModule of ["chemistry_world", "electricity_lab", "geo3d"] as const) {
      const { unmount } = renderShell(makeSimulation({ module: simModule, title: `Title-${simModule}` }));
      await act(async () => {});
      expect(screen.getByText(`Title-${simModule}`)).toBeDefined();
      unmount();
    }
  });

  it("still renders (with a neutral identity, no crash) for the non-promoted simlab module", async () => {
    renderShell(makeSimulation({ module: "simlab", title: "Legacy SimLab" }));
    await act(async () => {});

    expect(screen.getByText("Legacy SimLab")).toBeDefined();
  });

  it("uses the persisted locale for its own chrome", async () => {
    window.localStorage.setItem("edumind:locale", "en");
    renderShell(makeSimulation());
    await act(async () => {});

    expect(screen.getByRole("link", { name: "Back" })).toBeDefined();
    expect(screen.queryByRole("link", { name: "Назад" })).toBeNull();
    // real simulation title (data, not chrome) never gets "translated"
    expect(screen.getByText("Нейтрализация")).toBeDefined();
    window.localStorage.removeItem("edumind:locale");
  });
});
