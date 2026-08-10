"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Plus, Users } from "lucide-react";
import Button from "@/components/design-system/Button";
import Surface from "@/components/design-system/Surface";
import Loader from "@/components/ui/Loader";
import { createClassroom, listClasses } from "@/lib/classes-client";
import { useLocale } from "@/lib/locale-context";

export default function ClassesList() {
  const { t, locale } = useLocale();
  const copy = t.teacher.classes;
  const { data: classrooms, error, isLoading, mutate } = useSWR("teacher-classes", listClasses);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setFormError(copy.validationName);
      return;
    }
    setSubmitting(true);
    setFormError("");
    try {
      await createClassroom(trimmed);
      setName("");
      await mutate();
    } catch {
      setFormError(copy.actionError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-ds-display text-text-primary">{copy.title}</h1>
        <p className="mt-1 text-ds-body text-text-secondary">{copy.subtitle}</p>
      </header>

      <Surface elevated className="p-4 sm:p-5">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-ds-body text-text-secondary">
            {copy.className}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={255}
              className="ds-focus-ring mt-1 w-full rounded-ds-control border border-border/10 bg-background px-3 py-2 text-text-primary"
              placeholder={copy.classNamePlaceholder}
            />
          </label>
          <Button type="submit" disabled={submitting}>
            <Plus size={18} /> {copy.create}
          </Button>
        </form>
        {formError && <p role="alert" className="mt-2 text-ds-caption text-danger">{formError}</p>}
      </Surface>

      {isLoading && <Loader />}
      {error && <Surface className="p-5 text-danger">{copy.loadError}</Surface>}
      {!isLoading && !error && classrooms?.length === 0 && (
        <Surface className="p-8 text-center text-text-muted">{copy.empty}</Surface>
      )}
      {classrooms && classrooms.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classrooms.map((classroom) => (
            <Link key={classroom.id} href={`/teacher/classes/${classroom.id}`} className="ds-focus-ring rounded-ds-panel">
              <Surface elevated className="h-full p-5 transition-colors hover:border-accent/30">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="min-w-0 break-words text-ds-title text-text-primary">{classroom.name}</h2>
                  <span className={`shrink-0 rounded-full px-2 py-1 text-ds-caption ${classroom.status === "active" ? "bg-success/10 text-success" : "bg-text-muted/10 text-text-muted"}`}>
                    {classroom.status === "active" ? copy.active : copy.archived}
                  </span>
                </div>
                <p className="mt-4 flex items-center gap-2 text-ds-body text-text-secondary">
                  <Users size={17} /> {copy.memberCount.replace("{count}", String(classroom.student_count))}
                </p>
                <p className="mt-2 text-ds-caption text-text-muted">
                  {copy.updated} {new Date(classroom.updated_at).toLocaleDateString(locale)}
                </p>
              </Surface>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
