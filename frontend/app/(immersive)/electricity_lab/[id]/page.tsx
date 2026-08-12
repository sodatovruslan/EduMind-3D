"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/swr-fetcher";
import type { Simulation } from "@/lib/types";
import Loader from "@/components/ui/Loader";
import ElectricityLabScene from "@/components/scenes/ElectricityLabScene";
import SimulationShell from "@/components/simulation/SimulationShell";
import SimulationNotFound from "@/components/simulation/SimulationNotFound";

export default function ElectricityLabPage({ params }: { params: { id: string } }) {
  const { data: simulation, isLoading } = useSWR<Simulation>(
    `/api/simulations/${params.id}`,
    swrFetcher
  );

  if (isLoading) return <Loader />;
  if (!simulation) return <SimulationNotFound />;

  return (
    <SimulationShell simulation={simulation}>
      <ElectricityLabScene simulation={simulation} />
    </SimulationShell>
  );
}
