import { describe, expect, it, beforeEach } from "vitest";
import { observationLogger } from "./observation-logger";

describe("Stage S-6 — Observation Logger Engine", () => {
  beforeEach(() => {
    observationLogger.initSession("test-session-123", "sim-demo", "task-demo");
  });

  it("1. Generates monotonic sequence and unique event IDs", () => {
    const e1 = observationLogger.appendEvent("cabinet_opened", "interaction", {
      cabinetId: "reagents-cabinet",
      cabinetName: "Шкаф с реагентами",
    });

    const e2 = observationLogger.appendEvent("item_picked_up", "interaction", {
      objectId: "stock-water",
      objectKind: "stock_water",
      fromStorageSlotId: "slot-1",
    });

    expect(e1.sequence).toBe(1);
    expect(e1.eventId).toBe("test-session-123:1");
    expect(e2.sequence).toBe(2);
    expect(e2.eventId).toBe("test-session-123:2");
    expect(observationLogger.getEvents().length).toBe(2);
  });

  it("2. Aggregates frame-by-frame pouring into start and completed events without noise", () => {
    // 3 ticks of pouring
    observationLogger.handlePourProgress("stock-water", "beaker-1", "water", 5.0, 0.2, 0.9);
    observationLogger.handlePourProgress("stock-water", "beaker-1", "water", 5.0, 0.2, 0.9);
    observationLogger.handlePourProgress("stock-water", "beaker-1", "water", 5.0, 0.2, 0.9);

    observationLogger.endPourSession("user_uprighted");

    const events = observationLogger.getEvents();
    expect(events.length).toBe(2); // pour_started + pour_completed (no 100 frame noise!)
    expect(events[0].eventType).toBe("pour_started");
    expect(events[1].eventType).toBe("pour_completed");

    if (events[1].eventType === "pour_completed") {
      expect(events[1].payload.totalTransferredGrams).toBe(15.0);
      expect(events[1].payload.stopReason).toBe("user_uprighted");
    }
  });

  it("3. Correctly logs blocked pour reasons with details", () => {
    const e = observationLogger.appendEvent("pour_blocked", "workspace", {
      sourceId: "stock-water",
      targetId: "beaker-1",
      reasonCode: "cap_closed",
      details: "Крышка бутылки закрыта",
    });

    expect(e.eventType).toBe("pour_blocked");
    if (e.eventType === "pour_blocked") {
      expect(e.payload.reasonCode).toBe("cap_closed");
    }
  });

  it("4. Safely resets session without polluting state", () => {
    observationLogger.appendEvent("cap_opened", "interaction", {
      objectId: "stock-water",
      bottleName: "Дистиллированная вода",
    });

    expect(observationLogger.getEvents().length).toBe(1);

    observationLogger.resetSession();
    expect(observationLogger.getEvents().length).toBe(0);
  });
});
