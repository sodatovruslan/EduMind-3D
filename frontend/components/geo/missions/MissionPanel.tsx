"use client";

import { ArrowRight, Check, RotateCcw } from "lucide-react";
import { useLocale } from "@/lib/locale-context";
import { MATERIK_IDS, countryByCode, type CountryCollection } from "@/lib/geo/education/continents";
import { GEO_MISSIONS, type GeoMissionId, type GeoMissionsState } from "@/lib/geo/education/useGeoMissions";

/**
 * GeoWorld mission panel under the globe: the three missions as steps, what
 * the open one asks for, and a checklist of what has really been found so
 * far. Shows the state it is given — it decides nothing itself.
 */
function Chip({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-ds-caption font-medium ${
        done ? "border-success/50 bg-success/10 text-success" : "border-border/[0.14] text-text-muted"
      }`}
    >
      {done && <Check size={13} />}
      {label}
    </span>
  );
}

export default function MissionPanel({
  missions,
  countries,
}: {
  missions: GeoMissionsState;
  /** Country outlines, for naming the countries already recognised; null until loaded. */
  countries?: CountryCollection | null;
}) {
  const { t, locale } = useLocale();
  const m = t.geo.missions;
  const { mission, missionIndex, isComplete, isLastMission } = missions;

  const text: Record<GeoMissionId, { title: string; description: string; goal: string }> = {
    "geo-mission-continents": m.continents,
    "geo-mission-records": m.records,
    "geo-mission-shapes": m.shapes,
  };
  const current = text[mission.id];

  const countryLabel = (adm0: string): string => {
    const feature = countries ? countryByCode(countries, adm0) : null;
    if (!feature) return adm0;
    const p = feature.properties;
    return String((locale === "en" ? p.NAME_EN ?? p.NAME : p.NAME_RU ?? p.NAME) ?? adm0);
  };

  return (
    <section className="ds-glass mt-4 rounded-ds-panel p-4" data-testid="geo-mission-panel" aria-label={m.heading}>
      <ol className="mb-3 flex items-center gap-1.5" aria-label={m.stepperAria} data-testid="geo-mission-stepper">
        {GEO_MISSIONS.map((item, index) => {
          const done = missions.completedMissionIds.includes(item.id);
          const isCurrent = index === missionIndex;
          return (
            <li key={item.id} className="flex min-w-0 flex-1 items-center gap-1.5" aria-current={isCurrent ? "step" : undefined}>
              <button
                type="button"
                onClick={() => missions.goToMission(index)}
                disabled={!missions.isMissionUnlocked(index)}
                data-testid={`geo-mission-step-${index + 1}`}
                className="ds-focus-ring flex min-w-0 items-center gap-1.5 rounded-full pr-1 transition-opacity enabled:hover:opacity-75 disabled:cursor-not-allowed"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-ds-caption ${
                    done
                      ? "border-success/60 bg-success/15 text-success"
                      : isCurrent
                        ? "border-accent-geo text-accent-geo"
                        : "border-border/[0.15] text-text-muted"
                  }`}
                >
                  {done ? <Check size={13} /> : index + 1}
                </span>
                <span className={`hidden truncate text-ds-caption sm:block ${isCurrent ? "font-medium text-text-primary" : "text-text-muted"}`}>
                  {text[item.id].title}
                </span>
              </button>
              {index < GEO_MISSIONS.length - 1 && <span className={`h-px min-w-3 flex-1 ${done ? "bg-success/50" : "bg-border/[0.15]"}`} />}
            </li>
          );
        })}
      </ol>

      <div className="mb-2 flex items-center justify-between">
        <div className="font-mono text-ds-caption uppercase tracking-widest text-text-muted">
          {m.counter.replace("{index}", String(missionIndex + 1)).replace("{total}", String(GEO_MISSIONS.length))}
        </div>
        <div className="font-mono text-ds-caption text-accent-geo" data-testid="geo-mission-xp">
          XP: {missions.totalXp}
        </div>
      </div>

      <h3 className="text-ds-body font-semibold text-text-primary" data-testid="geo-mission-title">
        {current.title}
      </h3>
      <p className="mt-1 text-ds-body text-text-secondary">{current.description}</p>
      <p className="mt-1 text-ds-caption text-text-muted">
        {m.goalLabel}: {current.goal}
      </p>

      <div
        className={`mt-3 rounded-ds-control border px-3 py-3 ${isComplete ? "border-success/40" : "border-border/[0.1]"}`}
        data-testid="geo-mission-progress"
        data-complete={isComplete}
      >
        <div className={`mb-2 text-ds-caption font-medium ${isComplete ? "text-success" : "text-text-secondary"}`}>
          {isComplete ? `✔ ${m.doneLabel} (+${mission.xpReward} XP)` : m.progress.replace("{done}", String(missions.done)).replace("{total}", String(mission.total))}
        </div>

        {mission.id === "geo-mission-continents" && (
          <div className="flex flex-wrap gap-2">
            {MATERIK_IDS.map((id) => (
              <Chip key={id} label={m.continents.names[id]} done={missions.foundContinents.includes(id)} />
            ))}
          </div>
        )}

        {mission.id === "geo-mission-records" && (
          <>
            {/* the questions of this run, in order; only the answers already found are named */}
            <div className="flex flex-wrap gap-2">
              {missions.recordOrder.map((id) => {
                const found = missions.foundRecords.includes(id);
                return <Chip key={id} label={found ? m.records.answers[id] : m.records.questions[id]} done={found} />;
              })}
            </div>
            {isComplete && <p className="mt-2 text-ds-body text-text-secondary">{m.records.insight}</p>}
          </>
        )}

        {mission.id === "geo-mission-shapes" && (
          <>
            <div className="flex flex-wrap gap-2">
              {missions.shapeOrder.map((code, index) => {
                const found = missions.foundShapes.includes(code);
                // an unsolved country is never named here — that would be the answer
                return <Chip key={code} label={found ? countryLabel(code) : `${index + 1}`} done={found} />;
              })}
            </div>
            {isComplete && <p className="mt-2 text-ds-body text-text-secondary">{m.shapes.insight}</p>}
          </>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        {isLastMission && isComplete ? (
          <button
            type="button"
            onClick={() => missions.goToMission(0)}
            data-testid="geo-mission-restart-button"
            className="ds-focus-ring flex items-center gap-2 rounded-full border border-border/[0.12] px-4 py-2 text-ds-body font-medium text-text-primary transition-colors hover:bg-text-primary/5"
          >
            <RotateCcw size={16} />
            {m.restartButton}
          </button>
        ) : (
          <button
            type="button"
            onClick={missions.advance}
            disabled={!isComplete}
            data-testid="geo-mission-next-button"
            className="ds-focus-ring flex items-center gap-2 rounded-full border border-border/[0.12] px-4 py-2 text-ds-body font-medium text-text-primary transition-colors hover:bg-text-primary/5 disabled:opacity-40"
          >
            {m.nextButton}
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
