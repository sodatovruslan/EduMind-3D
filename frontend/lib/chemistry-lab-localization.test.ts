import { describe, expect, it } from "vitest";
import { LAB_CATALOG } from "@/lib/chemistry-lab-catalog";
import { localizeLabExperiment } from "@/lib/chemistry-lab-localization";

describe("chemistry lab catalog localization", () => {
  it("provides locale-specific title and description for all 16 experiments", () => {
    expect(LAB_CATALOG).toHaveLength(16);
    for (const experiment of LAB_CATALOG) {
      const ru = localizeLabExperiment(experiment, "ru");
      const en = localizeLabExperiment(experiment, "en");
      const tg = localizeLabExperiment(experiment, "tg");
      expect(en.title, experiment.id).not.toBe(ru.title);
      expect(en.description, experiment.id).not.toBe(ru.description);
      expect(tg.title, experiment.id).not.toBe(ru.title);
      expect(tg.description, experiment.id).not.toBe(ru.description);
    }
  });

  it("does not mutate progression or experiment identity", () => {
    for (const experiment of LAB_CATALOG) {
      const localized = localizeLabExperiment(experiment, "en");
      expect(localized.id).toBe(experiment.id);
      expect(localized.difficulty).toBe(experiment.difficulty);
      expect(localized.isComplete).toBe(experiment.isComplete);
    }
  });
});
