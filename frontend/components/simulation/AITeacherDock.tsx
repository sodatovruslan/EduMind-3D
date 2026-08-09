"use client";

import { useState } from "react";
import { Bot, X } from "lucide-react";
import { useLocale } from "@/lib/locale-context";

/**
 * D6 — collapsible floating dock for the AI Teacher chat. Wraps the
 * EXISTING `ChemistryTeacherChat`/`AITeacherChat` components unchanged
 * (passed as `children`) — this file owns positioning/collapse state only,
 * never the chat contract, context building, or backend call. Before D6
 * these were permanently mounted as an in-flow `lg:w-80` flex sibling,
 * permanently consuming ~320px of the canvas column; this makes them
 * collapsed-by-default floating chrome instead (see D6 notes in
 * EDUMIND_DESIGN_SYSTEM_V2.md for why — brief explicitly calls out "should
 * not permanently consume an absurd amount of 3D viewport").
 */
export default function AITeacherDock({ children }: { children: React.ReactNode }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="pointer-events-none fixed bottom-4 right-4 z-40">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t.simulation.aiTeacher.expand}
          className="ds-glass ds-focus-ring pointer-events-auto flex items-center gap-2 rounded-ds-panel px-4 py-3 text-ds-body font-medium text-text-primary shadow-ds-md"
        >
          <Bot size={18} className="text-accent" />
          {t.simulation.aiTeacher.trigger}
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40">
      <div className="pointer-events-auto relative w-80 max-w-[calc(100vw-2rem)]">
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label={t.simulation.aiTeacher.collapse}
          className="ds-focus-ring absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-surface-elevated text-text-primary shadow-ds-md"
        >
          <X size={14} />
        </button>
        {children}
      </div>
    </div>
  );
}
