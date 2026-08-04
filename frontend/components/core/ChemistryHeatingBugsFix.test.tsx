// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import React from "react";
import { ChemistryWorkspaceProvider, useChemistryWorkspace } from "./ChemistryWorkspaceProvider";
import { ChemistryInteractionProvider } from "./ChemistryInteractionProvider";
import { observationLogger } from "@/lib/observation-logger";
import { registerHeatingSocket, getHeatingSocketByBurnerId } from "@/lib/placement-surfaces";

const dummyCallback = () => {};
const dummyGetState = () => ({});

function TestWrapper(props: { children: React.ReactNode }) {
  return (
    <ChemistryWorkspaceProvider>
      <ChemistryInteractionProvider
        onConfirmPlacement={dummyCallback}
        getInteractableState={dummyGetState}
      >
        {props.children}
      </ChemistryInteractionProvider>
    </ChemistryWorkspaceProvider>
  );
}

describe("Chemistry Heating & Burner Bugs Fix Audit Test Suite", () => {
  it("1. Burner on -> emits burner_toggled event with isOn=true", () => {
    const events: any[] = [];
    const unsubscribe = observationLogger.subscribe((e) => events.push(e));

    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: TestWrapper });

    act(() => result.current.toggleBurner("burner-1"));

    expect(result.current.state.tools.find((t) => t.id === "burner-1")?.isOn).toBe(true);
    const toggledEvent = events.find((e) => e.eventType === "burner_toggled");
    expect(toggledEvent).toBeDefined();
    expect(toggledEvent.payload).toEqual({ burnerId: "burner-1", isOn: true });

    unsubscribe();
  });

  it("2. Burner off -> emits burner_toggled event with isOn=false", () => {
    const events: any[] = [];
    const unsubscribe = observationLogger.subscribe((e) => events.push(e));

    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: TestWrapper });

    act(() => result.current.toggleBurner("burner-1")); // ON
    act(() => result.current.toggleBurner("burner-1")); // OFF

    expect(result.current.state.tools.find((t) => t.id === "burner-1")?.isOn).toBe(false);
    const offEvents = events.filter((e) => e.eventType === "burner_toggled");
    expect(offEvents).toHaveLength(2);
    expect(offEvents[1].payload).toEqual({ burnerId: "burner-1", isOn: false });

    unsubscribe();
  });

  it("3. Compatible beaker attaches to heating slot", () => {
    const events: any[] = [];
    const unsubscribe = observationLogger.subscribe((e) => events.push(e));

    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: TestWrapper });

    act(() => {
      result.current.attachToHeatingSlot("beaker-1", "burner-1", [2.6, 1.4], 0.65);
    });

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1");
    expect(beaker?.heatingSourceId).toBe("burner-1");
    expect(beaker?.position).toEqual([2.6, 1.4]);
    expect(beaker?.elevation).toBe(0.65);

    const attachEvent = events.find((e) => e.eventType === "heating_attached");
    expect(attachEvent).toBeDefined();
    expect(attachEvent.payload).toEqual({ containerId: "beaker-1", burnerId: "burner-1" });

    unsubscribe();
  });

  it("4. Pickup from burner detaches heatingSourceId and fires heating_detached", () => {
    const events: any[] = [];
    const unsubscribe = observationLogger.subscribe((e) => events.push(e));

    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: TestWrapper });

    act(() => {
      result.current.attachToHeatingSlot("beaker-1", "burner-1", [2.6, 1.4], 0.65);
    });

    act(() => {
      result.current.detachFromHeatingSlot("beaker-1");
    });

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1");
    expect(beaker?.heatingSourceId).toBeNull();

    const detachEvent = events.find((e) => e.eventType === "heating_detached");
    expect(detachEvent).toBeDefined();
    expect(detachEvent.payload).toEqual({ containerId: "beaker-1", burnerId: "burner-1" });

    unsubscribe();
  });

  it("5. Placement on table clears heatingSourceId", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: TestWrapper });

    act(() => {
      result.current.attachToHeatingSlot("beaker-1", "burner-1", [2.6, 1.4], 0.65);
    });

    act(() => {
      result.current.detachFromHeatingSlot("beaker-1");
      result.current.setItemTransform("beaker-1", [0, 0], 0, { elevation: 0.05, storageSlotId: null });
    });

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1");
    expect(beaker?.heatingSourceId).toBeNull();
    expect(beaker?.position).toEqual([0, 0]);
  });

  it("6. Temperature rises only while attachment is valid and burner is on", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: TestWrapper });

    // Turn burner on
    act(() => result.current.toggleBurner("burner-1"));

    // Container NOT attached -> HEAT_TICK does nothing
    const initialTemp = result.current.state.containers.find((c) => c.id === "beaker-1")!.data.temperatureC;
    act(() => result.current.heatTick(10));
    const unattachedTemp = result.current.state.containers.find((c) => c.id === "beaker-1")!.data.temperatureC;
    expect(unattachedTemp).toBe(initialTemp);

    // Attach container -> HEAT_TICK heats container
    act(() => result.current.attachToHeatingSlot("beaker-1", "burner-1", [2.6, 1.4], 0.65));
    act(() => result.current.heatTick(10));
    const heatedTemp = result.current.state.containers.find((c) => c.id === "beaker-1")!.data.temperatureC;
    expect(heatedTemp).toBeGreaterThan(initialTemp);
  });

  it("7. Temperature stops rising immediately after detach", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: TestWrapper });

    act(() => result.current.toggleBurner("burner-1"));
    act(() => result.current.attachToHeatingSlot("beaker-1", "burner-1", [2.6, 1.4], 0.65));
    act(() => result.current.heatTick(10));

    const tempAfterHeat = result.current.state.containers.find((c) => c.id === "beaker-1")!.data.temperatureC;

    // Detach container
    act(() => result.current.detachFromHeatingSlot("beaker-1"));

    // Tick again
    act(() => result.current.heatTick(10));
    const tempAfterDetach = result.current.state.containers.find((c) => c.id === "beaker-1")!.data.temperatureC;
    expect(tempAfterDetach).toBe(tempAfterHeat);
  });

  it("8. Held container does not heat even if burner is on and position is near burner", () => {
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: TestWrapper });

    act(() => result.current.toggleBurner("burner-1"));
    act(() => result.current.attachToHeatingSlot("beaker-1", "burner-1", [2.6, 1.4], 0.65));

    const tempBefore = result.current.state.containers.find((c) => c.id === "beaker-1")!.data.temperatureC;

    // Simulate heldId = "beaker-1"
    act(() => result.current.heatTick(10, "beaker-1"));

    const tempAfter = result.current.state.containers.find((c) => c.id === "beaker-1")!.data.temperatureC;
    expect(tempAfter).toBe(tempBefore);
  });

  it("9. Exactly one attach event per attachment action", () => {
    const events: any[] = [];
    const unsubscribe = observationLogger.subscribe((e) => events.push(e));

    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: TestWrapper });

    act(() => result.current.attachToHeatingSlot("beaker-1", "burner-1", [2.6, 1.4], 0.65));

    const attachEvents = events.filter((e) => e.eventType === "heating_attached");
    expect(attachEvents).toHaveLength(1);

    unsubscribe();
  });

  it("10. Exactly one detach event per detachment action", () => {
    const events: any[] = [];
    const unsubscribe = observationLogger.subscribe((e) => events.push(e));

    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: TestWrapper });

    act(() => result.current.attachToHeatingSlot("beaker-1", "burner-1", [2.6, 1.4], 0.65));
    act(() => result.current.detachFromHeatingSlot("beaker-1"));

    const detachEvents = events.filter((e) => e.eventType === "heating_detached");
    expect(detachEvents).toHaveLength(1);

    unsubscribe();
  });

  it("11. Dynamic heating socket moves with burner/stand and updates snap zone", () => {
    registerHeatingSocket({
      id: "heating-socket-burner-1",
      burnerId: "burner-1",
      position: [2.6, 1.4],
      elevation: 0.65,
      radius: 0.60,
      allowedKinds: ["beaker", "flask", "test_tube"],
      occupiedBy: null,
      updatedAt: Date.now(),
    });

    const socketBefore = getHeatingSocketByBurnerId("burner-1");
    expect(socketBefore?.position).toEqual([2.6, 1.4]);

    // Move burner/stand dynamically to new position [-1.5, 0.5]
    registerHeatingSocket({
      id: "heating-socket-burner-1",
      burnerId: "burner-1",
      position: [-1.5, 0.5],
      elevation: 0.65,
      radius: 0.60,
      allowedKinds: ["beaker", "flask", "test_tube"],
      occupiedBy: null,
      updatedAt: Date.now(),
    });

    const socketAfter = getHeatingSocketByBurnerId("burner-1");
    expect(socketAfter?.position).toEqual([-1.5, 0.5]);

    // Verify old position is no longer a heating zone
    const distToOld = Math.hypot(2.6 - socketAfter!.position[0], 1.4 - socketAfter!.position[1]);
    expect(distToOld).toBeGreaterThan(0.60);

    // Verify snap point happens at new position
    const { result } = renderHook(() => useChemistryWorkspace(), { wrapper: TestWrapper });
    act(() => {
      result.current.attachToHeatingSlot("beaker-1", "burner-1", socketAfter!.position, socketAfter!.elevation);
    });

    const beaker = result.current.state.containers.find((c) => c.id === "beaker-1");
    expect(beaker?.heatingSourceId).toBe("burner-1");
    expect(beaker?.position).toEqual([-1.5, 0.5]);
  });
});
