"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/swr-fetcher";
import type { Simulation } from "@/lib/types";
import Loader from "@/components/ui/Loader";
import SimLabScene from "@/components/scenes/SimLabScene";

export default function SimLabPage({ params }: { params: { id: string } }) {
  const { data: simulation, isLoading } = useSWR<Simulation>(
    `/api/simulations/${params.id}`,
    swrFetcher
  );

  if (isLoading) return <Loader />;
  if (!simulation) return <p className="text-sm text-slate-400">Симуляция не найдена.</p>;

  return (
    <div>
      <h1 className="mb-1 font-headline text-2xl font-bold text-slate-100">{simulation.title}</h1>
      <p className="mb-6 font-mono text-sm uppercase tracking-widest text-brand">{simulation.subject}</p>

      <SimLabScene simulation={simulation} />
    </div>
  );
}
