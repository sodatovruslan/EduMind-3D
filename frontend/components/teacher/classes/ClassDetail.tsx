"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, Archive, RotateCcw, Search, UserMinus, UserPlus } from "lucide-react";
import Button from "@/components/design-system/Button";
import Surface from "@/components/design-system/Surface";
import Skeleton from "@/components/design-system/Skeleton";
import {
  addClassStudent,
  getClassroom,
  listClassStudents,
  removeClassStudent,
  searchAvailableStudents,
  updateClassroom,
} from "@/lib/classes-client";
import { useLocale } from "@/lib/locale-context";
import { INTL_LOCALE_TAG } from "@/lib/i18n/locales";

export default function ClassDetail({ classroomId }: { classroomId: string }) {
  const { t, locale } = useLocale();
  const copy = t.teacher.classes;
  const { data: classroom, error, isLoading, mutate: mutateClass } = useSWR(`class-${classroomId}`, () => getClassroom(classroomId));
  const { data: students, error: studentsError, isLoading: studentsLoading, mutate: mutateStudents } = useSWR(`class-${classroomId}-students`, () => listClassStudents(classroomId));
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (classroom) setName(classroom.name);
  }, [classroom]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const canSearch = classroom?.status === "active" && debouncedQuery.length >= 2;
  const { data: candidates, error: candidatesError, isLoading: candidatesLoading, mutate: mutateCandidates } = useSWR(
    canSearch ? `class-${classroomId}-available-${debouncedQuery}` : null,
    () => searchAvailableStudents(classroomId, debouncedQuery)
  );

  async function rename(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setActionError(copy.validationName);
      return;
    }
    try {
      await updateClassroom(classroomId, { name: name.trim() });
      setActionError("");
      await mutateClass();
    } catch {
      setActionError(copy.actionError);
    }
  }

  async function archive() {
    if (!window.confirm(copy.archiveConfirm)) return;
    try {
      await updateClassroom(classroomId, { status: "archived" });
      setActionError("");
      await mutateClass();
    } catch {
      setActionError(copy.actionError);
    }
  }

  async function restore() {
    try {
      await updateClassroom(classroomId, { status: "active" });
      setActionError("");
      await mutateClass();
    } catch {
      setActionError(copy.actionError);
    }
  }

  async function add(studentId: string) {
    try {
      await addClassStudent(classroomId, studentId);
      setActionError("");
      await Promise.all([mutateClass(), mutateStudents(), mutateCandidates()]);
    } catch {
      setActionError(copy.actionError);
    }
  }

  async function remove(studentId: string) {
    if (!window.confirm(copy.removeConfirm)) return;
    try {
      await removeClassStudent(classroomId, studentId);
      setActionError("");
      await Promise.all([mutateClass(), mutateStudents(), mutateCandidates()]);
    } catch {
      setActionError(copy.actionError);
    }
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <Link href="/teacher/classes" className="ds-focus-ring inline-flex items-center gap-2 rounded-ds-control text-ds-body text-text-secondary hover:text-text-primary">
          <ArrowLeft size={18} /> {copy.back}
        </Link>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !classroom) return <Surface className="mx-auto max-w-5xl p-6 text-danger">{copy.notFound}</Surface>;
  const archived = classroom.status === "archived";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/teacher/classes" className="ds-focus-ring inline-flex items-center gap-2 rounded-ds-control text-ds-body text-text-secondary hover:text-text-primary">
        <ArrowLeft size={18} /> {copy.back}
      </Link>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="break-words text-ds-display text-text-primary">{classroom.name}</h1>
            <span className={`rounded-full px-2 py-1 text-ds-caption ${archived ? "bg-text-muted/10 text-text-muted" : "bg-success/10 text-success"}`}>
              {archived ? copy.archived : copy.active}
            </span>
          </div>
          <p className="mt-2 text-ds-body text-text-secondary">{copy.memberCount.replace("{count}", String(classroom.student_count))}</p>
        </div>
        {archived
          ? <Button variant="secondary" onClick={restore}><RotateCcw size={18} /> {copy.restore}</Button>
          : <Button variant="secondary" onClick={archive}><Archive size={18} /> {copy.archive}</Button>}
      </header>

      {archived && <div className="rounded-ds-panel border border-warning/30 bg-warning/5 p-4 text-warning">{copy.archivedMessage}</div>}
      {actionError && <p role="alert" className="text-ds-body text-danger">{actionError}</p>}

      <Surface elevated className="p-4 sm:p-5">
        <form onSubmit={rename} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-ds-body text-text-secondary">
            {copy.className}
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={255} className="ds-input ds-focus-ring mt-1 w-full" />
          </label>
          <Button type="submit" variant="secondary">{copy.rename}</Button>
        </form>
      </Surface>

      {!archived && (
        <Surface elevated className="p-4 sm:p-5">
          <h2 className="text-ds-title text-text-primary">{copy.addStudent}</h2>
          <label className="relative mt-3 block">
            <span className="sr-only">{copy.search}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="ds-input ds-focus-ring w-full rounded-full py-2 pl-9 pr-3" placeholder={copy.searchPlaceholder} />
          </label>
          {query.trim().length === 1 && <p className="mt-2 text-ds-caption text-text-muted">{copy.searchHint}</p>}
          {canSearch && candidatesLoading && <p className="mt-3 text-ds-body text-text-muted">{copy.searching}</p>}
          {canSearch && candidatesError && <p role="alert" className="mt-3 text-ds-body text-danger">{copy.searchError}</p>}
          {canSearch && candidates?.length === 0 && <p className="mt-3 text-ds-body text-text-muted">{copy.noCandidates}</p>}
          {candidates && candidates.length > 0 && (
            <ul className="mt-3 divide-y divide-border/[0.08]">
              {candidates.map((student) => (
                <li key={student.id} className="flex min-w-0 items-center justify-between gap-3 py-3">
                  <div className="min-w-0"><p className="truncate text-ds-body font-medium text-text-primary">{student.full_name}</p><p className="truncate text-ds-caption text-text-muted">{student.email}</p></div>
                  <Button variant="secondary" onClick={() => add(student.id)}><UserPlus size={17} /> {copy.add}</Button>
                </li>
              ))}
            </ul>
          )}
        </Surface>
      )}

      <Surface elevated className="overflow-hidden">
        <div className="border-b border-border/[0.08] p-4 sm:p-5"><h2 className="text-ds-title text-text-primary">{copy.students}</h2></div>
        {studentsLoading && <div className="p-4 sm:p-5"><Skeleton className="h-24 w-full" /></div>}
        {studentsError && <p role="alert" className="p-6 text-center text-ds-body text-danger">{copy.studentsLoadError}</p>}
        {students?.length === 0 && <p className="p-6 text-center text-ds-body text-text-muted">{copy.noMembers}</p>}
        <ul className="divide-y divide-border/[0.08]">
          {students?.map((student) => (
            <li key={student.id} className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div className="min-w-0">
                <p className="break-words text-ds-body font-medium text-text-primary">{student.full_name}</p>
                <p className="break-all text-ds-caption text-text-muted">{student.email}</p>
                <p className="mt-1 text-ds-caption text-text-muted">{copy.joined} {new Date(student.membership.joined_at).toLocaleDateString(INTL_LOCALE_TAG[locale])}</p>
              </div>
              {!archived && <Button variant="ghost" className="self-start text-danger sm:self-auto" onClick={() => remove(student.id)}><UserMinus size={17} /> {copy.remove}</Button>}
            </li>
          ))}
        </ul>
      </Surface>
    </div>
  );
}
