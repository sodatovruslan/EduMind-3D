"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/swr-fetcher";
import type { Simulation } from "@/lib/types";
import Loader from "@/components/ui/Loader";
import Geo3DScene from "@/components/scenes/Geo3DScene";

export default function Geo3DPage({ params }: { params: { id: string } }) {
  const { data: simulation, isLoading } = useSWR<Simulation>(
    `/api/simulations/${params.id}`,
    swrFetcher
  );

  if (isLoading) return <Loader />;
  if (!simulation) return <p className="text-sm text-gray-500">Симуляция не найдена.</p>;

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-gray-900">{simulation.title}</h1>
      <p className="mb-6 text-sm text-gray-500">{simulation.subject}</p>

      <Geo3DScene simulation={simulation} />
    </div>
  );
}
