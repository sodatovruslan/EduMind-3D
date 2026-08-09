// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AITeacherDock from "./AITeacherDock";
import { LocaleProvider } from "@/lib/locale-context";
import { ThemeProvider } from "@/lib/theme-context";

function renderDock() {
  return render(
    <ThemeProvider>
      <LocaleProvider>
        <AITeacherDock>
          <div data-testid="chat-contents">real chat component, unmodified</div>
        </AITeacherDock>
      </LocaleProvider>
    </ThemeProvider>
  );
}

describe("AITeacherDock — D6 collapsible floating AI Teacher wrapper", () => {
  afterEach(() => {
    cleanup();
  });

  it("is collapsed by default — trigger visible, chat contents not mounted", async () => {
    renderDock();
    await act(async () => {});

    expect(screen.getByRole("button", { name: "Открыть ИИ-наставника" })).toBeDefined();
    expect(screen.queryByTestId("chat-contents")).toBeNull();
  });

  it("expands to show the exact wrapped children (no duplicated/rebuilt chat UI) on trigger click", async () => {
    renderDock();
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "Открыть ИИ-наставника" }));
    await act(async () => {});

    expect(screen.getByTestId("chat-contents").textContent).toBe("real chat component, unmodified");
    expect(screen.getByRole("button", { name: "Свернуть ИИ-наставника" })).toBeDefined();
  });

  it("collapses again via the close control", async () => {
    renderDock();
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: "Открыть ИИ-наставника" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "Свернуть ИИ-наставника" }));
    await act(async () => {});

    expect(screen.queryByTestId("chat-contents")).toBeNull();
    expect(screen.getByRole("button", { name: "Открыть ИИ-наставника" })).toBeDefined();
  });
});
