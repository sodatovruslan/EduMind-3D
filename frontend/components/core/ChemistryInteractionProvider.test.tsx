// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  ChemistryInteractionProvider,
  useChemistryInteraction,
  useInteractable,
} from "./ChemistryInteractionProvider";
import { ChemistryWorkspaceProvider, useChemistryWorkspace } from "./ChemistryWorkspaceProvider";

/**
 * Stage S-1 — Focus & Pickup Core. Проверяет саму state machine
 * (idle/focused/held) и обязательные edge-кейсы, перечисленные пользователем
 * при утверждении плана. Никаких моков — реальный провайдер, реальные
 * keyboard-события через window.dispatchEvent, тот же стиль, что уже
 * используют ChemistryWorkspace.integration.test.tsx / ChemistryDragProvider.
 */

afterEach(cleanup);

function interactionWrapper({ children }: { children: ReactNode }) {
  return <ChemistryInteractionProvider>{children}</ChemistryInteractionProvider>;
}

function dispatchKey(key: string, opts: Partial<KeyboardEventInit> = {}, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...opts }));
}

describe("ChemistryInteractionProvider — state machine (idle/focused/held)", () => {
  it("idle -> focused -> held -> idle через полный цикл setFocused/pickUp/release", () => {
    const { result } = renderHook(() => useChemistryInteraction(), { wrapper: interactionWrapper });

    expect(result.current.phase).toBe("idle");

    act(() => result.current.setFocused("beaker-1"));
    expect(result.current.phase).toBe("focused");
    expect(result.current.focusedId).toBe("beaker-1");

    act(() => result.current.pickUp("beaker-1"));
    expect(result.current.phase).toBe("held");
    expect(result.current.heldId).toBe("beaker-1");

    // release() возвращает в "focused", если курсор все еще на предмете
    // (focusedId не сбрасывался) — это ожидаемо, не баг: отпускание само по
    // себе не означает, что курсор ушел с объекта
    act(() => result.current.release());
    expect(result.current.phase).toBe("focused");
    expect(result.current.heldId).toBeNull();
    expect(result.current.heldYawOffset).toBe(0);

    // а когда курсор реально уходит — phase возвращается в idle
    act(() => result.current.clearFocused("beaker-1"));
    expect(result.current.phase).toBe("idle");
  });

  it("нельзя взять второй предмет, пока первый в руке", () => {
    const { result } = renderHook(() => useChemistryInteraction(), { wrapper: interactionWrapper });

    act(() => result.current.setFocused("beaker-1"));
    act(() => result.current.pickUp("beaker-1"));
    expect(result.current.heldId).toBe("beaker-1");

    // фокус на втором предмете не должен даже устанавливаться, пока рука занята
    act(() => result.current.setFocused("flask-1"));
    expect(result.current.focusedId).toBe("beaker-1");

    act(() => result.current.pickUp("flask-1"));
    expect(result.current.heldId).toBe("beaker-1"); // не поменялось

    act(() => result.current.release());
    // после освобождения руки фокус на другом предмете снова возможен
    act(() => result.current.setFocused("flask-1"));
    expect(result.current.focusedId).toBe("flask-1");
    act(() => result.current.pickUp("flask-1"));
    expect(result.current.heldId).toBe("flask-1");
  });

  it("Focused очищается после ухода курсора (clearFocused), но игнорирует чужой id (защита от гонки)", () => {
    const { result } = renderHook(() => useChemistryInteraction(), { wrapper: interactionWrapper });

    act(() => result.current.setFocused("beaker-1"));
    // курсор уже перешел на flask-1 до того, как долетело старое pointerOut
    // beaker-1 — clearFocused("beaker-1") не должен затереть актуальный focus
    act(() => result.current.setFocused("flask-1"));
    act(() => result.current.clearFocused("beaker-1"));
    expect(result.current.focusedId).toBe("flask-1");

    act(() => result.current.clearFocused("flask-1"));
    expect(result.current.focusedId).toBeNull();
  });

  it("предмет без capability canBeHeld не берется (pickUp — no-op)", () => {
    const { result } = renderHook(() => useChemistryInteraction(), { wrapper: interactionWrapper });

    act(() => result.current.setFocused("test-tube-1")); // не в INTERACTABLE_REGISTRY
    act(() => result.current.pickUp("test-tube-1"));
    expect(result.current.heldId).toBeNull();
    expect(result.current.phase).toBe("focused");
  });

  it("rotateHeld меняет heldYawOffset только пока предмет в руке, иначе no-op", () => {
    const { result } = renderHook(() => useChemistryInteraction(), { wrapper: interactionWrapper });

    act(() => result.current.rotateHeld(0.3));
    expect(result.current.heldYawOffset).toBe(0); // нечего вращать

    act(() => result.current.setFocused("beaker-1"));
    act(() => result.current.pickUp("beaker-1"));
    act(() => result.current.rotateHeld(0.3));
    expect(result.current.heldYawOffset).toBeCloseTo(0.3, 10);

    act(() => result.current.release());
    expect(result.current.heldYawOffset).toBe(0); // сброшен при отпускании
  });
});

