"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useLocale } from "@/lib/locale-context";

/**
 * D3 — shared password input for Login/Register: visibility toggle,
 * correct autocomplete per-field, uses .ds-input (globals.css) for
 * consistent theme + autofill-readable styling in both.
 */
export interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
}

export default function PasswordField({ label, value, onChange, autoComplete, minLength }: PasswordFieldProps) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-ds-caption font-semibold uppercase tracking-widest text-text-muted">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="ds-input ds-focus-ring pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t.auth.common.hidePassword : t.auth.common.showPassword}
          className="ds-focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-ds-control p-1.5 text-text-muted transition-colors hover:text-text-primary"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
