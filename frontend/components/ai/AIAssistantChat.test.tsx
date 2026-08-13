// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AIAssistantChat from "./AIAssistantChat";
import { LocaleProvider } from "@/lib/locale-context";
import { ru } from "@/lib/i18n/dictionaries/ru";

// jsdom doesn't implement Element.scrollTo (only window.scrollTo) — the
// component's auto-scroll-to-latest-message effect calls it unconditionally,
// same as its AITeacherChat/ChemistryTeacherChat siblings (real browser
// behavior, untouched by this migration). Stub it so the effect is a no-op
// here instead of throwing.
Element.prototype.scrollTo = vi.fn();

const apiFetchMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

afterEach(() => {
  cleanup();
  apiFetchMock.mockReset();
});

function renderChat() {
  return render(
    <LocaleProvider>
      <AIAssistantChat simulationId="sim-1" sceneStateDescription="Globe rotated to Central Asia." />
    </LocaleProvider>
  );
}

/**
 * D10 — AIAssistantChat migrated onto Design V2 + the shared AITeacherDock
 * floating-chrome pattern. No prior test coverage existed for this
 * component (it predates the rest of the AI-chat test suite).
 */
describe("AIAssistantChat — D10 Design V2 migration", () => {
  it("is collapsed by default with its own (not 'AI Teacher') label", async () => {
    renderChat();
    await act(async () => {});

    expect(screen.getByRole("button", { name: ru.aiAssistant.expand })).toBeDefined();
    expect(screen.queryByTestId("ai-assistant-chat")).toBeNull();
  });

  it("expands to show a real greeting and lets the student ask a real question", async () => {
    apiFetchMock.mockResolvedValueOnce({ hint: "Try zooming into the Pamir range." });
    renderChat();
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: ru.aiAssistant.expand }));
    await act(async () => {});
    expect(screen.getByText(ru.aiAssistant.greeting)).toBeDefined();

    const input = screen.getByTestId("ai-assistant-input");
    fireEvent.change(input, { target: { value: "Where are the mountains?" } });
    fireEvent.click(screen.getByTestId("ai-assistant-send"));
    await act(async () => {});

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/ai/hint",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          simulation_id: "sim-1",
          scene_state: `Globe rotated to Central Asia. ${ru.aiAssistant.studentQuestionPrefix} Where are the mountains?`,
        }),
      })
    );
    expect(await screen.findByText("Try zooming into the Pamir range.")).toBeDefined();
  });

  it("the send button has a real accessible name, not just an icon", async () => {
    renderChat();
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: ru.aiAssistant.expand }));
    await act(async () => {});

    expect(screen.getByTestId("ai-assistant-send").getAttribute("aria-label")).toBe(ru.aiAssistant.sendAria);
  });
});
