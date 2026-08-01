/**
 * Interaction Core — Stage S-1: реестр возможностей (capability) предметов,
 * которые можно фокусировать/брать в виртуальную руку. Ключ реестра — id
 * конкретного экземпляра (ContainerItem.id / StockBottle.id / ToolItem.id),
 * не kind — у разных экземпляров одного kind подпись/hand-offset могут
 * отличаться (например у разных бутылок разное вещество в подписи).
 *
 * Список сейчас — временный proof-of-concept для Stage S-1 (стакан, колба,
 * бутылка воды). Растет по мере миграции новых предметов на Interaction Core
 * (пробирки, пипетки, термометры, крышки, инструменты, позже — объекты
 * Electricity Lab) и никогда не должен уменьшаться тем же путем, каким рос.
 *
 * Модуль-агностичный (lib/, не components/core/) — чистые данные и типы,
 * без React/Three.js зависимостей, чтобы другие модули могли переиспользовать
 * ту же форму конфигурации без переписывания.
 */
export interface InteractableConfig {
  displayName: string;
  canBeHeld: boolean;
  // локальное смещение точки "руки" в системе координат камеры
  // (X: право/лево, Y: верх/низ, Z: вперед — отрицательный, как принято в Three.js)
  handOffset: [number, number, number];
  // базовый поворот предмета в руке (эйлеровы углы, радианы) поверх ориентации камеры
  handRotation: [number, number, number];
  // радиус хитбокса для наведения/фокуса
  interactionRadius: number;
}

export const INTERACTABLE_REGISTRY: Record<string, InteractableConfig> = {
  "beaker-1": {
    displayName: "Стакан",
    canBeHeld: true,
    handOffset: [0.32, -0.24, -0.6],
    handRotation: [0, 0, 0],
    interactionRadius: 0.34,
  },
  "flask-1": {
    displayName: "Колба",
    canBeHeld: true,
    handOffset: [0.32, -0.24, -0.6],
    handRotation: [0, 0, 0],
    interactionRadius: 0.34,
  },
  "stock-water": {
    displayName: "Бутылка: Вода",
    canBeHeld: true,
    handOffset: [0.3, -0.27, -0.55],
    handRotation: [0, 0, 0],
    interactionRadius: 0.25,
  },
};

export function getInteractable(id: string): InteractableConfig | null {
  return INTERACTABLE_REGISTRY[id] ?? null;
}
