import { describe, expect, it } from "vitest";
import { getNavItems, isNavItemActive } from "./appshell-nav";

describe("getNavItems (role-aware AppShell navigation)", () => {
  it("gives a student with a teacher only Messages — no teacher-only destination", () => {
    const items = getNavItems("student", true);
    expect(items.map((i) => i.key)).toEqual(["messages"]);
  });

  it("gives a student without a teacher no destinations at all (Messages page would be empty)", () => {
    const items = getNavItems("student", false);
    expect(items).toEqual([]);
  });

  it("gives a teacher Messages + the teacher area", () => {
    const items = getNavItems("teacher");
    expect(items.map((i) => i.key)).toEqual(["messages", "teacherArea", "classes"]);
  });

  it("gives an admin the teacher area too (matches the existing ProtectedRoute allowedRoles gate on /teacher), but NOT Messages — T5's own backend rule is admin is not auto-granted messaging", () => {
    const items = getNavItems("admin");
    expect(items.map((i) => i.key)).toEqual(["teacherArea", "classes"]);
  });

  it("gives nothing when role is undefined (e.g. during auth resolution) — no teacher destinations leak", () => {
    expect(getNavItems(undefined)).toEqual([]);
  });

  it("does not offer /dashboard as a nav destination — it lives in the account menu, see appshell-nav docs", () => {
    const hrefs = getNavItems("teacher").map((i) => i.href);
    expect(hrefs).not.toContain("/dashboard");
  });

  it("routes to the real, existing pages only", () => {
    const items = getNavItems("teacher");
    expect(items.find((i) => i.key === "messages")?.href).toBe("/messages");
    expect(items.find((i) => i.key === "teacherArea")?.href).toBe("/teacher");
    expect(items.find((i) => i.key === "classes")?.href).toBe("/teacher/classes");
  });

  it("does not mark the teacher root active on nested classes routes", () => {
    expect(isNavItemActive("/teacher/classes/c1", "/teacher")).toBe(false);
    expect(isNavItemActive("/teacher/classes/c1", "/teacher/classes")).toBe(true);
  });
});
