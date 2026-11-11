import { describe, expect, it } from "vitest";
import { getNavItems, isNavItemActive } from "./appshell-nav";

describe("getNavItems (D4 — role-aware AppShell navigation)", () => {
  it("gives a student with a teacher Home + Messages — no teacher-only destination", () => {
    const items = getNavItems("student", true);
    expect(items.map((i) => i.key)).toEqual(["home", "messages"]);
  });

  it("hides Messages from a student who has no teacher yet", () => {
    const items = getNavItems("student", false);
    expect(items.map((i) => i.key)).toEqual(["home"]);
  });

  it("gives a teacher Home + Messages + the teacher area", () => {
    const items = getNavItems("teacher");
    expect(items.map((i) => i.key)).toEqual(["home", "messages", "teacherArea", "classes"]);
  });

  it("gives an admin the teacher area too (matches the existing ProtectedRoute allowedRoles gate on /teacher), but NOT Messages — T5's own backend rule is admin is not auto-granted messaging", () => {
    const items = getNavItems("admin");
    expect(items.map((i) => i.key)).toEqual(["home", "teacherArea", "classes"]);
  });

  it("defaults to student-only nav when role is undefined (e.g. during auth resolution)", () => {
    const items = getNavItems(undefined);
    expect(items.map((i) => i.key)).toEqual(["home"]);
  });

  it("routes to the real, existing pages only", () => {
    const items = getNavItems("teacher");
    expect(items.find((i) => i.key === "home")?.href).toBe("/dashboard");
    expect(items.find((i) => i.key === "messages")?.href).toBe("/messages");
    expect(items.find((i) => i.key === "teacherArea")?.href).toBe("/teacher");
    expect(items.find((i) => i.key === "classes")?.href).toBe("/teacher/classes");
  });

  it("does not mark the teacher root active on nested classes routes", () => {
    expect(isNavItemActive("/teacher/classes/c1", "/teacher")).toBe(false);
    expect(isNavItemActive("/teacher/classes/c1", "/teacher/classes")).toBe(true);
  });
});
