// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import ClassesList from "./ClassesList";
import ClassDetail from "./ClassDetail";
import { LocaleProvider } from "@/lib/locale-context";
import { en } from "@/lib/i18n/dictionaries/en";
import { ru } from "@/lib/i18n/dictionaries/ru";
import { tg } from "@/lib/i18n/dictionaries/tg";
import * as client from "@/lib/classes-client";

vi.mock("@/lib/classes-client", () => ({
  listClasses: vi.fn(),
  getClassroom: vi.fn(),
  createClassroom: vi.fn(),
  updateClassroom: vi.fn(),
  listClassStudents: vi.fn(),
  searchAvailableStudents: vi.fn(),
  addClassStudent: vi.fn(),
  removeClassStudent: vi.fn(),
}));

const classroom: client.Classroom = {
  id: "c1", teacher_id: "t1", name: "Physics 8A", status: "active",
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-02T00:00:00Z", student_count: 1,
};
const member: client.ClassStudent = {
  id: "s1", full_name: "Student One", email: "one@example.test", role: "student", created_at: "2026-01-01T00:00:00Z",
  membership: { id: "m1", class_id: "c1", student_id: "s1", joined_at: "2026-08-03T00:00:00Z", removed_at: null },
};

function renderWithLocale(node: React.ReactNode, locale: "ru" | "en" | "tg" = "ru") {
  window.localStorage.setItem("edumind:locale", locale);
  return render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><LocaleProvider>{node}</LocaleProvider></SWRConfig>);
}

describe("teacher classes workflow", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(client.listClasses).mockResolvedValue([classroom]);
    vi.mocked(client.getClassroom).mockResolvedValue(classroom);
    vi.mocked(client.listClassStudents).mockResolvedValue([member]);
    vi.mocked(client.searchAvailableStudents).mockResolvedValue([{ id: "s2", full_name: "Student Two", email: "two@example.test" }]);
    vi.mocked(client.createClassroom).mockResolvedValue(classroom);
    vi.mocked(client.updateClassroom).mockResolvedValue(classroom);
    vi.mocked(client.addClassStudent).mockResolvedValue({ id: "m2", class_id: "c1", student_id: "s2", joined_at: "2026-08-04", removed_at: null });
    vi.mocked(client.removeClassStudent).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("shows real classes and creates a trimmed class", async () => {
    renderWithLocale(<ClassesList />);
    expect(await screen.findByText("Physics 8A")).toBeDefined();
    expect(screen.getByText(ru.teacher.classes.memberCount.replace("{count}", "1"))).toBeDefined();
    fireEvent.change(screen.getByPlaceholderText(ru.teacher.classes.classNamePlaceholder), { target: { value: "  Chemistry 9B  " } });
    fireEvent.click(screen.getByRole("button", { name: new RegExp(ru.teacher.classes.create) }));
    await waitFor(() => expect(client.createClassroom).toHaveBeenCalledWith("Chemistry 9B"));
  });

  it("shows an honest empty state and validates blank names", async () => {
    vi.mocked(client.listClasses).mockResolvedValue([]);
    renderWithLocale(<ClassesList />);
    expect(await screen.findByText(ru.teacher.classes.empty)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(ru.teacher.classes.create) }));
    expect(screen.getByRole("alert").textContent).toBe(ru.teacher.classes.validationName);
    expect(client.createClassroom).not.toHaveBeenCalled();
  });

  it("renders the new workflow strings in English and Tajik", async () => {
    vi.mocked(client.listClasses).mockResolvedValue([]);
    renderWithLocale(<ClassesList />, "en");
    expect(await screen.findByText(en.teacher.classes.title)).toBeDefined();
    cleanup();
    renderWithLocale(<ClassesList />, "tg");
    expect(await screen.findByText(tg.teacher.classes.title)).toBeDefined();
  });

  it("shows class members and supports rename", async () => {
    renderWithLocale(<ClassDetail classroomId="c1" />);
    expect(await screen.findByText("Student One")).toBeDefined();
    const name = screen.getByDisplayValue("Physics 8A");
    fireEvent.change(name, { target: { value: "Physics 8B" } });
    fireEvent.click(screen.getByRole("button", { name: ru.teacher.classes.rename }));
    await waitFor(() => expect(client.updateClassroom).toHaveBeenCalledWith("c1", { name: "Physics 8B" }));
  });

  it("searches bounded candidates and adds an existing student", async () => {
    renderWithLocale(<ClassDetail classroomId="c1" />);
    await screen.findByText("Student One");
    fireEvent.change(screen.getByPlaceholderText(ru.teacher.classes.searchPlaceholder), { target: { value: "Two" } });
    expect(await screen.findByText("Student Two")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: ru.teacher.classes.add }));
    await waitFor(() => expect(client.addClassStudent).toHaveBeenCalledWith("c1", "s2"));
  });

  it("confirms membership removal without deleting an account", async () => {
    renderWithLocale(<ClassDetail classroomId="c1" />);
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(ru.teacher.classes.remove) }));
    await waitFor(() => expect(client.removeClassStudent).toHaveBeenCalledWith("c1", "s1"));
    expect(window.confirm).toHaveBeenCalledWith(ru.teacher.classes.removeConfirm);
  });

  it("makes archived membership read-only", async () => {
    vi.mocked(client.getClassroom).mockResolvedValue({ ...classroom, status: "archived" });
    renderWithLocale(<ClassDetail classroomId="c1" />);
    expect(await screen.findByText(ru.teacher.classes.archivedMessage)).toBeDefined();
    expect(screen.queryByText(ru.teacher.classes.addStudent)).toBeNull();
    expect(screen.queryByRole("button", { name: new RegExp(ru.teacher.classes.remove) })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: ru.teacher.classes.restore }));
    await waitFor(() => expect(client.updateClassroom).toHaveBeenCalledWith("c1", { status: "active" }));
  });
});
