"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/swr-fetcher";
import type { Simulation } from "@/lib/types";
import LessonCard from "@/components/ui/LessonCard";
import Loader from "@/components/ui/Loader";

export default function DashboardPage() {
  const { data: simulations, error, isLoading } = useSWR<Simulation[]>(
    "/api/simulations/",
    swrFetcher
  );

  if (isLoading) return <Loader />;

  if (error) {
    return <p className="text-sm text-red-600">Не удалось загрузить симуляции: {error.message}</p>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Мои симуляции</h1>

      {simulations && simulations.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {simulations.map((simulation) => (
            <LessonCard key={simulation.id} simulation={simulation} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">Пока нет доступных симуляций.</p>
      )}
    </div>
  );
}
