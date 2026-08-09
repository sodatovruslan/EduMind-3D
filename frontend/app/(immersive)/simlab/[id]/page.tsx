"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/swr-fetcher";
import type { Simulation } from "@/lib/types";
import Loader from "@/components/ui/Loader";
import SimLabScene from "@/components/scenes/SimLabScene";
import SimulationShell from "@/components/simulation/SimulationShell";

export default function SimLabPage({ params }: { params: { id: string } }) {
  const { data: simulation, isLoading } = useSWR<Simulation>(
    `/api/simulations/${params.id}`,
    swrFetcher
  );

  if (isLoading) return <Loader />;
  if (!simulation) return <p className="text-sm text-slate-400">Симуляция не найдена.</p>;

  return (
    <SimulationShell simulation={simulation}>
      <SimLabScene simulation={simulation} />
    </SimulationShell>
  );
}
