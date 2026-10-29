"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "@/components/design-system";
import { ApiError, apiFetch } from "@/lib/api";
import { useLocale } from "@/lib/locale-context";

const COOLDOWN_SECONDS = 60;

function VerifyEmailContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useLocale();
  const copy = t.auth.verify;
  const email = params.get("email")?.trim().toLowerCase() ?? "";
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(params.get("delivery") === "failed" ? copy.sendFailed : null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  function messageFor(err: ApiError): string {
    if (err.code === "VERIFICATION_CODE_EXPIRED") return copy.expired;
    if (err.code === "VERIFICATION_ATTEMPTS_EXCEEDED") return copy.attempts;
    if (err.code === "VERIFICATION_EMAIL_FAILED") return copy.sendFailed;
    return copy.invalid;
  }

  async function verify(event: React.FormEvent) {
    event.preventDefault();
    if (!email || code.length !== 6) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await apiFetch("/api/auth/verify-email", { method: "POST", auth: false, body: JSON.stringify({ email, code }) });
      router.push("/login?verified=1");
    } catch (err) {
      setError(err instanceof ApiError ? messageFor(err) : copy.invalid);
    } finally { setBusy(false); }
  }

  async function resend() {
    if (!email || cooldown > 0) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      await apiFetch("/api/auth/resend-verification", { method: "POST", auth: false, body: JSON.stringify({ email }) });
      setNotice(copy.resent); setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      if (err instanceof ApiError && err.code === "RESEND_COOLDOWN") {
        const retryAfter = Number((err.detail as { retry_after?: unknown } | undefined)?.retry_after);
        setCooldown(Number.isFinite(retryAfter) ? Math.max(1, Math.ceil(retryAfter)) : COOLDOWN_SECONDS);
      } else {
        setError(err instanceof ApiError ? messageFor(err) : copy.sendFailed);
      }
    } finally { setBusy(false); }
  }

  return <>
    <h1 className="mb-2 text-ds-title text-text-primary">{copy.title}</h1>
    <p className="mb-6 text-ds-body text-text-secondary">{copy.emailLabel}: <strong>{email}</strong></p>
    <form onSubmit={verify} className="space-y-4">
      <label htmlFor="verification-code" className="block text-ds-caption font-semibold uppercase tracking-widest text-text-muted">{copy.codeLabel}</label>
      <input id="verification-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder={copy.codePlaceholder} className="ds-input ds-focus-ring text-center font-mono text-2xl tracking-[0.35em]" />
      <div role="alert" className="min-h-5 text-ds-caption text-danger">{error}</div>
      <div role="status" className="min-h-5 text-ds-caption text-success">{notice}</div>
      <Button type="submit" disabled={busy || code.length !== 6 || !email} className="w-full">{busy ? copy.submitting : copy.submit}</Button>
    </form>
    <Button type="button" variant="ghost" disabled={busy || cooldown > 0 || !email} onClick={resend} className="mt-3 w-full">{cooldown > 0 ? copy.resendIn.replace("{seconds}", String(cooldown)) : copy.resend}</Button>
    <p className="mt-4 text-center"><Link href="/login" className="text-accent hover:underline">{copy.backToLogin}</Link></p>
  </>;
}

// useSearchParams() needs a Suspense boundary for the production build (static prerender).
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailContent />
    </Suspense>
  );
}
