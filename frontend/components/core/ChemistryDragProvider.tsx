"use client";

import { createContext, useContext, useEffect, useState } from "react";

/**
 * Chemistry World — эфемерное состояние перетаскивания оборудования,
 * намеренно отделено от ChemistryWorkspaceProvider (данные лаборатории),
 * тот же принцип разделения, что и WireDragProvider/ExperimentStateProvider
 * в Electricity Lab: interaction state отдельно от domain state.
 */
interface ChemistryDragContextValue {
  draggingId: string | null;
  startDrag: (id: string) => void;
  stopDrag: () => void;
}

const ChemistryDragContext = createContext<ChemistryDragContextValue | undefined>(undefined);

export function ChemistryDragProvider({ children }: { children: React.ReactNode }) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // если ученик отпустил кнопку мыши вне канваса, драг все равно должен
  // корректно завершиться (та же защита, что и в WireDragProvider)
  useEffect(() => {
    function handleGlobalPointerUp() {
      setDraggingId(null);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (typeof document !== "undefined" && document.fullscreenElement) return;
        setDraggingId(null);
      }
    }
    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const value: ChemistryDragContextValue = {
    draggingId,
    startDrag: (id: string) => setDraggingId(id),
    stopDrag: () => setDraggingId(null),
  };

  return <ChemistryDragContext.Provider value={value}>{children}</ChemistryDragContext.Provider>;
}

export function useChemistryDrag(): ChemistryDragContextValue {
  const ctx = useContext(ChemistryDragContext);
  if (!ctx) throw new Error("useChemistryDrag должен использоваться внутри <ChemistryDragProvider>");
  return ctx;
}
