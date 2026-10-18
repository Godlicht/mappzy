import type { ProgressMap } from '../types';

export interface User {
  id: number;
  username: string;
}

const TOKEN_KEY = 'mappzy:token';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) */
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(`/api${path}`, { ...init, headers });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;
  if (!res.ok) throw new ApiError(body?.error ?? `HTTP ${res.status}`, res.status);
  if (!isJson) throw new ApiError('Serwer kont jest niedostępny.', 503);
  return body as T;
}

/** The app also works as a purely static site; accounts are enabled only if the API answers. */
export async function checkServer(): Promise<boolean> {
  try {
    const res = await request<{ ok: boolean; accounts: boolean }>('/health');
    return res.ok && res.accounts;
  } catch {
    return false;
  }
}

export const api = {
  register: (username: string, password: string) =>
    request<{ token: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/auth/me'),
  getProgress: (gameId: string) => request<{ progress: ProgressMap }>(`/progress/${encodeURIComponent(gameId)}`),
  putProgress: (gameId: string, progress: ProgressMap) =>
    request<{ progress: ProgressMap }>(`/progress/${encodeURIComponent(gameId)}`, {
      method: 'PUT',
      body: JSON.stringify({ progress }),
    }),
};
