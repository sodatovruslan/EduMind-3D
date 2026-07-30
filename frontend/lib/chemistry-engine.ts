/**
 * Chemistry World — Chemistry Engine (Stage 5). Отвечает ТОЛЬКО за
 * физическое состояние лаборатории: контейнеры, вещества внутри них,
 * температура, нагрев/охлаждение, цвет, масса, объем, агрегатное
 * состояние. Не решает, "что произойдет при смешивании" (это
 * Reaction Engine, reaction-engine.ts) — не путает эти две зоны
 * ответственности, как и Physics Engine/Circuit Engine в Electricity Lab.
 *
 * Всё детерминировано и посчитано: растворимость, смешение цветов по
 * массе, агрегатное состояние по температуре кипения/плавления,
 * сохранение массы при переливании — никаких случайных чисел.
 */

export type AggregateState = "solid" | "liquid" | "gas";

export interface Substance {
  id: string;
  name: string;
  formula: string;
  colorHex: string;
  densityGPerMl: number;
  molarMassGPerMol: number;
  meltingPointC: number;
  boilingPointC: number;
  // растворимость в воде (г/л) — если задана, вещество твердое и может
  // выпадать в осадок при превышении предела растворимости
  solubilityGPerLiterWater?: number;
  isAcid?: boolean;
  isBase?: boolean;
}

// первый набор веществ (Stage 5 Foundation) — реальные справочные величины
export const SUBSTANCES: Record<string, Substance> = {
  water: {
    id: "water",
    name: "Вода",
    formula: "H₂O",
    colorHex: "#cfe8fb",
    densityGPerMl: 1.0,
    molarMassGPerMol: 18.02,
    meltingPointC: 0,
    boilingPointC: 100,
  },
  nacl: {
    id: "nacl",
    name: "Поваренная соль",
    formula: "NaCl",
    colorHex: "#f8fafc",
    densityGPerMl: 2.16,
    molarMassGPerMol: 58.44,
    meltingPointC: 801,
    boilingPointC: 1465,
    solubilityGPerLiterWater: 360,
  },
  hcl: {
    id: "hcl",
    name: "Соляная кислота",
    formula: "HCl",
    colorHex: "#eef6ee",
    densityGPerMl: 1.18,
    molarMassGPerMol: 36.46,
    meltingPointC: -114,
    boilingPointC: 110,
    isAcid: true,
  },
  naoh: {
    id: "naoh",
    name: "Гидроксид натрия",
    formula: "NaOH",
    colorHex: "#eef6ee",
    densityGPerMl: 2.13,
    molarMassGPerMol: 40.0,
    meltingPointC: 318,
    boilingPointC: 1388,
    isBase: true,
  },
  cuso4: {
    id: "cuso4",
    name: "Сульфат меди",
    formula: "CuSO₄",
    colorHex: "#3b82c4",
    densityGPerMl: 3.6,
    molarMassGPerMol: 159.61,
    meltingPointC: 110,
    boilingPointC: 150,
    solubilityGPerLiterWater: 200,
  },
  agno3: {
    id: "agno3",
    name: "Нитрат серебра",
    formula: "AgNO₃",
    colorHex: "#f5f5f4",
    densityGPerMl: 4.35,
    molarMassGPerMol: 169.87,
    meltingPointC: 212,
    boilingPointC: 444,
    solubilityGPerLiterWater: 2160,
  },
  // продукты реакций (Reaction Engine ссылается на них по id)
  nacl_solid_precip: {
    id: "nacl_solid_precip",
    name: "Хлорид натрия (осадок)",
    formula: "NaCl",
    colorHex: "#f8fafc",
    densityGPerMl: 2.16,
    molarMassGPerMol: 58.44,
    meltingPointC: 801,
    boilingPointC: 1465,
  },
  agcl: {
    id: "agcl",
    name: "Хлорид серебра",
    formula: "AgCl",
    colorHex: "#eef0f2",
    densityGPerMl: 5.56,
    molarMassGPerMol: 143.32,
    meltingPointC: 455,
    boilingPointC: 1550,
  },
  cu_oh_2: {
    id: "cu_oh_2",
    name: "Гидроксид меди(II)",
    formula: "Cu(OH)₂",
    colorHex: "#3fa5a0",
    densityGPerMl: 3.37,
    molarMassGPerMol: 97.56,
    meltingPointC: 80,
    boilingPointC: 200,
  },
  na2so4: {
    id: "na2so4",
    name: "Сульфат натрия",
    formula: "Na₂SO₄",
    colorHex: "#f8fafc",
    densityGPerMl: 2.66,
    molarMassGPerMol: 142.04,
    meltingPointC: 884,
    boilingPointC: 1429,
  },
  nano3: {
    id: "nano3",
    name: "Нитрат натрия",
    formula: "NaNO₃",
    colorHex: "#f8fafc",
    densityGPerMl: 2.26,
    molarMassGPerMol: 84.99,
    meltingPointC: 308,
    boilingPointC: 380,
  },
};

export interface ContainedAmount {
  substanceId: string;
  grams: number;
}

export type ContainerKind = "test_tube" | "beaker" | "flask";

export interface Container {
  id: string;
  kind: ContainerKind;
  contents: ContainedAmount[]; // растворенные/жидкие компоненты
  precipitate: ContainedAmount[]; // нерастворенный твердый осадок
  temperatureC: number;
}

export function createEmptyContainer(id: string, kind: ContainerKind, temperatureC = 20): Container {
  return { id, kind, contents: [], precipitate: [], temperatureC };
}

