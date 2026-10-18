import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, checkServer, getToken, setToken, type User } from '../api/client';

export interface AuthState {
  user: User | null;
  serverAvailable: boolean;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [serverAvailable, setServerAvailable] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const available = await checkServer();
      if (cancelled) return;
      setServerAvailable(available);
      if (available && getToken()) {
        try {
          const { user } = await api.me();
          if (!cancelled) setUser(user);
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) setToken(null);
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const res = await api.register(username, password);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* the session is dropped locally either way */
    }
    setToken(null);
    setUser(null);
  }, []);

  return { user, serverAvailable, ready, login, register, logout };
}
