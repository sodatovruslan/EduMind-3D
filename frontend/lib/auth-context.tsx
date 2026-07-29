"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch, login as loginRequest } from "@/lib/api";
import { clearTokens, getAccessToken, setTokens } from "@/lib/token-storage";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function restoreSession() {
      if (!getAccessToken()) {
        setIsLoading(false);
        return;
      }
      try {
        const currentUser = await apiFetch<User>("/api/auth/me");
        setUser(currentUser);
      } catch {
        // токен невалиден/просрочен и не смог обновиться — считаем разлогиненным
        clearTokens();
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
  }, []);

  async function login(email: string, password: string) {
    const tokens = await loginRequest(email, password);
    setTokens(tokens.access_token, tokens.refresh_token);
    const currentUser = await apiFetch<User>("/api/auth/me");
    setUser(currentUser);
  }

  async function register(email: string, password: string, fullName: string) {
    await apiFetch("/api/auth/register", {
      method: "POST",
      auth: false,
      body: JSON.stringify({ email, password, full_name: fullName }),
    });
    await login(email, password);
  }

  function logout() {
    clearTokens();
    setUser(null);
  }

  // после PATCH /api/users/{id} (например, смена имени в профиле) —
  // перечитываем /me, чтобы navbar/sidebar сразу показали новое значение
  async function refreshUser() {
    const currentUser = await apiFetch<User>("/api/auth/me");
    setUser(currentUser);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth должен использоваться внутри <AuthProvider>");
  }
  return context;
}
