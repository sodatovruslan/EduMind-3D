import type { CircuitComponent } from "@/lib/circuit-engine";

export const BULB_RATED_POWER_W = 18;

export const ELECTRICITY_INITIAL_COMPONENTS: CircuitComponent[] = [
  { id: "battery", kind: "battery", terminals: ["battery_pos", "battery_neg"], voltageV: 12 },
  { id: "resistor", kind: "resistor", terminals: ["resistor_a", "resistor_b"], resistanceOhm: 4 },
  { id: "bulb", kind: "bulb", terminals: ["bulb_a", "bulb_b"], resistanceOhm: 2, ratedPowerW: BULB_RATED_POWER_W },
  { id: "switch", kind: "switch", terminals: ["switch_a", "switch_b"], isClosed: true },
  { id: "ammeter", kind: "ammeter", terminals: ["ammeter_a", "ammeter_b"] },
  { id: "fuse", kind: "fuse", terminals: ["fuse_a", "fuse_b"], ratedCurrentA: 5, isBlown: false },
  { id: "voltmeter", kind: "voltmeter", terminals: ["voltmeter_a", "voltmeter_b"] },
  { id: "multimeter", kind: "voltmeter", terminals: ["multimeter_red", "multimeter_black"], meterMode: "voltage", position: [3.25, 0.9, 0.85] },
  ...([10, 47, 100, 220, 470, 1000] as const).map((resistanceOhm, index) => {
    const suffix = resistanceOhm === 1000 ? "1k" : String(resistanceOhm);
    return { id: `resistor_${suffix}`, kind: "resistor" as const, terminals: [`resistor_${suffix}_a`, `resistor_${suffix}_b`] as [string, string], resistanceOhm, position: [-3.5 + index * 1.15, 0.28, -1.35] as [number, number, number] };
  }),
];

export function mergeElectricityInventory(saved: CircuitComponent[]): CircuitComponent[] {
  const savedById = new Map(saved.map((component) => [component.id, component]));
  const current = ELECTRICITY_INITIAL_COMPONENTS.map((component) => savedById.get(component.id) ?? component);
  const knownIds = new Set(current.map((component) => component.id));
  return [...current, ...saved.filter((component) => !knownIds.has(component.id))];
}
