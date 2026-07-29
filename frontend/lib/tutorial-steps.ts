import type { Connection } from "@/lib/circuit-engine";

/**
 * Guided Onboarding — статичные шаги обучающего режима для фиксированной
 * раскладки Electricity Lab (те же id терминалов, что и в
 * frontend/components/scenes/ElectricityLabScene.tsx INITIAL_COMPONENTS).
 * Шаги ведут к одному валидному последовательному контуру:
 * battery+ -> switch -> bulb -> resistor -> battery-.
 * Это чистые данные + чистая функция проверки — Circuit/Task Engine не
 * затрагиваются, только читают уже существующий Connection[].
 */
export interface TutorialStep {
  id: string;
  title: string;
  instruction: string;
  from: string;
  to: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: "step-1", title: "Шаг 1", instruction: "Соедините плюс батареи с переключателем.", from: "battery_pos", to: "switch_a" },
  { id: "step-2", title: "Шаг 2", instruction: "Соедините переключатель с лампой.", from: "switch_b", to: "bulb_a" },
  { id: "step-3", title: "Шаг 3", instruction: "Соедините лампу с резистором.", from: "bulb_b", to: "resistor_a" },
  { id: "step-4", title: "Шаг 4", instruction: "Соедините резистор с минусом батареи.", from: "resistor_b", to: "battery_neg" },
];

export const TUTORIAL_FINAL_INSTRUCTION = "Замкните переключатель — лампа должна загореться.";

export function isPairConnected(connections: Connection[], a: string, b: string): boolean {
  return connections.some(
    (c) => (c.terminals[0] === a && c.terminals[1] === b) || (c.terminals[0] === b && c.terminals[1] === a)
  );
}
