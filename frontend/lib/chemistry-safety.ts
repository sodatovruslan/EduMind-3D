/**
 * Chemistry World — Safety System (Stage 5). Реальные, объяснимые проверки
 * безопасности, посчитанные от фактического состояния Chemistry Engine —
 * ничего не придумано и не решается AI: AI Teacher только объясняет уже
 * найденные здесь предупреждения (получает их через Chemistry Context
 * Builder), сам не решает, что опасно.
 */
import { SUBSTANCES, totalMassG, type Container } from "./chemistry-engine";

export interface SafetyWarning {
  code: string;
  message: string;
  severity: "warning" | "danger";
}

export interface SafetyCheckInput {
  container: Container;
  // substanceId в порядке ПЕРВОГО добавления в этот сосуд — опционально;
  // без этой истории проверка порядка добавления просто пропускается,
  // остальные проверки работают и без нее
  firstAddedOrder?: string[];
}

const DANGEROUS_TEMPERATURE_C = 300;
// безопасное разбавление: сколько граммов воды должно приходиться на 1 г
// суммарной массы кислоты+щёлочи, чтобы реакция не была слишком бурной
const MIN_DILUTION_WATER_PER_REAGENT_GRAM = 2;

function gramsOf(list: { substanceId: string; grams: number }[], substanceId: string): number {
  return list.find((c) => c.substanceId === substanceId)?.grams ?? 0;
}

export function checkSafety(input: SafetyCheckInput): SafetyWarning[] {
  const { container, firstAddedOrder = [] } = input;
  const warnings: SafetyWarning[] = [];

  if (totalMassG(container) <= 1e-9 && container.temperatureC > 25) {
    warnings.push({
      code: "empty_container_heated",
      message: "Нагревается пустой сосуд — стекло может треснуть от перегрева без содержимого.",
      severity: "danger",
    });
  }

  if (container.temperatureC > DANGEROUS_TEMPERATURE_C) {
    warnings.push({
      code: "overheating",
      message: `Температура ${container.temperatureC.toFixed(0)}°C слишком высокая для лабораторного стекла — риск повреждения посуды.`,
      severity: "danger",
    });
  }

  const acidG = container.contents
    .filter((c) => SUBSTANCES[c.substanceId]?.isAcid)
    .reduce((sum, c) => sum + c.grams, 0);
  const baseG = container.contents
    .filter((c) => SUBSTANCES[c.substanceId]?.isBase)
    .reduce((sum, c) => sum + c.grams, 0);
  const waterG = gramsOf(container.contents, "water");

  if (acidG > 0 && baseG > 0) {
    const reagentG = acidG + baseG;
    if (waterG < reagentG * MIN_DILUTION_WATER_PER_REAGENT_GRAM) {
      warnings.push({
        code: "low_dilution_acid_base",
        message: "Кислота и щёлочь смешиваются почти без воды — реакция может быть слишком бурной. Добавь больше воды для безопасного разбавления.",
        severity: "warning",
      });
    }
  }

  if (firstAddedOrder.length >= 2) {
    const firstAcidIndex = firstAddedOrder.findIndex((id) => SUBSTANCES[id]?.isAcid);
    const waterIndex = firstAddedOrder.indexOf("water");
    if (firstAcidIndex !== -1 && waterIndex !== -1 && firstAcidIndex < waterIndex) {
      warnings.push({
        code: "wrong_sequence_acid_first",
        message: "Кислота была добавлена в сосуд раньше воды. Правило безопасности: всегда приливай кислоту В воду, а не наоборот.",
        severity: "danger",
      });
    }
  }

  return warnings;
}
