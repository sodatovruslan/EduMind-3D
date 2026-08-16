"use client";

import useSWR from "swr";
import { ArrowRight, Compass } from "lucide-react";
import { getMyProgress } from "@/lib/progress-client";
import { getMyResults } from "@/lib/results-client";
import { useLocale } from "@/lib/locale-context";
import { LANDING_WORLDS, getWorldByModule, worldCopy } from "@/lib/landing-worlds";
import type { Simulation } from "@/lib/types";
import { ButtonLink, GlassPanel, Skeleton } from "@/components/design-system";

/**
 * D8 — "What's next?" (brief §8): one deterministic recommendation, not an
 * "AI recommends" claim (no AI is involved). Deliberately does NOT repeat
 * ContinueLearning's job (resuming an in-progress save/lab) — it only ever
 * suggests a *different*, real, derivable action:
 *
 * 1. A real weak topic exists AND we know which world the student was most
 *    recently active in (from `LabResult.module`, real D7 field) — suggest
 *    revisiting that topic there.
 * 2. Otherwise, a world with real simulations but zero completed results —
 *    suggest trying it.
 * 3. Otherwise (a brand-new student, or one with no weak topics and no
 *    unexplored world left) — render nothing. Per the D8 brief's explicit
 *    "remove the block if there's no honest data for it" instruction,
 *    applied per-instance rather than only at the page level.
 */
export default function NextStep({ simulations }: { simulations: Simulation[] | undefined }) {
  const { t } = useLocale();
  const { data: progress, isLoading: progressLoading } = useSWR("progress-me", getMyProgress);
  const { data: results, isLoading: resultsLoading } = useSWR("results-me", getMyResults);

  const isLoading = progressLoading || resultsLoading || simulations === undefined;
  if (isLoading) {
    return <Skeleton className="h-16 w-full rounded-ds-panel" />;
  }

  const profile = progress?.profile;
  if (!profile || profile.completed_labs === 0) return null;

  const weakTopics = profile.weak_topics;
  const sortedResults = results ? [...results].sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()) : [];

  if (weakTopics.length > 0 && sortedResults.length > 0) {
    const activeWorld = getWorldByModule(sortedResults[0].module);
    if (activeWorld) {
      const worldSims = simulations?.filter((s) => s.module === sortedResults[0].module) ?? [];
      const featured = [...worldSims].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
      if (featured) {
        return (
          <NextStepStrip
            text={t.dashboard.nextStep.weakTopicText.replace("{topic}", weakTopics[0])}
            ctaLabel={`${t.dashboard.nextStep.openWorldCta} ${worldCopy(t, activeWorld.key).name}`}
            href={`/${featured.module}/${featured.id}`}
          />
        );
      }
    }
  }

  const exploredModules = new Set(sortedResults.map((r) => r.module));
  const unexploredWorld = LANDING_WORLDS.find((world) => {
    const moduleKey = world.routeBase.slice(1) as Simulation["module"];
    const hasSimulations = (simulations ?? []).some((s) => s.module === moduleKey);
    return hasSimulations && !exploredModules.has(moduleKey);
  });
  if (unexploredWorld) {
    const moduleKey = unexploredWorld.routeBase.slice(1) as Simulation["module"];
    const worldSims = simulations?.filter((s) => s.module === moduleKey) ?? [];
    const featured = [...worldSims].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    if (featured) {
      return (
        <NextStepStrip
          text={t.dashboard.nextStep.exploreWorldText.replace("{world}", worldCopy(t, unexploredWorld.key).name)}
          ctaLabel={t.dashboard.nextStep.exploreCta}
          href={`/${featured.module}/${featured.id}`}
        />
      );
    }
  }

  return null;
}

function NextStepStrip({ text, ctaLabel, href }: { text: string; ctaLabel: string; href: string }) {
  const { t } = useLocale();
  return (
    <GlassPanel className="flex flex-col items-start gap-3 rounded-ds-panel px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-center gap-2 text-ds-body text-text-primary">
        <Compass size={18} className="shrink-0 text-accent" />
        <span>
          <span className="mr-1.5 text-ds-caption font-semibold uppercase tracking-widest text-text-muted">{t.dashboard.nextStep.title}</span>
          {text}
        </span>
      </span>
      <ButtonLink href={href} variant="secondary" className="w-full shrink-0 sm:w-auto">
        {ctaLabel}
        <ArrowRight size={14} />
      </ButtonLink>
    </GlassPanel>
  );
}
