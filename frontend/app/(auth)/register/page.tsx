"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useLocale } from "@/lib/locale-context";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/design-system";
import PasswordField from "@/components/auth/PasswordField";

export default function RegisterPage() {
  const router = useRouter();
  const { register, login } = useAuth();
  const { t } = useLocale();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Контракт не меняется: только реальные поля (имя/email/пароль), тот же
  // client-side порог длины пароля, register(...) -> router.push("/dashboard").
  // Роль не выбирается на этом экране — бэкенд не поддерживает выбор роли
  // при регистрации (см. аудит контракта в EDUMIND_DESIGN_SYSTEM_V2.md D3).
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(t.auth.register.passwordTooShortError);
      return;
    }

    setIsSubmitting(true);
    try {
      const created = await register(email, password, fullName);
      if (created.email_verified) {
        // Бэкенд поднят с AUTO_VERIFY_EMAIL (демо-стенд без SMTP): кода на
        // почте нет, поэтому экран ввода кода стал бы тупиком. Логиним сразу.
        await login(email, password);
        router.push("/dashboard");
        return;
      }
      router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "VERIFICATION_EMAIL_FAILED") {
        router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}&delivery=failed`);
        return;
      }
      setError(err instanceof ApiError ? err.message : t.auth.register.genericError);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="mb-6 text-ds-title text-text-primary">{t.auth.register.title}</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="register-name" className="mb-1 block text-ds-caption font-semibold uppercase tracking-widest text-text-muted">
            {t.auth.register.nameLabel}
          </label>
          <input
            id="register-name"
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="ds-input ds-focus-ring"
          />
        </div>

        <div>
          <label htmlFor="register-email" className="mb-1 block text-ds-caption font-semibold uppercase tracking-widest text-text-muted">
            {t.auth.register.emailLabel}
          </label>
          <input
            id="register-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ds-input ds-focus-ring"
          />
        </div>

        <div>
          <PasswordField
            label={t.auth.register.passwordLabel}
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            minLength={8}
          />
          <p className="mt-1 text-ds-caption text-text-muted">{t.auth.register.passwordHint}</p>
        </div>

        <div role="alert" className="min-h-[1.25rem] text-ds-caption text-danger">
          {error}
        </div>

        <Button type="submit" variant="primary" disabled={isSubmitting} className="w-full">
          {isSubmitting ? t.auth.register.submitLoading : t.auth.register.submit}
        </Button>
      </form>

      <p className="mt-4 text-center text-ds-body text-text-secondary">
        {t.auth.register.hasAccount}{" "}
        <Link href="/login" className="ds-focus-ring rounded-ds-control text-accent hover:underline">
          {t.auth.register.loginLink}
        </Link>
      </p>
    </>
  );
}
