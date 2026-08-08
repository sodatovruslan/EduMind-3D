// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { isTypingTarget } from "./dom-input-utils";

/**
 * Immersive interaction acceptance fix — общий примитив, вынесенный из
 * трёх ранее продублированных копий (SandboxLocomotionController,
 * SandboxModeOverlay, ChemistryInteractionProvider). Проверяется отдельно
 * от WASD/E-логики, которая на него опирается ("locomotion must pause
 * while typing in AI/chat/text inputs").
 */
describe("isTypingTarget — определяет, печатает ли пользователь сейчас в поле ввода", () => {
  it("возвращает true для INPUT/TEXTAREA/SELECT", () => {
    expect(isTypingTarget(document.createElement("input"))).toBe(true);
    expect(isTypingTarget(document.createElement("textarea"))).toBe(true);
    expect(isTypingTarget(document.createElement("select"))).toBe(true);
  });

  it("возвращает true для contentEditable-элементов (например, AI-чат)", () => {
    const div = document.createElement("div");
    Object.defineProperty(div, "isContentEditable", { value: true });
    expect(isTypingTarget(div)).toBe(true);
  });

  it("возвращает false для обычных элементов (WASD не блокируется вне полей ввода)", () => {
    expect(isTypingTarget(document.createElement("div"))).toBe(false);
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
  });

  it("возвращает false для null/не-HTMLElement целей", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(window)).toBe(false);
  });
});
