"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { swrFetcher } from "@/lib/swr-fetcher";
import type { Simulation } from "@/lib/types";
import Loader from "@/components/ui/Loader";
import GeoWorldScene from "@/components/scenes/GeoWorldScene";
import GeoWorldSceneMapLibre from "@/components/scenes/GeoWorldSceneMapLibre";
import SimulationShell from "@/components/simulation/SimulationShell";
import SimulationNotFound from "@/components/simulation/SimulationNotFound";

export default function GeoWorldPage({ params }: { params: { id: string } }) {
  const { data: simulation, isLoading } = useSWR<Simulation>(
    `/api/simulations/${params.id}`,
    swrFetcher
  );
  // G6.10 — reversible renderer selection, `?engine=maplibre`. Default
  // (no query param) stays the existing Three.js cutaway renderer,
  // unchanged. Purely for internal comparison for now — see compatibility
  // audit in GEOWORLD_ROADMAP.md, G6.10 (educational content: cutaway
  // layers, climate scenario, scoring — not yet on the MapLibre renderer).
  const searchParams = useSearchParams();
  const useMapLibreEngine = searchParams.get("engine") === "maplibre";

  if (isLoading) return <Loader />;
  if (!simulation) return <SimulationNotFound />;

  return (
    <SimulationShell simulation={simulation}>
      {useMapLibreEngine ? (
        <GeoWorldSceneMapLibre simulation={simulation} />
      ) : (
        <GeoWorldScene simulation={simulation} />
      )}
    </SimulationShell>
  );
}
