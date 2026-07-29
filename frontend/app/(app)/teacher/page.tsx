"use client";

import { useState } from "react";
import useSWR from "swr";
import { Users, TrendingUp, CheckCircle2, Activity } from "lucide-react";
import { swrFetcher } from "@/lib/swr-fetcher";
import type { ClassStats, LabResult, User } from "@/lib/types";
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

  const { data: stats } = useSWR<ClassStats>("/api/results/stats", swrFetcher);

  const { data: students, isLoading: isLoadingStudents } = useSWR<User[]>(
    "/api/users/",
    swrFetcher
  );

  const { data: results, isLoading: isLoadingResults } = useSWR<LabResult[]>(
    selectedStudentId ? `/api/results/student/${selectedStudentId}` : null,
    swrFetcher
  );

  const selectedStudent = students?.find((s) => s.id === selectedStudentId);

  if (isLoadingStudents) return <Loader />;

  return (
    <div>
      <h1 className="mb-6 font-headline text-2xl font-bold text-slate-100">Учительский дашборд</h1>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Users}
          accent="text-brand"
          label="Всего учеников"
          value={stats ? stats.total_students : "—"}
        />
        <StatCard
          icon={Activity}
          accent="text-neon-cyan"
          label="Активных учеников"
          value={stats ? stats.active_students : "—"}
        />
        <StatCard
          icon={TrendingUp}
          accent="text-neon-violet"
          label="Средний балл"
          value={stats?.average_score != null ? stats.average_score.toFixed(1) : "—"}
        />
        <StatCard
          icon={CheckCircle2}
          accent="text-brand"
          label="Прогресс класса"
          value={stats ? `${stats.completion_rate}%` : "—"}
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <ul className="glass-panel w-full shrink-0 space-y-1 rounded-2xl p-2 lg:w-64">
          {students?.map((student) => (
            <li key={student.id}>
              <button
                onClick={() => setSelectedStudentId(student.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedStudentId === student.id
                    ? "neon-glow-indigo bg-brand/20 font-medium text-brand"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                {student.full_name}
                <span className="block font-mono text-xs text-slate-500">{student.email}</span>
              </button>
            </li>
          ))}
          {students?.length === 0 && <p className="p-2 text-sm text-slate-400">Учеников пока нет.</p>}
        </ul>

        <div className="glass-panel flex-1 rounded-2xl p-4">
          {!selectedStudentId && (
            <p className="text-sm text-slate-400">Выберите ученика слева, чтобы увидеть результаты.</p>
          )}

          {selectedStudentId && isLoadingResults && <Loader />}

          {selectedStudentId && results && (
            <>
              <h2 className="mb-4 font-headline font-semibold text-slate-100">
                {selectedStudent?.full_name}
              </h2>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-glass-border font-mono text-xs uppercase tracking-widest text-slate-500">
                    <th className="py-2">Симуляция</th>
                    <th className="py-2">Оценка</th>
                    <th className="py-2">Длительность</th>
                    <th className="py-2">Завершено</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.id} className="border-b border-white/5">
                      <td className="py-2 text-slate-300">{result.simulation_title}</td>
                      <td className="py-2 font-medium text-slate-100">{result.score ?? "—"}</td>
                      <td className="py-2 text-slate-300">{result.duration_seconds}с</td>
                      <td className="py-2 font-mono text-xs text-slate-500">
                        {new Date(result.completed_at).toLocaleDateString("ru-RU")}
                      </td>
                    </tr>
                  ))}
                  {results.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-slate-400">
                        Этот ученик еще не прошел ни одной симуляции.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  accent,
  label,
  value,
}: {
  icon: typeof Users;
  accent: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="glass-panel rim-light rounded-2xl p-4">
      <Icon className={accent} size={20} />
      <div className="mt-3 font-headline text-2xl font-bold text-slate-100">{value}</div>
      <div className="font-mono text-xs uppercase tracking-widest text-slate-500">{label}</div>
    </div>
  );
}
