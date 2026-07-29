"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Search } from "lucide-react";
import { swrFetcher } from "@/lib/swr-fetcher";
import type { Simulation } from "@/lib/types";
import LessonCard from "@/components/ui/LessonCard";
import Loader from "@/components/ui/Loader";

export default function DashboardPage() {
  const { data: simulations, error, isLoading } = useSWR<Simulation[]>(
    "/api/simulations/",
    swrFetcher
  );
  const [query, setQuery] = useState("");

  // реальный клиентский фильтр по названию/предмету — список уже загружен целиком,
  // отдельный backend-эндпоинт под поиск для пары десятков симуляций избыточен
  const filteredSimulations = useMemo(() => {
    if (!simulations) return simulations;
    const q = query.trim().toLowerCase();
    if (!q) return simulations;
    return simulations.filter(
      (s) => s.title.toLowerCase().includes(q) || s.subject.toLowerCase().includes(q)
    );
  }, [simulations, query]);

  if (isLoading) return <Loader />;

  if (error) {
    return <p className="text-sm text-red-400">Не удалось загрузить симуляции: {error.message}</p>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-headline text-2xl font-bold text-slate-100">Мои симуляции</h1>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти симуляцию..."
            className="w-full rounded-full border border-glass-border bg-surface-container-lowest/60 py-2 pl-9 pr-4 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:border-neon-cyan focus:outline-none focus:ring-1 focus:ring-neon-cyan"
          />
        </div>
      </div>

      {filteredSimulations && filteredSimulations.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSimulations.map((simulation) => (
            <LessonCard key={simulation.id} simulation={simulation} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">
          {query ? "Ничего не найдено." : "Пока нет доступных симуляций."}
        </p>
      )}
    </div>
  );
}
