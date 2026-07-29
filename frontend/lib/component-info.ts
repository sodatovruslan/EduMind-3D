/**
 * Guided Onboarding — статичные метаданные для тултипов. Чистые данные,
 * никак не связаны с Physics/Circuit Engine — только подписи для UI.
 */
export interface ComponentInfo {
  emoji: string;
  name: string;
  description: string;
}

export const COMPONENT_INFO: Record<string, ComponentInfo> = {
  battery: { emoji: "🔋", name: "Battery", description: "Источник питания — создаёт напряжение, которое приводит ток в движение." },
  resistor: { emoji: "📏", name: "Resistor", description: "Ограничивает силу тока в цепи." },
  bulb: { emoji: "💡", name: "Lamp", description: "Загорается, когда через неё течёт ток — яркость зависит от мощности." },
  switch: { emoji: "🔘", name: "Switch", description: "Замыкает или размыкает цепь." },
  ammeter: { emoji: "📟", name: "Ammeter", description: "Измеряет силу тока — подключается последовательно." },
  voltmeter: { emoji: "📟", name: "Voltmeter", description: "Измеряет напряжение — подключается параллельно." },
  fuse: { emoji: "🛡", name: "Fuse", description: "Защищает цепь — перегорает при слишком большом токе." },
};
