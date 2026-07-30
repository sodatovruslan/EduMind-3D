/**
 * Chemistry World — Reaction Engine (Stage 5). Единственное место, которое
 * решает "что произойдет при смешивании веществ" — НЕ AI, НЕ UI. Реакции
 * регистрируются в Reaction Registry (registerReaction), что готовит
 * архитектуру к добавлению 100+ реакций в будущем без изменения самого
 * движка — новая реакция это просто новая запись в реестре.
 *
 * Расчет — реальная стехиометрия (моли = масса/молярная масса,
 * лимитирующий реагент = минимум по коэффициентам), а не декоративный
 * рандом. Реакция срабатывает только если оба реагента реально
 * присутствуют в контейнере в достаточном количестве.
 */
import { SUBSTANCES, type Container, type ContainedAmount } from "./chemistry-engine";

export interface ReactionReactant {
  substanceId: string;
  coefficient: number;
}

export interface ReactionProductSpec {
  substanceId: string;
  coefficient: number;
  formsPrecipitate?: boolean;
}

export interface ReactionCondition {
  minTemperatureC?: number;
  maxTemperatureC?: number;
}

export interface Reaction {
  id: string;
  title: string;
  description: string;
  reactants: ReactionReactant[];
  products: ReactionProductSpec[];
  isExothermic: boolean;
  // упрощенная модель теплового эффекта: рост температуры (°C) при
  // "единичной степени протекания" реакции (extent = 1 формульная порция) —
  // сознательное упрощение вместо полного расчета через теплоемкость смеси
  heatReleasedC?: number;
  conditions?: ReactionCondition;
}

const REGISTRY = new Map<string, Reaction>();

export function registerReaction(reaction: Reaction): void {
  if (REGISTRY.has(reaction.id)) {
    throw new Error(`Reaction "${reaction.id}" is already registered`);
  }
  REGISTRY.set(reaction.id, reaction);
}

export function getRegisteredReactions(): Reaction[] {
  return Array.from(REGISTRY.values());
}

function addToList(list: ContainedAmount[], substanceId: string, grams: number): ContainedAmount[] {
  if (grams <= 1e-9) return list;
  const existing = list.find((c) => c.substanceId === substanceId);
  if (existing) return list.map((c) => (c.substanceId === substanceId ? { ...c, grams: c.grams + grams } : c));
  return [...list, { substanceId, grams }];
}

// степень протекания реакции (в "формульных порциях") — минимум по всем
// реагентам от (реально доступные моли / стехиометрический коэффициент)
function reactionExtent(container: Container, reaction: Reaction): number {
  const extents = reaction.reactants.map((r) => {
    const grams = container.contents.find((c) => c.substanceId === r.substanceId)?.grams ?? 0;
    const substance = SUBSTANCES[r.substanceId];
    if (!substance || grams <= 0) return 0;
    return grams / substance.molarMassGPerMol / r.coefficient;
  });
  return Math.min(...extents);
}

function applyOneReaction(container: Container, reaction: Reaction): Container | null {
  if (reaction.conditions?.minTemperatureC !== undefined && container.temperatureC < reaction.conditions.minTemperatureC) {
    return null;
  }
  if (reaction.conditions?.maxTemperatureC !== undefined && container.temperatureC > reaction.conditions.maxTemperatureC) {
    return null;
  }

  const extent = reactionExtent(container, reaction);
  if (!Number.isFinite(extent) || extent <= 1e-9) return null;

  let contents = container.contents;
  for (const reactant of reaction.reactants) {
    const substance = SUBSTANCES[reactant.substanceId];
    const consumedGrams = extent * reactant.coefficient * substance.molarMassGPerMol;
    contents = contents
      .map((c) => (c.substanceId === reactant.substanceId ? { ...c, grams: c.grams - consumedGrams } : c))
      .filter((c) => c.grams > 1e-9);
  }

  let precipitate = container.precipitate;
  for (const product of reaction.products) {
    const substance = SUBSTANCES[product.substanceId];
    const producedGrams = extent * product.coefficient * substance.molarMassGPerMol;
    if (product.formsPrecipitate) {
      precipitate = addToList(precipitate, product.substanceId, producedGrams);
    } else {
      contents = addToList(contents, product.substanceId, producedGrams);
    }
  }

  const heatDeltaC = reaction.isExothermic && reaction.heatReleasedC ? extent * reaction.heatReleasedC : 0;

  return { ...container, contents, precipitate, temperatureC: container.temperatureC + heatDeltaC };
}

export interface ReactionOutcome {
  container: Container;
  occurredReactions: Reaction[];
}

// применяет все применимые реакции реестра, повторяя проход (продукт одной
// реакции может стать реагентом следующей — задел под многостадийные цепочки)
export function applyReactions(container: Container): ReactionOutcome {
  let current = container;
  const occurred: Reaction[] = [];
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 10) {
    changed = false;
    iterations += 1;
    for (const reaction of getRegisteredReactions()) {
      const result = applyOneReaction(current, reaction);
      if (result) {
        current = result;
        occurred.push(reaction);
        changed = true;
      }
    }
  }

  return { container: current, occurredReactions: occurred };
}

// ---- первый набор реакций (Stage 5 Foundation) ----

registerReaction({
  id: "neutralization-hcl-naoh",
  title: "Нейтрализация",
  description: "HCl + NaOH → NaCl + H₂O",
  reactants: [
    { substanceId: "hcl", coefficient: 1 },
    { substanceId: "naoh", coefficient: 1 },
  ],
  products: [
    { substanceId: "nacl", coefficient: 1 },
    { substanceId: "water", coefficient: 1 },
  ],
  isExothermic: true,
  heatReleasedC: 40,
});

registerReaction({
  id: "precipitation-agno3-nacl",
  title: "Осаждение хлорида серебра",
  description: "AgNO₃ + NaCl → AgCl↓ + NaNO₃",
  reactants: [
    { substanceId: "agno3", coefficient: 1 },
    { substanceId: "nacl", coefficient: 1 },
  ],
  products: [
    { substanceId: "agcl", coefficient: 1, formsPrecipitate: true },
    { substanceId: "nano3", coefficient: 1 },
  ],
  isExothermic: false,
});

registerReaction({
  id: "precipitation-cuso4-naoh",
  title: "Осаждение гидроксида меди",
  description: "CuSO₄ + 2 NaOH → Cu(OH)₂↓ + Na₂SO₄",
  reactants: [
    { substanceId: "cuso4", coefficient: 1 },
    { substanceId: "naoh", coefficient: 2 },
  ],
  products: [
    { substanceId: "cu_oh_2", coefficient: 1, formsPrecipitate: true },
    { substanceId: "na2so4", coefficient: 1 },
  ],
  isExothermic: false,
});
