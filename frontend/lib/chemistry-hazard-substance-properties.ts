/**
 * Chemistry World — Hazard Substance Properties (Stage 5.5 v2). Безопасный
 * адаптер поверх существующего каталога SUBSTANCES из chemistry-engine.ts:
 * добавляет только те свойства веществ, которые нужны Hazard/Fire System
 * (горючесть), НЕ изменяя сам Substance interface и не трогая
 * chemistry-engine.ts. Ключи — те же substanceId, что уже существуют в
 * SUBSTANCES; новые вещества здесь не вводятся.
 *
 * Ни одно из веществ текущего набора Stage 5 (вода, NaCl, HCl, NaOH,
 * CuSO4, AgNO3 и продукты их реакций) в реальности не является горючим —
 * это отражено здесь честно (flammable: false для всех). Fire System
 * (hazard-engine.ts) поэтому корректно НИКОГДА не должен срабатывать на
 * текущих данных — это не недоработка, а физически правильное поведение,
 * что подтверждается тестом в hazard-engine.test.ts.
 */
export interface HazardSubstanceProperties {
  flammable: boolean;
}

const DEFAULT_PROPERTIES: HazardSubstanceProperties = { flammable: false };

export const HAZARD_SUBSTANCE_PROPERTIES: Record<string, HazardSubstanceProperties> = {
  water: { flammable: false },
  nacl: { flammable: false },
  hcl: { flammable: false },
  naoh: { flammable: false },
  cuso4: { flammable: false },
  agno3: { flammable: false },
  nacl_solid_precip: { flammable: false },
  agcl: { flammable: false },
  cu_oh_2: { flammable: false },
  na2so4: { flammable: false },
  nano3: { flammable: false },
};

export function isFlammable(substanceId: string): boolean {
  return (HAZARD_SUBSTANCE_PROPERTIES[substanceId] ?? DEFAULT_PROPERTIES).flammable;
}
