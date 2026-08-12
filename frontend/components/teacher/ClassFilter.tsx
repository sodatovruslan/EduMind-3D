"use client";

import useSWR from "swr";
import { listClasses } from "@/lib/classes-client";
import { useLocale } from "@/lib/locale-context";
import { Surface } from "@/components/design-system";

/**
 * D9 — was a bare `<label>` sitting directly on the page background,
 * reading as a stray form control rather than a page section, and used a
 * different select shape (rectangular, `rounded-ds-control`) than
 * `StudentDirectory`'s pill filters (`rounded-full`) despite being the same
 * "filter control" pattern on the same page. Now a thin `Surface` bar with
 * the same pill-select treatment.
 */
export default function ClassFilter({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (classId: string | null) => void;
}) {
  const { t } = useLocale();
  const { data: classrooms, isLoading } = useSWR("teacher-classes", listClasses);

  return (
    <Surface className="flex flex-wrap items-center gap-3 p-3">
      <label className="flex items-center gap-2 text-ds-caption text-text-secondary">
        <span className="uppercase tracking-widest">{t.teacher.classFilter.label}</span>
        <select
          value={value ?? ""}
          disabled={isLoading}
          onChange={(event) => onChange(event.target.value || null)}
          data-testid="teacher-class-filter"
          className="ds-input ds-focus-ring rounded-full py-1.5 text-ds-caption"
        >
          <option value="">{t.teacher.classFilter.all}</option>
          {classrooms?.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classroom.name}
              {classroom.status === "archived" ? ` · ${t.teacher.classes.archived}` : ""}
            </option>
          ))}
        </select>
      </label>
    </Surface>
  );
}
