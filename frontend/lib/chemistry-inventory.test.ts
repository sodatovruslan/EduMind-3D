import { describe, expect, it } from "vitest";
import { REAGENT_BY_ID, REAGENT_INVENTORY } from "./chemistry-inventory";
import { SUBSTANCES } from "./chemistry-engine";
import { getRegisteredReactions } from "./reaction-engine";
import { createInitialState } from "@/components/core/ChemistryWorkspaceProvider";
import { getSlot } from "./storage-slots";
import { getInteractable } from "./interactables";

describe("C-Lab 2.0 inventory contract", () => {
  it("registers 23 unique meaningful reagents with RU/EN/TG labels", () => {
    expect(REAGENT_INVENTORY).toHaveLength(23);
    expect(new Set(REAGENT_INVENTORY.map((item) => item.id)).size).toBe(REAGENT_INVENTORY.length);
    for (const reagent of REAGENT_INVENTORY) {
      expect(REAGENT_BY_ID[reagent.id]).toBe(reagent);
      expect(reagent.names.ru).toBeTruthy();
      expect(reagent.names.en).toBeTruthy();
      expect(reagent.names.tg).toBeTruthy();
      expect(SUBSTANCES[reagent.id]?.formula).toBe(reagent.formula);
    }
  });

  it("makes every stock bottle interactive and places new stock in real cabinet slots", () => {
    const state = createInitialState();
    expect(state.stockBottles).toHaveLength(REAGENT_INVENTORY.length);
    for (const bottle of state.stockBottles) {
      expect(getInteractable(bottle.id)).not.toBeNull();
      if (bottle.storageSlotId) expect(getSlot(bottle.storageSlotId)).not.toBeNull();
    }
    expect(state.stockBottles.filter((bottle) => bottle.storageSlotId)).toHaveLength(17);
  });

  it("keeps all reaction references valid", () => {
    expect(getRegisteredReactions()).toHaveLength(12);
    for (const reaction of getRegisteredReactions()) {
      for (const participant of [...reaction.reactants, ...reaction.products]) {
        expect(SUBSTANCES[participant.substanceId], `${reaction.id}: ${participant.substanceId}`).toBeDefined();
      }
    }
  });
});
