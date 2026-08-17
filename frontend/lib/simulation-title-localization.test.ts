import { describe, expect, it } from "vitest";
import { localizeSimulationTitle } from "@/lib/simulation-title-localization";

describe("simulation title localization", () => {
  it("localizes the seeded Chemistry World title", () => {
    const source = "Chemistry World: первые эксперименты";
    expect(localizeSimulationTitle(source, "en")).toBe("Chemistry World: first experiments");
    expect(localizeSimulationTitle(source, "tg")).toBe("Chemistry World: таҷрибаҳои аввалин");
    expect(localizeSimulationTitle(source, "ru")).toBe(source);
  });

  it("preserves unknown user-authored titles", () => {
    expect(localizeSimulationTitle("Custom lab", "tg")).toBe("Custom lab");
  });
});
