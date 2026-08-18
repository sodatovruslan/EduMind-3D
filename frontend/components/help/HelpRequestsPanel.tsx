"use client";

import { useState } from "react";
import { HelpCircle, Phone, MessageCircle, Check, X, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useLocale } from "@/lib/locale-context";
import { useTeacherHelpRequests } from "@/lib/useTeacherHelpRequests";
import type { HelpRequest, HelpWorld } from "@/lib/help-client";
import { GlassPanel } from "@/components/design-system";

/**
 * T10 §13/§14/§35 — the Teacher Dashboard's minimal "Help Requests (N)"
 * indicator + request list. Not a redesign of the Dashboard (brief §35 —
 * Design V2 frozen): one compact panel, existing tokens only. "Call
 * student"/"Message" both open the EXISTING Messages conversation view
 * (brief §17/§21/§24) rather than inventing a parallel call/chat surface
 * here.
 */
export default function HelpRequestsPanel() {
  const { t } = useLocale();
  const { requests, pendingCount, accept, decline, resolve } = useTeacherHelpRequests();

  const visible = requests.filter((r) => r.status === "pending" || r.status === "accepted");
  if (visible.length === 0 && pendingCount === 0) return null;

  return (
    <GlassPanel className="p-4" data-testid="help-requests-panel">
      <div className="mb-3 flex items-center gap-2">
        <HelpCircle size={18} className="text-accent" aria-hidden="true" />
        <h2 className="text-ds-body font-medium text-text-primary">
          {t.help.helpRequestsHeading} {pendingCount > 0 && <span data-testid="help-requests-count">({pendingCount})</span>}
        </h2>
      </div>
      <div className="flex flex-col gap-3">
        {visible.map((request) => (
          <HelpRequestCard key={request.id} request={request} onAccept={accept} onDecline={decline} onResolve={resolve} />
        ))}
      </div>
    </GlassPanel>
  );
}

function HelpRequestCard({
  request,
  onAccept,
  onDecline,
  onResolve,
}: {
  request: HelpRequest;
  onAccept: (id: string) => Promise<HelpRequest>;
  onDecline: (id: string) => Promise<HelpRequest>;
  onResolve: (id: string) => Promise<HelpRequest>;
}) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const snapshot = request.context_snapshot;

  return (
    <div className="rounded-ds-control border border-border/[0.1] p-3" data-testid="help-request-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-ds-body font-medium text-text-primary">{request.student.full_name}</p>
          <p className="truncate text-ds-caption text-text-muted">
            {worldLabel(request.world, t)}
            {snapshot.task_title ? ` · ${snapshot.task_title}` : ""}
          </p>
          {request.student_message && (
            <p className="mt-1 text-ds-body text-text-secondary">&ldquo;{request.student_message}&rdquo;</p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-ds-caption font-medium text-accent"
          data-testid="help-request-status"
        >
          {request.status === "pending" ? t.help.statusPending : t.help.statusAccepted}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        data-testid="help-request-toggle-context"
        className="ds-focus-ring mt-2 text-ds-caption font-medium text-accent hover:underline"
      >
        {expanded ? t.help.hideContext : t.help.openContext}
      </button>
      {expanded && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 rounded-ds-control bg-text-primary/[0.03] p-2 text-ds-caption" data-testid="help-request-context">
          {snapshot.current_step && <ContextRow label={t.help.contextStep} value={snapshot.current_step} />}
          {snapshot.selected_object && <ContextRow label={t.help.contextSelected} value={snapshot.selected_object} />}
          {snapshot.safety_state && <ContextRow label={t.help.contextSafety} value={snapshot.safety_state} />}
          {snapshot.progress !== null && snapshot.progress !== undefined && (
            <ContextRow label={t.help.contextProgress} value={`${snapshot.progress}%`} />
          )}
          {Object.entries(snapshot.measurements ?? {}).map(([key, value]) => (
            <ContextRow key={key} label={key} value={value} />
          ))}
          {Object.entries(snapshot.extra ?? {}).map(([key, value]) => (
            <ContextRow key={key} label={key} value={value} />
          ))}
        </dl>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {request.status === "pending" && (
          <>
            <button
              type="button"
              onClick={() => onAccept(request.id)}
              data-testid="help-request-accept"
              className="ds-focus-ring flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-ds-caption font-medium text-success transition-colors hover:bg-success/25"
            >
              <Check size={14} /> {t.help.accept}
            </button>
            <button
              type="button"
              onClick={() => onDecline(request.id)}
              data-testid="help-request-decline"
              className="ds-focus-ring flex items-center gap-1.5 rounded-full bg-danger/10 px-3 py-1.5 text-ds-caption font-medium text-danger transition-colors hover:bg-danger/20"
            >
              <X size={14} /> {t.help.decline}
            </button>
          </>
        )}
        {request.status === "accepted" && (
          <>
            <Link
              href={`/messages?conversation=${request.conversation_id}`}
              data-testid="help-request-call"
              className="ds-focus-ring flex items-center gap-1.5 rounded-full bg-accent/15 px-3 py-1.5 text-ds-caption font-medium text-accent transition-colors hover:bg-accent/25"
            >
              <Phone size={14} /> {t.help.callStudent}
            </Link>
            <button
              type="button"
              onClick={() => onResolve(request.id)}
              data-testid="help-request-resolve"
              className="ds-focus-ring flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-ds-caption font-medium text-success transition-colors hover:bg-success/25"
            >
              <CheckCheck size={14} /> {t.help.resolve}
            </button>
          </>
        )}
        <Link
          href={`/messages?conversation=${request.conversation_id}`}
          data-testid="help-request-message"
          className="ds-focus-ring flex items-center gap-1.5 rounded-full bg-text-primary/5 px-3 py-1.5 text-ds-caption font-medium text-text-primary transition-colors hover:bg-text-primary/10"
        >
          <MessageCircle size={14} /> {t.help.messageStudent}
        </Link>
      </div>
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="contents">
      <dt className="truncate text-text-muted">{label}</dt>
      <dd className="truncate text-text-primary">{value}</dd>
    </div>
  );
}

function worldLabel(world: HelpWorld, t: ReturnType<typeof useLocale>["t"]): string {
  switch (world) {
    case "electricity":
      return t.help.worldElectricity;
    case "chemistry":
      return t.help.worldChemistry;
    case "geo":
      return t.help.worldGeo;
  }
}
