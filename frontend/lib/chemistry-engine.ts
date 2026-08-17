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

import { REAGENT_INVENTORY } from "./chemistry-inventory";

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

// C-Lab 2.0 inventory records are the source of truth for selectable stock.
// The original six entries above remain byte-for-byte compatible with old saves;
// missing educational reagents receive conservative physical defaults used by the
// existing mass/volume/temperature engine (not encyclopedia-only properties).
const PHYSICAL_OVERRIDES: Record<string, Partial<Substance>> = {
  h2so4: { densityGPerMl: 1.18, molarMassGPerMol: 98.08, meltingPointC: -10, boilingPointC: 120, isAcid: true },
  ch3cooh: { densityGPerMl: 1.01, molarMassGPerMol: 60.05, meltingPointC: 0, boilingPointC: 100, isAcid: true },
  caoh2: { densityGPerMl: 1.0, molarMassGPerMol: 74.09, meltingPointC: 0, boilingPointC: 100, isBase: true },
  nh3: { densityGPerMl: 0.98, molarMassGPerMol: 17.03, meltingPointC: -57, boilingPointC: 38, isBase: true },
  na2co3: { densityGPerMl: 2.54, molarMassGPerMol: 105.99, meltingPointC: 851, boilingPointC: 1600, solubilityGPerLiterWater: 215 },
  nahco3: { densityGPerMl: 2.2, molarMassGPerMol: 84.01, meltingPointC: 50, boilingPointC: 270, solubilityGPerLiterWater: 96 },
  feso4: { densityGPerMl: 1.9, molarMassGPerMol: 151.91, meltingPointC: 64, boilingPointC: 300, solubilityGPerLiterWater: 295 },
  kmno4: { densityGPerMl: 2.7, molarMassGPerMol: 158.03, meltingPointC: 240, boilingPointC: 300, solubilityGPerLiterWater: 64 },
  h2o2: { densityGPerMl: 1.01, molarMassGPerMol: 34.01, meltingPointC: -1, boilingPointC: 100 },
  caco3: { densityGPerMl: 2.71, molarMassGPerMol: 100.09, meltingPointC: 825, boilingPointC: 900, solubilityGPerLiterWater: 0.01 },
  mg: { densityGPerMl: 1.74, molarMassGPerMol: 24.31, meltingPointC: 650, boilingPointC: 1091 },
  zn: { densityGPerMl: 7.14, molarMassGPerMol: 65.38, meltingPointC: 420, boilingPointC: 907 },
  fe: { densityGPerMl: 7.87, molarMassGPerMol: 55.85, meltingPointC: 1538, boilingPointC: 2862 },
  cu: { densityGPerMl: 8.96, molarMassGPerMol: 63.55, meltingPointC: 1085, boilingPointC: 2562 },
};

for (const reagent of REAGENT_INVENTORY) {
  if (SUBSTANCES[reagent.id]) continue;
  SUBSTANCES[reagent.id] = {
    id: reagent.id,
    name: reagent.names.ru,
    formula: reagent.formula,
    colorHex: reagent.solutionColor,
    densityGPerMl: 1,
    molarMassGPerMol: 100,
    meltingPointC: 0,
    boilingPointC: 100,
    ...PHYSICAL_OVERRIDES[reagent.id],
  };
}

