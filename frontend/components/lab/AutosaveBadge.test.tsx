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

  it("1. Renders nothing when autosave status is 'idle'", () => {
    (autosaveEngine as any).status = "idle";
    const { container } = render(<AutosaveBadge />);
    expect(container.firstChild).toBeNull();
  });

  it("2. Renders 'Сохраняется…' when autosave status is 'pending'", () => {
    (autosaveEngine as any).status = "pending";
    render(<AutosaveBadge />);
    expect(screen.getByTestId("autosave-badge-saving")).toBeDefined();
    expect(screen.getByText("Сохраняется…")).toBeDefined();
  });

  it("3. Renders 'Сохраняется…' when autosave status is 'saving'", () => {
    (autosaveEngine as any).status = "saving";
    render(<AutosaveBadge />);
    expect(screen.getByTestId("autosave-badge-saving")).toBeDefined();
    expect(screen.getByText("Сохраняется…")).toBeDefined();
  });

  it("4. Renders 'Сохранено' when autosave status is 'saved'", () => {
    (autosaveEngine as any).status = "saved";
    render(<AutosaveBadge />);
    expect(screen.getByTestId("autosave-badge-saved")).toBeDefined();
    expect(screen.getByText("Сохранено")).toBeDefined();
  });

  it("5. Renders 'Сохранено локально' when autosave status is 'offline_pending'", () => {
    (autosaveEngine as any).status = "offline_pending";
    render(<AutosaveBadge />);
    expect(screen.getByTestId("autosave-badge-offline")).toBeDefined();
    expect(screen.getByText("Сохранено локально")).toBeDefined();
  });

  it("6. Renders 'Конфликт версий' when autosave status is 'conflict'", () => {
    (autosaveEngine as any).status = "conflict";
    render(<AutosaveBadge />);
    expect(screen.getByTestId("autosave-badge-conflict")).toBeDefined();
    expect(screen.getByText("Конфликт версий")).toBeDefined();
  });

  it("7. Renders 'Ошибка сохранения' when autosave status is 'error'", () => {
    (autosaveEngine as any).status = "error";
    render(<AutosaveBadge />);
    expect(screen.getByTestId("autosave-badge-error")).toBeDefined();
    expect(screen.getByText("Ошибка сохранения")).toBeDefined();
  });

  it("8. Dynamically transitions idle → pending → saved via subscription", () => {
    let listener: ((s: AutosaveStatus) => void) | null = null;
    vi.spyOn(autosaveEngine, "subscribe").mockImplementation((l) => {
      listener = l;
      l("idle");
      return () => {};
    });

    const { container } = render(<AutosaveBadge />);
    // idle = nothing rendered
    expect(container.firstChild).toBeNull();

    act(() => { if (listener) listener("pending"); });
    expect(screen.getByText("Сохраняется…")).toBeDefined();

    act(() => { if (listener) listener("saving"); });
    expect(screen.getByText("Сохраняется…")).toBeDefined();

    act(() => { if (listener) listener("saved"); });
    expect(screen.getByText("Сохранено")).toBeDefined();
  });

  it("9. Dynamically updates from saved to offline_pending", () => {
    let listener: ((s: AutosaveStatus) => void) | null = null;
    vi.spyOn(autosaveEngine, "subscribe").mockImplementation((l) => {
      listener = l;
      l("saved");
      return () => {};
    });

    render(<AutosaveBadge />);
    expect(screen.getByText("Сохранено")).toBeDefined();

    act(() => { if (listener) listener("offline_pending"); });
    expect(screen.getByText("Сохранено локально")).toBeDefined();
  });
});
