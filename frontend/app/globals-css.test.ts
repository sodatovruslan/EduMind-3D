import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Fullscreen layout overflow acceptance fix (shared root cause) — regression
 * guard for a plain CSS rule that can't be exercised through jsdom (jsdom
 * doesn't lay out real scrollbars). <html> must always reserve the vertical
 * scrollbar's gutter so its presence/absence never changes the available
 * content width — this is what stopped the horizontal scrollbar that
 * appeared after exiting fullscreen (reproduced even on SimLabScene.tsx,
 * which has no fullscreen code of its own, proving the bug lived in the
 * shared page shell, not in any one lab's fullscreen wrapper).
 */
const cssPath = fileURLToPath(new URL("./globals.css", import.meta.url));
const css = readFileSync(cssPath, "utf-8");
// код без /* ... */-комментариев — иначе прозаическое упоминание
// "overflow-x: hidden" в самом объясняющем комментарии (о том, что мы
// СПЕЦИАЛЬНО не используем этот хак) ложно триггерило бы проверку ниже
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("globals.css — html reserves scrollbar gutter (fullscreen overflow acceptance fix)", () => {
  it("declares scrollbar-gutter: stable on html", () => {
    const htmlBlock = css.match(/html\s*\{[^}]*\}/);
    expect(htmlBlock).not.toBeNull();
    expect(htmlBlock![0]).toMatch(/scrollbar-gutter:\s*stable/);
  });

  it("keeps overflow-y: scroll on html as a fallback for browsers without scrollbar-gutter support", () => {
    const htmlBlock = css.match(/html\s*\{[^}]*\}/);
    expect(htmlBlock![0]).toMatch(/overflow-y:\s*scroll/);
  });

  it("does NOT use overflow-x: hidden as a band-aid over the real width bug", () => {
    expect(cssWithoutComments).not.toMatch(/overflow-x:\s*hidden/);
  });
});