Object.assign(SUBSTANCES, {
  co2: { id: "co2", name: "Углекислый газ", formula: "CO₂", colorHex: "#e2e8f0", densityGPerMl: 0.00198, molarMassGPerMol: 44.01, meltingPointC: -78, boilingPointC: -57 },
  h2: { id: "h2", name: "Водород", formula: "H₂", colorHex: "#f8fafc", densityGPerMl: 0.00009, molarMassGPerMol: 2.016, meltingPointC: -259, boilingPointC: -253 },
  o2: { id: "o2", name: "Кислород", formula: "O₂", colorHex: "#dbeafe", densityGPerMl: 0.00143, molarMassGPerMol: 32, meltingPointC: -219, boilingPointC: -183 },
  zncl2: { id: "zncl2", name: "Хлорид цинка", formula: "ZnCl₂", colorHex: "#f8fafc", densityGPerMl: 2.91, molarMassGPerMol: 136.28, meltingPointC: 290, boilingPointC: 732 },
  mgcl2: { id: "mgcl2", name: "Хлорид магния", formula: "MgCl₂", colorHex: "#f8fafc", densityGPerMl: 2.32, molarMassGPerMol: 95.21, meltingPointC: 714, boilingPointC: 1412 },
  cacl2: { id: "cacl2", name: "Хлорид кальция", formula: "CaCl₂", colorHex: "#f8fafc", densityGPerMl: 2.15, molarMassGPerMol: 110.98, meltingPointC: 772, boilingPointC: 1935 },
  ch3coona: { id: "ch3coona", name: "Ацетат натрия", formula: "CH₃COONa", colorHex: "#f8fafc", densityGPerMl: 1.53, molarMassGPerMol: 82.03, meltingPointC: 324, boilingPointC: 400 },
});

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

// задает АБСОЛЮТНОЕ количество вещества в списке (не прибавляет, как
// addToList) — убирает запись, если новое количество ~0
function setAmount(list: ContainedAmount[], substanceId: string, grams: number): ContainedAmount[] {
  const filtered = list.filter((c) => c.substanceId !== substanceId);
  if (grams <= 1e-9) return filtered;
  return [...filtered, { substanceId, grams }];
}

// пересчитывает растворимость КАЖДОГО растворимого вещества в контейнере
// (и уже растворенного, и уже выпавшего в осадок) против ТЕКУЩЕГО количества
// воды. Это устраняет реальный баг: раньше решение "сколько выпадет в осадок"
// принималось ОДИН РАЗ, в момент addSubstance() для конкретного вещества, и
// больше никогда не пересматривалось — если воду добавляли ПОСЛЕ соли (или
// частями), уже выпавший осадок оставался осадком навсегда, даже когда воды
// в итоге становилось более чем достаточно для полного растворения. Реальная
// растворимость зависит от текущего состояния, а не от порядка добавления
// реагентов, поэтому пересчет запускается при КАЖДОМ изменении состава
// (addSubstance и pour ниже), а не только при добавлении самого растворимого
// вещества.
function rebalanceSolubility(container: Container): Container {
  const waterGrams = amountOf(container.contents, "water");
  const waterLiters = waterGrams / SUBSTANCES.water.densityGPerMl / 1000;

  const solubleIds = new Set<string>();
  container.contents.forEach((c) => solubleIds.add(c.substanceId));
  container.precipitate.forEach((c) => solubleIds.add(c.substanceId));

  let contents = container.contents;
  let precipitate = container.precipitate;

  for (const substanceId of solubleIds) {
    const substance = SUBSTANCES[substanceId];
    if (!substance || substance.solubilityGPerLiterWater === undefined) continue;
    const totalG = amountOf(contents, substanceId) + amountOf(precipitate, substanceId);
    if (totalG <= 0) continue;
    const maxDissolvableG = waterLiters > 0 ? substance.solubilityGPerLiterWater * waterLiters : 0;
    const newDissolvedG = Math.min(totalG, maxDissolvableG);
    const newPrecipitateG = totalG - newDissolvedG;
    contents = setAmount(contents, substanceId, newDissolvedG);
    precipitate = setAmount(precipitate, substanceId, newPrecipitateG);
  }

  return { ...container, contents, precipitate };
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
  // Сначала масса реально попадает в сосуд, затем ЕДИНАЯ функция приводит
  // dissolved/precipitate к равновесию относительно текущего количества
  // воды. Благодаря этому результат не зависит от порядка добавления:
  // вода, добавленная после соли, растворяет ранее выпавший осадок.
  return rebalanceSolubility({
    ...container,
    contents: addToList(container.contents, substanceId, grams),
  });
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

  // После переноса количество воды могло измениться с обеих сторон, поэтому
  // растворимость пересчитывается и в источнике, и в приёмнике.
  return {
    source: rebalanceSolubility(newSource),
    target: rebalanceSolubility(newTarget),
  };
}
