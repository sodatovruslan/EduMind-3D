// @vitest-environment jsdom
import { render, screen, act, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AutosaveBadge from "./AutosaveBadge";
import { autosaveEngine, type AutosaveStatus } from "@/lib/autosave-engine";

describe("Stage S-8.4 — Autosave Status Indicator Badge UI Tests", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("1. Renders 'Сохранено' when autosave status is 'saved'", () => {
    (autosaveEngine as any).status = "saved";
    render(<AutosaveBadge />);

    expect(screen.getByTestId("autosave-badge-saved")).toBeDefined();
    expect(screen.getByText("Сохранено")).toBeDefined();
  });

  it("2. Renders 'Сохраняется…' when autosave status is 'saving'", () => {
    (autosaveEngine as any).status = "saving";
    render(<AutosaveBadge />);

    expect(screen.getByTestId("autosave-badge-saving")).toBeDefined();
    expect(screen.getByText("Сохраняется…")).toBeDefined();
  });

  it("3. Renders 'Сохранено локально' when autosave status is 'offline_pending'", () => {
    (autosaveEngine as any).status = "offline_pending";
    render(<AutosaveBadge />);

    expect(screen.getByTestId("autosave-badge-offline")).toBeDefined();
    expect(screen.getByText("Сохранено локально")).toBeDefined();
  });

  it("4. Dynamically updates text when status changes via subscription", () => {
    let listener: ((s: AutosaveStatus) => void) | null = null;
    vi.spyOn(autosaveEngine, "subscribe").mockImplementation((l) => {
      listener = l;
      l("saved");
      return () => {};
    });

    render(<AutosaveBadge />);
    expect(screen.getByText("Сохранено")).toBeDefined();

    act(() => {
      if (listener) listener("saving");
    });

    expect(screen.getByText("Сохраняется…")).toBeDefined();
  });
});
