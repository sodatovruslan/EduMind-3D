"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/design-system";
import PasswordField from "@/components/auth/PasswordField";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const { t } = useLocale();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Контракт не меняется: login(email, password) -> router.push("/dashboard"),
  // роль резолвится там же, где и раньше — этот экран её не знает и не
  // выбирает (D3 не трогает routing/role-логику, см. EDUMIND_DESIGN_SYSTEM_V2.md D3).
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // TODO: добавить проверку на пустую строку до отправки на бэкенд
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.auth.login.genericError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="mb-6 text-ds-title text-text-primary">{t.auth.login.title}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="login-email" className="mb-1 block text-ds-caption font-semibold uppercase tracking-widest text-text-muted">
            {t.auth.login.emailLabel}
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ds-input ds-focus-ring"
          />
        </div>

        <PasswordField
          label={t.auth.login.passwordLabel}
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />

        <div role="alert" className="min-h-[1.25rem] text-ds-caption text-danger">
          {error}
        </div>

        <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full">
          {isSubmitting ? t.auth.login.submitLoading : t.auth.login.submit}
        </Button>
      </form>

      <p className="mt-4 text-center text-ds-body text-text-secondary">
        {t.auth.login.noAccount}{" "}
        <Link href="/register" className="ds-focus-ring rounded-ds-control text-accent hover:underline">
          {t.auth.login.registerLink}
        </Link>
      </p>
    </>
  );
}
