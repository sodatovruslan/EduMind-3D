"use client";

import { useState } from "react";
import useSWR from "swr";
import { swrFetcher } from "@/lib/swr-fetcher";
import type { LabResult, User } from "@/lib/types";
import Loader from "@/components/ui/Loader";
import ProtectedRoute from "@/components/ProtectedRoute";

export default function TeacherPage() {
  return (
    <ProtectedRoute allowedRoles={["teacher", "admin"]}>
      <TeacherDashboard />
    </ProtectedRoute>
  );
}

function TeacherDashboard() {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const { data: students, isLoading: isLoadingStudents } = useSWR<User[]>(
    "/api/users/",
    swrFetcher
  );

  const { data: results, isLoading: isLoadingResults } = useSWR<LabResult[]>(
    selectedStudentId ? `/api/results/student/${selectedStudentId}` : null,
    swrFetcher
  );

  if (isLoadingStudents) return <Loader />;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Ученики</h1>

      <div className="flex gap-6">
        <ul className="w-64 shrink-0 space-y-1">
          {students?.map((student) => (
            <li key={student.id}>
              <button
                onClick={() => setSelectedStudentId(student.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                  selectedStudentId === student.id
                    ? "bg-brand/10 font-medium text-brand"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {student.full_name}
                <span className="block text-xs text-gray-400">{student.email}</span>
              </button>
            </li>
          ))}
          {students?.length === 0 && <p className="text-sm text-gray-500">Учеников пока нет.</p>}
        </ul>

        <div className="flex-1">
          {!selectedStudentId && (
            <p className="text-sm text-gray-500">Выберите ученика слева, чтобы увидеть результаты.</p>
          )}

          {selectedStudentId && isLoadingResults && <Loader />}

          {selectedStudentId && results && (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2">Симуляция</th>
                  <th className="py-2">Оценка</th>
                  <th className="py-2">Длительность</th>
                  <th className="py-2">Завершено</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={result.id} className="border-b border-gray-100">
                    {/* TODO: подтянуть название симуляции по simulation_id, когда появится batch-эндпоинт */}
                    <td className="py-2 text-gray-400">{result.simulation_id.slice(0, 8)}…</td>
                    <td className="py-2 font-medium text-gray-900">{result.score ?? "—"}</td>
                    <td className="py-2">{result.duration_seconds}с</td>
                    <td className="py-2 text-gray-500">
                      {new Date(result.completed_at).toLocaleDateString("ru-RU")}
                    </td>
                  </tr>
                ))}
                {results.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-gray-500">
                      Этот ученик еще не прошел ни одной симуляции.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
