"use client";

import type { Silhouette } from "@/lib/geo/education/country-shapes";

/**
 * The outline of the country to find, drawn from the same Natural Earth
 * geometry as the globe. Presentational only: it is given a ready
 * silhouette and never looks anything up itself.
 *
 * The shape is filled flat and unlabelled on purpose — the whole mission is
 * recognising the form, so no name, no flag and no surrounding coastline.
 */
export default function CountrySilhouette({
  silhouette,
  caption,
  solved = false,
}: {
  silhouette: Silhouette | null;
  caption: string;
  /** After a correct answer the outline turns green. */
  solved?: boolean;
}) {
  return (
    <figure
      className="pointer-events-auto flex w-[9.5rem] flex-col items-center gap-1.5 rounded-2xl border border-white/10 bg-slate-950/85 p-3 shadow-xl backdrop-blur-md sm:w-[11rem]"
      data-testid="geo-country-silhouette"
      data-solved={solved}
    >
      {silhouette ? (
        <svg
          viewBox={`0 0 ${silhouette.size} ${silhouette.size}`}
          className="h-28 w-28 sm:h-32 sm:w-32"
          role="img"
          aria-label={caption}
        >
          <path
            d={silhouette.path}
            fillRule="evenodd"
            className={solved ? "fill-emerald-400" : "fill-slate-100"}
            stroke="currentColor"
            strokeWidth={0.8}
            strokeLinejoin="round"
            opacity={0.95}
          />
        </svg>
      ) : (
        <div className="flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
          <span className="h-8 w-8 animate-pulse rounded-full bg-white/20" />
        </div>
      )}
      <figcaption className="text-center text-[11px] font-medium uppercase tracking-wider text-slate-400">{caption}</figcaption>
    </figure>
  );
}
