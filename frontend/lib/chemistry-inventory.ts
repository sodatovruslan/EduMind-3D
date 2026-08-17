/** Data-driven C-Lab 2.0 inventory. Keep persistent ids stable for saves. */
export type ChemistryLocale = "ru" | "en" | "tg";
export type ReagentCategory =
  | "acid"
  | "base"
  | "salt"
  | "indicator"
  | "common_solution"
  | "metal_solid"
  | "gas_reagent";

export type StorageCategory = "acids" | "bases_indicators" | "salts_solutions" | "solids_equipment";
export type HazardCategory = "low" | "irritant" | "corrosive" | "oxidizer" | "environmental";

export interface ReagentDefinition {
  id: string;
  formula: string;
  names: Record<ChemistryLocale, string>;
  category: ReagentCategory;
  storageCategory: StorageCategory;
  hazard: HazardCategory;
  defaultAmountG: number;
  containerType: "bottle";
  solutionColor: string;
}

const n = (ru: string, en: string, tg: string): Record<ChemistryLocale, string> => ({ ru, en, tg });

export const REAGENT_INVENTORY: readonly ReagentDefinition[] = [
  { id: "water", formula: "H₂O", names: n("Вода", "Water", "Об"), category: "common_solution", storageCategory: "salts_solutions", hazard: "low", defaultAmountG: 500, containerType: "bottle", solutionColor: "#cfe8fb" },
  { id: "hcl", formula: "HCl", names: n("Соляная кислота", "Hydrochloric acid", "Кислотаи хлорид"), category: "acid", storageCategory: "acids", hazard: "corrosive", defaultAmountG: 250, containerType: "bottle", solutionColor: "#eef6ee" },
  { id: "h2so4", formula: "H₂SO₄", names: n("Серная кислота", "Sulfuric acid", "Кислотаи сулфат"), category: "acid", storageCategory: "acids", hazard: "corrosive", defaultAmountG: 250, containerType: "bottle", solutionColor: "#f2f7ed" },
  { id: "ch3cooh", formula: "CH₃COOH", names: n("Уксусная кислота", "Acetic acid", "Кислотаи атсетат"), category: "acid", storageCategory: "acids", hazard: "irritant", defaultAmountG: 250, containerType: "bottle", solutionColor: "#f5f7ef" },
  { id: "naoh", formula: "NaOH", names: n("Гидроксид натрия", "Sodium hydroxide", "Гидроксиди натрий"), category: "base", storageCategory: "bases_indicators", hazard: "corrosive", defaultAmountG: 250, containerType: "bottle", solutionColor: "#eef6ee" },
  { id: "caoh2", formula: "Ca(OH)₂", names: n("Гидроксид кальция", "Calcium hydroxide", "Гидроксиди калсий"), category: "base", storageCategory: "bases_indicators", hazard: "irritant", defaultAmountG: 250, containerType: "bottle", solutionColor: "#f6f7ef" },
  { id: "nh3", formula: "NH₃(aq)", names: n("Раствор аммиака", "Ammonia solution", "Маҳлули аммиак"), category: "base", storageCategory: "bases_indicators", hazard: "irritant", defaultAmountG: 250, containerType: "bottle", solutionColor: "#edf6f2" },
  { id: "phenolphthalein", formula: "C₂₀H₁₄O₄", names: n("Фенолфталеин", "Phenolphthalein", "Фенолфталеин"), category: "indicator", storageCategory: "bases_indicators", hazard: "irritant", defaultAmountG: 100, containerType: "bottle", solutionColor: "#f7f7f4" },
  { id: "methyl_orange", formula: "C₁₄H₁₄N₃NaO₃S", names: n("Метилоранж", "Methyl orange", "Метилоранж"), category: "indicator", storageCategory: "bases_indicators", hazard: "low", defaultAmountG: 100, containerType: "bottle", solutionColor: "#f59e0b" },
  { id: "universal_indicator", formula: "pH", names: n("Универсальный индикатор", "Universal indicator", "Индикатори универсалӣ"), category: "indicator", storageCategory: "bases_indicators", hazard: "low", defaultAmountG: 100, containerType: "bottle", solutionColor: "#22c55e" },
  { id: "nacl", formula: "NaCl", names: n("Хлорид натрия", "Sodium chloride", "Хлориди натрий"), category: "salt", storageCategory: "salts_solutions", hazard: "low", defaultAmountG: 500, containerType: "bottle", solutionColor: "#f8fafc" },
  { id: "na2co3", formula: "Na₂CO₃", names: n("Карбонат натрия", "Sodium carbonate", "Карбонати натрий"), category: "gas_reagent", storageCategory: "salts_solutions", hazard: "irritant", defaultAmountG: 300, containerType: "bottle", solutionColor: "#f8fafc" },
  { id: "nahco3", formula: "NaHCO₃", names: n("Гидрокарбонат натрия", "Sodium bicarbonate", "Гидрокарбонати натрий"), category: "gas_reagent", storageCategory: "salts_solutions", hazard: "low", defaultAmountG: 300, containerType: "bottle", solutionColor: "#f8fafc" },
  { id: "cuso4", formula: "CuSO₄", names: n("Сульфат меди", "Copper sulfate", "Сулфати мис"), category: "salt", storageCategory: "salts_solutions", hazard: "environmental", defaultAmountG: 300, containerType: "bottle", solutionColor: "#3b82c4" },
  { id: "feso4", formula: "FeSO₄", names: n("Сульфат железа(II)", "Iron(II) sulfate", "Сулфати оҳан(II)"), category: "salt", storageCategory: "salts_solutions", hazard: "irritant", defaultAmountG: 300, containerType: "bottle", solutionColor: "#86a98a" },
  { id: "kmno4", formula: "KMnO₄", names: n("Перманганат калия", "Potassium permanganate", "Перманганати калий"), category: "salt", storageCategory: "salts_solutions", hazard: "oxidizer", defaultAmountG: 200, containerType: "bottle", solutionColor: "#6b21a8" },
  { id: "agno3", formula: "AgNO₃", names: n("Нитрат серебра", "Silver nitrate", "Нитрати нуқра"), category: "salt", storageCategory: "salts_solutions", hazard: "corrosive", defaultAmountG: 200, containerType: "bottle", solutionColor: "#f5f5f4" },
  { id: "h2o2", formula: "H₂O₂", names: n("Пероксид водорода", "Hydrogen peroxide", "Пероксиди гидроген"), category: "common_solution", storageCategory: "salts_solutions", hazard: "oxidizer", defaultAmountG: 250, containerType: "bottle", solutionColor: "#eaf6ff" },
  { id: "caco3", formula: "CaCO₃", names: n("Карбонат кальция", "Calcium carbonate", "Карбонати калсий"), category: "metal_solid", storageCategory: "solids_equipment", hazard: "low", defaultAmountG: 300, containerType: "bottle", solutionColor: "#f1f5f9" },
  { id: "mg", formula: "Mg", names: n("Магний", "Magnesium", "Магний"), category: "metal_solid", storageCategory: "solids_equipment", hazard: "low", defaultAmountG: 100, containerType: "bottle", solutionColor: "#cbd5e1" },
  { id: "zn", formula: "Zn", names: n("Цинк", "Zinc", "Рӯҳ"), category: "metal_solid", storageCategory: "solids_equipment", hazard: "low", defaultAmountG: 150, containerType: "bottle", solutionColor: "#94a3b8" },
  { id: "fe", formula: "Fe", names: n("Железо", "Iron", "Оҳан"), category: "metal_solid", storageCategory: "solids_equipment", hazard: "low", defaultAmountG: 150, containerType: "bottle", solutionColor: "#64748b" },
  { id: "cu", formula: "Cu", names: n("Медь", "Copper", "Мис"), category: "metal_solid", storageCategory: "solids_equipment", hazard: "low", defaultAmountG: 150, containerType: "bottle", solutionColor: "#b45309" },
] as const;

export const REAGENT_BY_ID = Object.fromEntries(REAGENT_INVENTORY.map((item) => [item.id, item])) as Record<string, ReagentDefinition>;

export const STORAGE_CATEGORY_LABELS: Record<StorageCategory, Record<ChemistryLocale, string>> = {
  acids: n("Кислоты", "Acids", "Кислотаҳо"),
  bases_indicators: n("Основания и индикаторы", "Bases and indicators", "Асосҳо ва индикаторҳо"),
  salts_solutions: n("Соли и растворы", "Salts and solutions", "Намакҳо ва маҳлулҳо"),
  solids_equipment: n("Твёрдые вещества и инструменты", "Solids and equipment", "Моддаҳои сахт ва асбобҳо"),
};
