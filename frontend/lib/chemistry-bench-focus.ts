import type { Container } from "./chemistry-engine";

/**
 * Chemistry World — "focused bench". The lab state holds far more equipment
 * than the three student tasks need (8 vessels, 10 tools, 23 reagents). While
 * the focus is on, the table shows only what those tasks use, and the scene
 * points at the next thing to pick up. Nothing is removed from the state:
 * saves, the engines and the hidden guided labs keep working, and turning
 * the flag off brings the full table back.
 */
export const BENCH_FOCUS_ENABLED: boolean = true;

// two beakers (one for the salt solution, a clean one for boiling), the
// burner with its stand, and the three reagents the tasks ask for
const FOCUSED_TABLE_ITEM_IDS = new Set([
  "beaker-1",
  "beaker-2",
  "burner-1",
  "stand-1",
  "stock-water",
  "stock-nacl",
  "stock-agno3",
]);

/** Whether an item is shown and usable. Items stored inside cabinets always are. */
export function isOnBench(item: { id: string; storageSlotId?: string | null }): boolean {
  if (!BENCH_FOCUS_ENABLED) return true;
  return FOCUSED_TABLE_ITEM_IDS.has(item.id) || (item.storageSlotId ?? null) !== null;
}

function gramsOf(list: { substanceId: string; grams: number }[], substanceId: string): number {
  return list.find((c) => c.substanceId === substanceId)?.grams ?? 0;
}

const has = (container: Container, substanceId: string) =>
  gramsOf(container.contents, substanceId) > 0 || gramsOf(container.precipitate, substanceId) > 0;

export interface BenchHintInput {
  experimentId: string;
  /** The active vessel — the one the current task checks. */
  container: Container;
  burnerOn: boolean;
  /** The active vessel is standing on the burner. */
  isOnBurner: boolean;
}

/**
 * Id of the item the student should use next for the current task (a stock
 * bottle or the burner), or null when nothing is left to point at. Reads the
 * vessel's real contents — it does not track "steps".
 */
export function nextBenchHint({ experimentId, container, burnerOn, isOnBurner }: BenchHintInput): string | null {
  switch (experimentId) {
    case "experiment-1-dissolve-salt":
      if (!has(container, "water")) return "stock-water";
      if (!has(container, "nacl")) return "stock-nacl";
      return null;
    case "experiment-3-precipitation":
      if (has(container, "agcl")) return null;
      if (!has(container, "water")) return "stock-water";
      if (!has(container, "nacl")) return "stock-nacl";
      if (!has(container, "agno3")) return "stock-agno3";
      return null;
    case "experiment-4-heat-water":
      if (!has(container, "water")) return "stock-water";
      if (!isOnBurner || !burnerOn) return "burner-1";
      return null;
    default:
      return null;
  }
}
