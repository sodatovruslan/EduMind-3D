import { describe, expect, it } from "vitest";
import { ru } from "../../i18n/dictionaries/ru";
import { en } from "../../i18n/dictionaries/en";
import { tg } from "../../i18n/dictionaries/tg";

// G6.12 QA FIX §"LABELS" — подписи 4 слоёв + UI-тексты Earth Structure Mode
// должны реально существовать и быть переведены на RU/EN/TG (не заглушки/
// не дубликаты одного языка под разными ключами).
const DICTS = { ru, en, tg } as const;

describe("Earth Structure labels exist and are localized in RU/EN/TG", () => {
  for (const [locale, dict] of Object.entries(DICTS)) {
    it(`${locale}: все 4 подписи слоёв — непустые строки`, () => {
      const lesson = dict.geo.maplibre.lesson;
      expect(lesson.layerCrust.length).toBeGreaterThan(0);
      expect(lesson.layerMantle.length).toBeGreaterThan(0);
      expect(lesson.layerOuterCore.length).toBeGreaterThan(0);
      expect(lesson.layerInnerCore.length).toBeGreaterThan(0);
    });

    it(`${locale}: 4 подписи слоёв попарно различны (не скопированы друг у друга)`, () => {
      const lesson = dict.geo.maplibre.lesson;
      const labels = [lesson.layerCrust, lesson.layerMantle, lesson.layerOuterCore, lesson.layerInnerCore];
      expect(new Set(labels).size).toBe(labels.length);
    });

    it(`${locale}: Earth Structure UI-тексты (objective/selectPrompt/returnToSurface/scaleDisclosure) непустые`, () => {
      const es = dict.geo.maplibre.earthScience.earthStructure;
      expect(es.objective.length).toBeGreaterThan(0);
      expect(es.selectPrompt.length).toBeGreaterThan(0);
      expect(es.returnToSurface.length).toBeGreaterThan(0);
      expect(es.scaleDisclosure.length).toBeGreaterThan(0);
    });
  }

  it("layerCrust отличается между RU/EN/TG (реальный перевод, не один язык на все локали)", () => {
    const values = new Set([ru.geo.maplibre.lesson.layerCrust, en.geo.maplibre.lesson.layerCrust, tg.geo.maplibre.lesson.layerCrust]);
    expect(values.size).toBe(3);
  });

  it("returnToSurface отличается между RU/EN/TG", () => {
    const values = new Set([
      ru.geo.maplibre.earthScience.earthStructure.returnToSurface,
      en.geo.maplibre.earthScience.earthStructure.returnToSurface,
      tg.geo.maplibre.earthScience.earthStructure.returnToSurface,
    ]);
    expect(values.size).toBe(3);
  });
});
