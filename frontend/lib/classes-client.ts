import { apiFetch } from "@/lib/api";

export type ClassroomStatus = "active" | "archived";

export interface Classroom {
  id: string;
  teacher_id: string;
  name: string;
  status: ClassroomStatus;
  created_at: string;
  updated_at: string;
  student_count: number;
}

export interface ClassMembership {
  id: string;
  class_id: string;
  student_id: string;
  joined_at: string;
  removed_at: string | null;
}

export interface ClassStudent {
  id: string;
  email: string;
  full_name: string;
  role: "student";
  created_at: string;
  membership: ClassMembership;
}

export interface AvailableStudent {
  id: string;
  full_name: string;
  email: string;
}

export const listClasses = () => apiFetch<Classroom[]>("/api/classes");
export const getClassroom = (id: string) => apiFetch<Classroom>(`/api/classes/${id}`);
export const createClassroom = (name: string) => apiFetch<Classroom>("/api/classes", {
  method: "POST",
  body: JSON.stringify({ name }),
});
export const updateClassroom = (id: string, payload: { name?: string; status?: ClassroomStatus }) =>
  apiFetch<Classroom>(`/api/classes/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const listClassStudents = (id: string) => apiFetch<ClassStudent[]>(`/api/classes/${id}/students`);
export const searchAvailableStudents = (id: string, query: string) =>
  apiFetch<AvailableStudent[]>(`/api/classes/${id}/available-students?q=${encodeURIComponent(query)}&limit=20`);
export const addClassStudent = (id: string, studentId: string) => apiFetch<ClassMembership>(`/api/classes/${id}/students`, {
  method: "POST",
  body: JSON.stringify({ student_id: studentId }),
});
export const removeClassStudent = (id: string, studentId: string) =>
  apiFetch<void>(`/api/classes/${id}/students/${studentId}`, { method: "DELETE" });
