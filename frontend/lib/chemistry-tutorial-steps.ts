/**
 * Chemistry World — первый обучающий сценарий (Stage 5): растворение
 * соли в воде, самый простой из 4 экспериментов. Отдельные данные от
 * tutorial-steps.ts (Electricity Lab) — своя реализация той же идеи.
 */
export interface ChemistryTutorialStep {
  id: string;
  title: string;
  instruction: string;
}

export const CHEMISTRY_TUTORIAL_STEPS: ChemistryTutorialStep[] = [
  { id: "step-1", title: "Шаг 1", instruction: "Перетащи бутылку с водой на стакан, чтобы налить в него воду." },
  { id: "step-2", title: "Шаг 2", instruction: "Перетащи бутылку с солью (NaCl) на тот же стакан." },
  { id: "step-3", title: "Шаг 3", instruction: "Проверь: соль должна полностью раствориться — осадка на дне быть не должно." },
];
