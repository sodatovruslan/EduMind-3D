import type { Connection } from "@/lib/circuit-engine";

/**
 * Faults the lab plants by itself for the "find the break" and "fix the
 * short" tasks, so the student has something real to look for. Pure
 * functions: they only decide WHAT to change; the scene applies it.
 */

export type PlantedFault =
  | { kind: "remove"; connectionId: string }
  | { kind: "add"; connection: Connection };

const isVoltmeterWire = (c: Connection) => c.terminals.some((t) => t.startsWith("voltmeter_"));

/** Break: remove one wire of the main loop (never a voltmeter lead — that would not break anything). */
export function planBreak(connections: Connection[], random: () => number = Math.random): PlantedFault | null {
  const loopWires = connections.filter((c) => !isVoltmeterWire(c));
  if (loopWires.length === 0) return null;
  const pick = loopWires[Math.floor(random() * loopWires.length) % loopWires.length];
  return { kind: "remove", connectionId: pick.id };
}

/** Terminals joined to `start` by wires only (one electrical node). */
function nodeOf(start: string, connections: Connection[]): Set<string> {
  const node = new Set([start]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of connections) {
      const [a, b] = c.terminals;
      if (node.has(a) && !node.has(b)) {
        node.add(b);
        grew = true;
      } else if (node.has(b) && !node.has(a)) {
        node.add(a);
        grew = true;
      }
    }
  }
  return node;
}

/**
 * Short: an extra jumper between the battery's "+" node and its "−" node, so
 * current bypasses every load. Uses terminals away from the battery when
 * possible (e.g. switch ↔ resistor), so the student has to trace the wires.
 */
export function planShort(connections: Connection[], now: number = Date.now()): PlantedFault {
  const pickAwayFromBattery = (node: Set<string>, fallback: string) =>
    Array.from(node).find((t) => !t.startsWith("battery_") && !t.startsWith("voltmeter_")) ?? fallback;
  const from = pickAwayFromBattery(nodeOf("battery_pos", connections), "battery_pos");
  const to = pickAwayFromBattery(nodeOf("battery_neg", connections), "battery_neg");
  return { kind: "add", connection: { id: `fault-short-${now}`, terminals: [from, to] } };
}
