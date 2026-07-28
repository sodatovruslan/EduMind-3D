import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "@/lib/token-storage";
import type { TokenPair } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(`${API_URL}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    clearTokens();
    return null;
  }

  const tokens: TokenPair = await response.json();
  setTokens(tokens.access_token, tokens.refresh_token);
  return tokens.access_token;
}

interface RequestOptions extends RequestInit {
  auth?: boolean; // по умолчанию true — большинство эндпоинтов защищены JWT
}

async function parseErrorDetail(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.detail ?? response.statusText ?? "Ошибка запроса";
}

/**
 * Общий fetch-wrapper для защищенных эндпоинтов.
 * При 401 один раз пробует обновить access-токен через refresh-токен и
 * повторяет запрос — так пользователя не разлогинивает каждые 30 минут.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, headers, ...rest } = options;

  const buildHeaders = (token: string | null): HeadersInit => ({
    "Content-Type": "application/json",
    ...(auth && token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  });

  let response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: buildHeaders(auth ? getAccessToken() : null),
  });

  if (response.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      response = await fetch(`${API_URL}${path}`, {
        ...rest,
        headers: buildHeaders(newToken),
      });
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/**
 * /api/auth/login — отдельная функция, а не apiFetch: FastAPI ждет тут
 * form-urlencoded тело (OAuth2PasswordRequestForm), а не JSON, и запрос
 * не несет Authorization-заголовок, т.к. токена еще не существует.
 */
export async function login(email: string, password: string): Promise<TokenPair> {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);

  const response = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorDetail(response));
  }

  return response.json();
}
