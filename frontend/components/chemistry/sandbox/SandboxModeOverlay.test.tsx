// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SandboxModeOverlay } from "./SandboxModeOverlay";
import { LocaleProvider } from "@/lib/locale-context";
import { ru } from "@/lib/i18n/dictionaries/ru";
import { en } from "@/lib/i18n/dictionaries/en";

/**
 * D6.1 — SandboxModeOverlay moved onto useLocale()/t.sandboxHud.* and D1
 * tokens (was 100% hardcoded Russian). It's shared by BOTH Chemistry and
 * Electricity, so these tests cover the locale-propagation guarantee for
 * the one component with the widest blast radius across both worlds.
 */
function renderOverlay(props: Partial<React.ComponentProps<typeof SandboxModeOverlay>> = {}) {
  return render(
    <LocaleProvider>
      <SandboxModeOverlay cameraMode="orbit" onToggleMode={vi.fn()} {...props} />
    </LocaleProvider>
  );
}

describe("SandboxModeOverlay — D6.1 locale propagation", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the mode badge and toggle button in Russian by default", async () => {
    renderOverlay();
    await act(async () => {});

    expect(screen.getByText(ru.sandboxHud.modeOrbit)).toBeDefined();
    expect(screen.getByText(ru.sandboxHud.toggleToSandbox)).toBeDefined();
  });

  it("switches every visible chrome string to English immediately, no reload", async () => {
    renderOverlay();
    await act(async () => {});
    expect(screen.getByText(ru.sandboxHud.modeOrbit)).toBeDefined();

    // simulate a locale switch the same way LocaleSwitcher does — write the
    // stored key and remount, since this component alone has no switcher UI
    window.localStorage.setItem("edumind:locale", "en");
    cleanup();
    renderOverlay();
    await act(async () => {});

    expect(screen.getByText(en.sandboxHud.modeOrbit)).toBeDefined();
    expect(screen.getByText(en.sandboxHud.toggleToSandbox)).toBeDefined();
    expect(screen.queryByText(ru.sandboxHud.modeOrbit)).toBeNull();

    window.localStorage.removeItem("edumind:locale");
  });

  it("shows the sandbox mode label and fullscreen enter control when not in fullscreen", async () => {
    renderOverlay({ onToggleFullscreen: vi.fn(), isFullscreen: false, cameraMode: "sandbox" });
    await act(async () => {});

    expect(screen.getByText(ru.sandboxHud.modeSandbox)).toBeDefined();
    expect(screen.getByRole("button", { name: ru.sandboxHud.fullscreenEnterAria })).toBeDefined();
  });

  it("shows the fullscreen exit control when in fullscreen", async () => {
    renderOverlay({ onToggleFullscreen: vi.fn(), isFullscreen: true });
    await act(async () => {});

    expect(screen.getByRole("button", { name: ru.sandboxHud.fullscreenExitAria })).toBeDefined();
  });

  it("uses the caller-supplied disabledReason (per-world override) as the toggle button's title when disabled", async () => {
    renderOverlay({ disabled: true, disabledReason: "custom per-world reason" });
    await act(async () => {});

    const toggle = screen.getByText(ru.sandboxHud.toggleToSandbox).closest("button");
    expect(toggle?.getAttribute("title")).toBe("custom per-world reason");
  });

  it("calls onToggleMode when the mode button is clicked", async () => {
    const onToggleMode = vi.fn();
    renderOverlay({ onToggleMode });
    await act(async () => {});

    fireEvent.click(screen.getByText(ru.sandboxHud.toggleToSandbox).closest("button")!);
    expect(onToggleMode).toHaveBeenCalledTimes(1);
  });
});
