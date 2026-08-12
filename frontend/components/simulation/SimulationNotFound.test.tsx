// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import SimulationNotFound from "./SimulationNotFound";
import { LocaleProvider } from "@/lib/locale-context";
import { ru } from "@/lib/i18n/dictionaries/ru";

afterEach(cleanup);

/**
 * D9 — the 4 immersive routes (chemistry_world/electricity_lab/geo3d/simlab)
 * used to each render a bare `<p className="text-sm text-slate-400">`
 * (legacy, invisible in Light Mode, hardcoded Russian, no way back) for a
 * missing/bad simulation id. Now they share this one component.
 */
describe("SimulationNotFound — D9", () => {
  it("shows the real localized not-found message and a working link back to the dashboard", () => {
    render(
      <LocaleProvider>
        <SimulationNotFound />
      </LocaleProvider>
    );

    expect(screen.getByText(ru.simulation.notFound)).toBeDefined();
    const backLink = screen.getByRole("link", { name: ru.simulation.backToDashboard });
    expect(backLink.getAttribute("href")).toBe("/dashboard");
  });
});
