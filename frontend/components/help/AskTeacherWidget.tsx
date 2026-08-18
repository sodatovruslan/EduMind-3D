"use client";

import { useState } from "react";
import { HelpCircle, X, Send } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { useStudentHelpSession } from "@/lib/useStudentHelpSession";
import type { HelpContextSnapshot, HelpWorld } from "@/lib/help-client";
import { GlassPanel } from "@/components/design-system";

/**
 * T10 §1/§36 — the ONE "Ask Teacher" contextual-help action, shared
 * across Electricity/Chemistry/GeoWorld (brief explicitly warns against
 * scattering a button per panel). Each world scene passes its own
 * already-built `snapshot` (via lib/help/contextAdapters.ts, re-shaping
 * that world's EXISTING AI-context object) — this component owns none of
 * the domain logic, only the ask/status UI and the session lifecycle
 * (useStudentHelpSession.ts).
 *
 * §43 — the snapshot passed in is cheap to build (a handful of field
 * reads/formats over state the scene already computes for its own AI
 * Teacher chat) and is only ever SENT over the network inside `ask()`,
 * when the student actually presses Send — nothing is collected on a
 * timer or per simulation tick.
 */
export default function AskTeacherWidget({ world, snapshot }: { world: HelpWorld; snapshot: HelpContextSnapshot }) {
  const { user } = useAuth();
  const { t } = useLocale();
  const { teachers, activeRequest, isSending, ask, cancel, resolve } = useStudentHelpSession(world, user?.id);
  const [open, setOpen] = useState(false);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  if (!user || user.role !== "student") return null;

  if (activeRequest) {
    return (
      <GlassPanel className="p-3" role="status" aria-live="polite" data-testid="ask-teacher-status">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-ds-body font-medium text-text-primary">{statusLabel(activeRequest.status, t)}</p>
            <p className="truncate text-ds-caption text-text-muted">{activeRequest.teacher.full_name}</p>
          </div>
          {activeRequest.status === "pending" && (
            <button
              type="button"
              onClick={cancel}
              data-testid="ask-teacher-cancel"
              className="ds-focus-ring shrink-0 rounded-full bg-danger/10 px-3 py-1.5 text-ds-caption font-medium text-danger transition-colors hover:bg-danger/20"
            >
              {t.help.cancelRequest}
            </button>
          )}
          {activeRequest.status === "accepted" && (
            <button
              type="button"
              onClick={resolve}
              data-testid="ask-teacher-resolve"
              className="ds-focus-ring shrink-0 rounded-full bg-success/15 px-3 py-1.5 text-ds-caption font-medium text-success transition-colors hover:bg-success/25"
            >
              {t.help.resolve}
            </button>
          )}
        </div>
      </GlassPanel>
    );
  }

  if (teachers.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.help.askTeacher}
        data-testid="ask-teacher-button"
        className="ds-focus-ring flex items-center gap-2 rounded-full bg-accent/15 px-4 py-2 text-ds-body font-medium text-accent transition-colors hover:bg-accent/25"
      >
        <HelpCircle size={18} />
        {t.help.askTeacher}
      </button>

      {open && (
        <GlassPanel
          className="absolute bottom-full left-0 z-50 mb-2 w-80 max-w-[calc(100vw-2rem)] p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t.help.askTeacher}
          data-testid="ask-teacher-dialog"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-ds-body font-medium text-text-primary">{t.help.requestHelp}</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t.common.close}
              className="ds-focus-ring rounded-ds-control p-1 text-text-secondary hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </div>

          {teachers.length > 1 && !teacherId ? (
            <div className="flex flex-col gap-1.5" role="group" aria-label={t.help.chooseTeacher}>
              <p className="mb-1 text-ds-caption text-text-muted">{t.help.chooseTeacher}</p>
              {teachers.map((teacher) => (
                <button
                  key={teacher.id}
                  type="button"
                  onClick={() => setTeacherId(teacher.id)}
                  data-testid="ask-teacher-pick"
                  className="ds-focus-ring rounded-ds-control px-3 py-2 text-left text-ds-body text-text-primary transition-colors hover:bg-text-primary/5"
                >
                  {teacher.full_name}
                </button>
              ))}
            </div>
          ) : (
            <>
              <label className="mb-1 block text-ds-caption text-text-muted" htmlFor="ask-teacher-message">
                {t.help.describeProblem}
              </label>
              <textarea
                id="ask-teacher-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder={t.help.describeProblemPlaceholder}
                data-testid="ask-teacher-message"
                className="ds-focus-ring w-full resize-none rounded-ds-control border border-border/[0.12] bg-transparent p-2 text-ds-body text-text-primary placeholder:text-text-muted"
              />
              <button
                type="button"
                disabled={isSending}
                onClick={async () => {
                  const chosenTeacherId = teacherId ?? teachers[0].id;
                  await ask(chosenTeacherId, snapshot, message.trim() || undefined);
                  setOpen(false);
                  setTeacherId(null);
                  setMessage("");
                }}
                data-testid="ask-teacher-send"
                className="ds-focus-ring mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2 text-ds-body font-medium text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={16} />
                {t.help.sendRequest}
              </button>
            </>
          )}
        </GlassPanel>
      )}
    </div>
  );
}

function statusLabel(status: "pending" | "accepted" | "declined" | "resolved" | "cancelled", t: ReturnType<typeof useLocale>["t"]): string {
  switch (status) {
    case "pending":
      return t.help.requestSent;
    case "accepted":
      return t.help.teacherAccepted;
    case "declined":
      return t.help.teacherDeclined;
    case "resolved":
      return t.help.requestResolved;
    case "cancelled":
      return t.help.requestCancelled;
  }
}