describe("ChemistryInteractionProvider — клавиатура", () => {
  it("E берет сфокусированный предмет, E еще раз отпускает", () => {
    const { result } = renderHook(() => useChemistryInteraction(), { wrapper: interactionWrapper });

    act(() => result.current.setFocused("flask-1"));
    act(() => dispatchKey("e"));
    expect(result.current.heldId).toBe("flask-1");

    act(() => dispatchKey("e"));
    expect(result.current.heldId).toBeNull();
  });

  it("Escape безопасно освобождает предмет (и не падает, если рука и так пуста)", () => {
    const { result } = renderHook(() => useChemistryInteraction(), { wrapper: interactionWrapper });

    expect(() => act(() => dispatchKey("Escape"))).not.toThrow();
    expect(result.current.heldId).toBeNull();

    act(() => result.current.setFocused("beaker-1"));
    act(() => result.current.pickUp("beaker-1"));
    act(() => dispatchKey("Escape"));
    expect(result.current.heldId).toBeNull();
  });

  it("предмет нельзя взять повторным событием keydown при зажатой клавише (e.repeat игнорируется)", () => {
    const { result } = renderHook(() => useChemistryInteraction(), { wrapper: interactionWrapper });

    act(() => result.current.setFocused("beaker-1"));
    act(() => dispatchKey("e")); // реальное нажатие — берет предмет
    expect(result.current.heldId).toBe("beaker-1");

    // ОС повторяет keydown, пока клавиша зажата — repeat:true должен
    // игнорироваться целиком, иначе следующий "виртуальный" E тут же отпустил
    // бы предмет обратно без реального второго нажатия пользователя
    act(() => dispatchKey("e", { repeat: true }));
    expect(result.current.heldId).toBe("beaker-1");
  });

  it("ввод с клавиатуры не срабатывает, когда фокус на input/textarea", () => {
    const { result } = renderHook(() => useChemistryInteraction(), { wrapper: interactionWrapper });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    act(() => result.current.setFocused("beaker-1"));
    act(() => dispatchKey("e", {}, input)); // печатает "e" в чат/поле ввода
    expect(result.current.heldId).toBeNull(); // не должно взять предмет

    document.body.removeChild(input);
  });

  it("размонтирование во время Held снимает keydown-слушатель (не оставляет управление заблокированным)", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { result, unmount } = renderHook(() => useChemistryInteraction(), { wrapper: interactionWrapper });

    act(() => result.current.setFocused("beaker-1"));
    act(() => result.current.pickUp("beaker-1"));
    expect(result.current.heldId).toBe("beaker-1");

    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));

    // после размонтирования глобальные keydown-события никак не обрабатываются
    // этим (уже мертвым) экземпляром — новый keydown не должен ничего бросать
    expect(() => dispatchKey("e")).not.toThrow();
    removeSpy.mockRestore();
  });
});

describe("useInteractable — единая точка входа для компонентов сцены", () => {
  it("возвращает capability=null для предмета вне реестра — компонент должен продолжать использовать старый drag", () => {
    const { result } = renderHook(() => useInteractable("test-tube-1"), { wrapper: interactionWrapper });
    expect(result.current.capability).toBeNull();
    expect(result.current.pointerHandlers).toBeUndefined();
  });

  it("возвращает capability + pointerHandlers для зарегистрированного предмета", () => {
    const { result } = renderHook(() => useInteractable("beaker-1"), { wrapper: interactionWrapper });
    expect(result.current.capability?.canBeHeld).toBe(true);
    expect(result.current.pointerHandlers).toBeDefined();
  });
});

describe("Interaction Core не трогает домен (ChemistryWorkspaceProvider)", () => {
  function combinedWrapper({ children }: { children: ReactNode }) {
    return (
      <ChemistryWorkspaceProvider>
        <ChemistryInteractionProvider>{children}</ChemistryInteractionProvider>
      </ChemistryWorkspaceProvider>
    );
  }

  it("содержимое стакана не теряется и не меняется после pickup/rotate/release", () => {
    const { result } = renderHook(
      () => ({ workspace: useChemistryWorkspace(), interaction: useChemistryInteraction() }),
      { wrapper: combinedWrapper }
    );

    act(() => result.current.workspace.addSubstanceToContainer("beaker-1", "water", 150));
    act(() => result.current.workspace.addSubstanceToContainer("beaker-1", "nacl", 10));
    const before = result.current.workspace.state.containers.find((c) => c.id === "beaker-1")!;
    const beforePosition = before.position;
    const beforeRotationY = before.rotationY;
    const beforeData = JSON.stringify(before.data);

    act(() => result.current.interaction.setFocused("beaker-1"));
    act(() => result.current.interaction.pickUp("beaker-1"));
    act(() => result.current.interaction.rotateHeld(0.5));
    act(() => result.current.interaction.release());

    const after = result.current.workspace.state.containers.find((c) => c.id === "beaker-1")!;
    expect(after.position).toEqual(beforePosition);
    expect(after.rotationY).toBe(beforeRotationY);
    expect(JSON.stringify(after.data)).toBe(beforeData);
  });

  it("pickUp/release не диспетчит ни одно действие ChemistryWorkspaceProvider (selectedItemId не меняется)", () => {
    const { result } = renderHook(
      () => ({ workspace: useChemistryWorkspace(), interaction: useChemistryInteraction() }),
      { wrapper: combinedWrapper }
    );

    expect(result.current.workspace.state.selectedItemId).toBeNull();

    act(() => result.current.interaction.setFocused("flask-1"));
    act(() => result.current.interaction.pickUp("flask-1"));
    act(() => result.current.interaction.release());

    // Stage S-1 не вызывает select()/moveItem() — состояние воркспейса
    // не должно измениться ни на одно поле сверх того, что мы сами меняли
    // явно (тут — вообще ничего не меняли явно через workspace)
    expect(result.current.workspace.state.selectedItemId).toBeNull();
  });
});
