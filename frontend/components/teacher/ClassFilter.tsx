"use client";

import useSWR from "swr";
import { listClasses } from "@/lib/classes-client";
import { useLocale } from "@/lib/locale-context";

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
    <label className="block max-w-md text-ds-caption text-text-secondary">
      <span className="mb-1.5 block uppercase tracking-widest">{t.teacher.classFilter.label}</span>
      <select
        value={value ?? ""}
        disabled={isLoading}
        onChange={(event) => onChange(event.target.value || null)}
        data-testid="teacher-class-filter"
        className="ds-input ds-focus-ring w-full rounded-ds-control px-3 py-2 text-ds-body"
      >
        <option value="">{t.teacher.classFilter.all}</option>
        {classrooms?.map((classroom) => (
          <option key={classroom.id} value={classroom.id}>
            {classroom.name}{classroom.status === "archived" ? ` · ${t.teacher.classes.archived}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
