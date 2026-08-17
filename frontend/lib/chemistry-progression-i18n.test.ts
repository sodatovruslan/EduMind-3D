import { describe, expect, it } from "vitest";
import { dictionaries } from "./i18n/dictionaries";

describe("Chemistry progression lock text", () => {
  it("uses the active RU/EN/TG dictionary instead of a hardcoded English hint", () => {
    expect(dictionaries.ru.chemistry.catalog.unlockHintIntermediate).toBe(
      "Заверши любой эксперимент уровня «Начальный», чтобы открыть"
    );
    expect(dictionaries.ru.chemistry.catalog.unlockHintAdvanced).toBe(
      "Заверши любой эксперимент уровня «Средний», чтобы открыть"
    );
    expect(dictionaries.en.chemistry.catalog.unlockHintIntermediate).toBe(
      "Complete any Beginner-level experiment to unlock"
    );
    expect(dictionaries.en.chemistry.catalog.unlockHintAdvanced).toBe(
      "Complete any Intermediate-level experiment to unlock"
    );
    expect(dictionaries.tg.chemistry.catalog.unlockHintIntermediate).toContain("«Ибтидоӣ»");
    expect(dictionaries.tg.chemistry.catalog.unlockHintAdvanced).toContain("«Миёна»");
  });
});
