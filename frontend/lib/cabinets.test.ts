import { describe, expect, it } from "vitest";
import { CABINET_IDS, CABINET_REGISTRY, findCabinetContainingPosition, getCabinet } from "./cabinets";

describe("Cabinet Registry", () => {
  it("содержит четыре существующих шкафа с уникальными world positions", () => {
    expect(CABINET_IDS).toHaveLength(4);
    expect(new Set(Object.values(CABINET_REGISTRY).map((cabinet) => cabinet.worldPosition.join(":"))).size).toBe(4);
  });

  it("возвращает config только для зарегистрированного шкафа", () => {
    expect(getCabinet("cabinet-left-inner")?.displayName).toBe("Шкаф для посуды");
    expect(getCabinet("missing")).toBeNull();
  });

  it("геометрически определяет шкаф для точки внутри и отвергает внешнюю точку", () => {
    expect(findCabinetContainingPosition([-3, -2.8925], 1.85)).toBe("cabinet-left-inner");
    expect(findCabinetContainingPosition([0, 0], 0.05)).toBeNull();
  });
});
