import { apiFetch } from "@/lib/api";

// общий fetcher для useSWR — просто прокидывает путь в наш apiFetch,
// который уже сам подставляет Authorization и обновляет токен при 401
export const swrFetcher = <T>(path: string): Promise<T> => apiFetch<T>(path);