function addToList(list: ContainedAmount[], substanceId: string, grams: number): ContainedAmount[] {
  if (grams <= 0) return list;
  const existing = list.find((c) => c.substanceId === substanceId);
  if (existing) {
    return list.map((c) => (c.substanceId === substanceId ? { ...c, grams: c.grams + grams } : c));
  }
  return [...list, { substanceId, grams }];
}

function mergeLists(a: ContainedAmount[], b: ContainedAmount[]): ContainedAmount[] {
  return b.reduce((acc, item) => addToList(acc, item.substanceId, item.grams), a);
}

function amountOf(list: ContainedAmount[], substanceId: string): number {
  return list.find((c) => c.substanceId === substanceId)?.grams ?? 0;
}

export function totalMassG(container: Container): number {
  return [...container.contents, ...container.precipitate].reduce((sum, c) => sum + c.grams, 0);
}

// объем = сумма (масса/плотность) по каждому растворенному компоненту —
// реальный расчет через плотность, а не выдуманное число
export function totalVolumeMl(container: Container): number {
  return container.contents.reduce((sum, c) => {
    const substance = SUBSTANCES[c.substanceId];
    return sum + (substance ? c.grams / substance.densityGPerMl : 0);
  }, 0);
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// цвет смеси — взвешенное по массе смешение цветов компонентов, реальный
// расчет, а не декоративный рандом
export function computeColorHex(container: Container): string {
  if (container.contents.length === 0) return "#e2e8f0";
  let r = 0;
  let g = 0;
  let b = 0;
  let totalWeight = 0;
  for (const c of container.contents) {
    const substance = SUBSTANCES[c.substanceId];
    if (!substance) continue;
    const [cr, cg, cb] = hexToRgb(substance.colorHex);
    r += cr * c.grams;
    g += cg * c.grams;
    b += cb * c.grams;
    totalWeight += c.grams;
  }
  if (totalWeight === 0) return "#e2e8f0";
  return rgbToHex(r / totalWeight, g / totalWeight, b / totalWeight);
}

function dominantLiquidSubstance(container: Container): Substance | null {
  let best: { substance: Substance; grams: number } | null = null;
  for (const c of container.contents) {
    const substance = SUBSTANCES[c.substanceId];
    if (!substance) continue;
    if (!best || c.grams > best.grams) best = { substance, grams: c.grams };
  }
  return best?.substance ?? null;
}

// агрегатное состояние — по температуре относительно точек кипения/плавления
// преобладающего (по массе) компонента смеси
export function aggregateStateOf(container: Container): AggregateState {
  const dominant = dominantLiquidSubstance(container);
  if (!dominant) return "liquid";
  if (container.temperatureC >= dominant.boilingPointC) return "gas";
  if (container.temperatureC <= dominant.meltingPointC) return "solid";
  return "liquid";
}

export function heat(container: Container, deltaC: number): Container {
  return { ...container, temperatureC: container.temperatureC + deltaC };
}

// добавление вещества: для растворимых твердых веществ избыток сверх
// предела растворимости (относительно объема воды в контейнере) реально
// уходит в осадок, а не растворяется "магически"
export function addSubstance(container: Container, substanceId: string, grams: number): Container {
  const substance = SUBSTANCES[substanceId];
  if (!substance || grams <= 0) return container;

  if (substance.solubilityGPerLiterWater !== undefined) {
    const waterGrams = amountOf(container.contents, "water");
    const waterLiters = waterGrams / SUBSTANCES.water.densityGPerMl / 1000;
    const alreadyDissolvedG = amountOf(container.contents, substanceId);
    const maxDissolvableG = waterLiters > 0 ? substance.solubilityGPerLiterWater * waterLiters : 0;
    const roomForMoreG = Math.max(0, maxDissolvableG - alreadyDissolvedG);
    const dissolvedG = Math.min(grams, roomForMoreG);
    const precipitateG = grams - dissolvedG;

    return {
      ...container,
      contents: addToList(container.contents, substanceId, dissolvedG),
      precipitate: addToList(container.precipitate, substanceId, precipitateG),
    };
  }

  return { ...container, contents: addToList(container.contents, substanceId, grams) };
}

// переливание: сохраняет массу, температура принимающего контейнера —
// взвешенное по массе среднее (упрощенная термодинамика без разных
// теплоемкостей веществ — сознательное упрощение MVP, не влияет на
// корректность сохранения массы/состава)
export function pour(source: Container, target: Container, fraction = 1): { source: Container; target: Container } {
  const f = Math.max(0, Math.min(1, fraction));

  const movedContents = source.contents.map((c) => ({ substanceId: c.substanceId, grams: c.grams * f }));
  const movedPrecipitate = source.precipitate.map((c) => ({ substanceId: c.substanceId, grams: c.grams * f }));
  const remainingContents = source.contents
    .map((c) => ({ substanceId: c.substanceId, grams: c.grams * (1 - f) }))
    .filter((c) => c.grams > 1e-9);
  const remainingPrecipitate = source.precipitate
    .map((c) => ({ substanceId: c.substanceId, grams: c.grams * (1 - f) }))
    .filter((c) => c.grams > 1e-9);

  const movedMass = totalMassG(source) * f;
  const targetMassBefore = totalMassG(target);
  const mixedTempC =
    movedMass + targetMassBefore > 0
      ? (source.temperatureC * movedMass + target.temperatureC * targetMassBefore) / (movedMass + targetMassBefore)
      : target.temperatureC;

  const newTarget: Container = {
    ...target,
    contents: mergeLists(target.contents, movedContents),
    precipitate: mergeLists(target.precipitate, movedPrecipitate),
    temperatureC: mixedTempC,
  };

  const newSource: Container = {
    ...source,
    contents: remainingContents,
    precipitate: remainingPrecipitate,
  };

  return { source: newSource, target: newTarget };
}
