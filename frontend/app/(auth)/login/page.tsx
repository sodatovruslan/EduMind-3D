"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // TODO: добавить проверку на пустую строку до отправки на бэкенд
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось войти. Попробуйте еще раз.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <h1 className="mb-6 font-headline text-xl font-bold text-slate-100">Вход в EduMind 3D</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-white/15 bg-surface-container-lowest/60 px-3 py-2 text-sm text-slate-100 focus:border-neon-cyan focus:outline-none focus:ring-1 focus:ring-neon-cyan"
          />
        </div>

        <div>
          <label className="mb-1 block font-mono text-xs uppercase tracking-widest text-slate-400">Пароль</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-white/15 bg-surface-container-lowest/60 px-3 py-2 text-sm text-slate-100 focus:border-neon-cyan focus:outline-none focus:ring-1 focus:ring-neon-cyan"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="neon-glow-indigo w-full rounded-md bg-brand py-2 font-headline text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {isSubmitting ? "Входим..." : "Войти"}
        </button>
      </form>

      <p className="mt-4 text-center text-sm text-slate-400">
        Нет аккаунта?{" "}
        <Link href="/register" className="text-brand hover:underline">
          Зарегистрироваться
        </Link>
      </p>
    </>
  );
}
