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
import { selectGeoWorldRenderer } from "@/lib/geo/selectGeoWorldRenderer";

export default function GeoWorldPage({ params }: { params: { id: string } }) {
  const { data: simulation, isLoading } = useSWR<Simulation>(
    `/api/simulations/${params.id}`,
    swrFetcher
  );
  // G6.10 introduced MapLibre behind `?engine=maplibre` for reversible
  // comparison while it was still catching up to the Three.js renderer's
  // educational content. G6.12 closed that gap (Earth Structure, tectonic
  // plates, volcanoes, earthquakes, climate — see GEOWORLD_ROADMAP.md
  // G6.12) — MapLibre is now the DEFAULT production renderer for every
  // student entry point (`/geo3d/{id}` with no query param, and the
  // Learning Center "Войти" CTA, which never appends a query string at
  // all). The old Three.js cutaway renderer is kept as a `?engine=legacy`
  // fallback/reference for dev/debug — not surfaced anywhere in student
  // UI — until the final GeoWorld freeze decision.
  const searchParams = useSearchParams();
  const renderer = selectGeoWorldRenderer(searchParams.get("engine"));

  if (isLoading) return <Loader />;
  if (!simulation) return <SimulationNotFound />;

  return (
    <SimulationShell simulation={simulation}>
      {renderer === "legacy" ? (
        <GeoWorldScene simulation={simulation} />
      ) : (
        <GeoWorldSceneMapLibre simulation={simulation} />
      )}
    </SimulationShell>
  );
}
