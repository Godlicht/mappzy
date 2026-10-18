import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { hashPassword, hashToken, newToken, RateLimiter, verifyPassword } from './auth';
import type { Db } from './db';
import { isValidProgressMap, mergeProgress } from '../src/progress/progress';
import type { ProgressMap } from '../src/types';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90;
const USERNAME_RE = /^[\p{L}\p{N}_.-]{3,32}$/u;
const GAME_ID_RE = /^[a-z0-9-]{1,64}$/;
const MAX_PROGRESS_ENTRIES = 100_000;

const wrap =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

interface AuthedRequest extends Request {
  userId?: number;
}

export interface AppOptions {
  staticDir?: string;
  authRateLimit?: number;
}

export function createApp(db: Db, options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '5mb' }));

  const limiter = new RateLimiter(options.authRateLimit ?? 20, 60_000);

  const stmts = {
    userByName: db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?'),
    userById: db.prepare('SELECT id, username FROM users WHERE id = ?'),
    insertUser: db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    session: db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    deleteExpired: db.prepare('DELETE FROM sessions WHERE expires_at < ?'),
    getProgress: db.prepare('SELECT data, updated_at FROM progress WHERE user_id = ? AND game_id = ?'),
    upsertProgress: db.prepare(
      `INSERT INTO progress (user_id, game_id, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, game_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    ),
  };

  const createSession = (userId: number) => {
    const token = newToken();
    const now = Date.now();
    stmts.insertSession.run(hashToken(token), userId, now, now + SESSION_TTL_MS);
    return token;
  };

  const rateLimit = (req: Request, res: Response, next: NextFunction) => {
    if (!limiter.allow(req.ip ?? 'unknown')) {
      res.status(429).json({ error: 'Zbyt wiele prób. Spróbuj ponownie za minutę.' });
      return;
    }
    next();
  };

  const requireAuth = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.get('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const row = token ? (stmts.session.get(hashToken(token)) as { user_id: number; expires_at: number } | undefined) : undefined;
    if (!row || row.expires_at < Date.now()) {
      res.status(401).json({ error: 'Sesja wygasła lub jest nieprawidłowa.' });
      return;
    }
    req.userId = row.user_id;
    next();
  };

  const readCredentials = (req: Request, res: Response) => {
    const { username, password } = (req.body ?? {}) as Record<string, unknown>;
    if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
      res.status(400).json({ error: 'Nazwa użytkownika: 3–32 znaki (litery, cyfry, _ . -).' });
      return null;
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) {
      res.status(400).json({ error: 'Hasło musi mieć od 8 do 256 znaków.' });
      return null;
    }
    return { username, password };
  };

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, accounts: true });
  });

  app.post('/api/auth/register', rateLimit, wrap(async (req, res) => {
    const creds = readCredentials(req, res);
    if (!creds) return;
    if (stmts.userByName.get(creds.username)) {
      res.status(409).json({ error: 'Ta nazwa użytkownika jest zajęta.' });
      return;
    }
    const hash = await hashPassword(creds.password);
    const info = stmts.insertUser.run(creds.username, hash, Date.now());
    const userId = Number(info.lastInsertRowid);
    res.status(201).json({ token: createSession(userId), user: { id: userId, username: creds.username } });
  }));

  app.post('/api/auth/login', rateLimit, wrap(async (req, res) => {
    const creds = readCredentials(req, res);
    if (!creds) return;
    const user = stmts.userByName.get(creds.username) as { id: number; username: string; password_hash: string } | undefined;
    if (!user || !(await verifyPassword(creds.password, user.password_hash))) {
      res.status(401).json({ error: 'Nieprawidłowa nazwa użytkownika lub hasło.' });
      return;
    }
    stmts.deleteExpired.run(Date.now());
    res.json({ token: createSession(user.id), user: { id: user.id, username: user.username } });
  }));

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    const token = (req.get('authorization') ?? '').slice(7);
    stmts.deleteSession.run(hashToken(token));
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    res.json({ user: stmts.userById.get(req.userId!) });
  });

  const loadProgress = (userId: number, gameId: string): ProgressMap => {
    const row = stmts.getProgress.get(userId, gameId) as { data: string } | undefined;
    return row ? (JSON.parse(row.data) as ProgressMap) : {};
  };

  app.get('/api/progress/:gameId', requireAuth, (req: AuthedRequest, res) => {
    const { gameId } = req.params;
    if (!GAME_ID_RE.test(gameId)) {
      res.status(400).json({ error: 'Nieprawidłowe id gry.' });
      return;
    }
    res.json({ progress: loadProgress(req.userId!, gameId) });
  });

  /** Accepts a (partial or full) progress map, merges it with the stored one and returns the result. */
  app.put('/api/progress/:gameId', requireAuth, (req: AuthedRequest, res) => {
    const { gameId } = req.params;
    const incoming = (req.body as { progress?: unknown } | undefined)?.progress;
    if (!GAME_ID_RE.test(gameId) || !isValidProgressMap(incoming)) {
      res.status(400).json({ error: 'Nieprawidłowe dane postępu.' });
      return;
    }
    const merged = mergeProgress(loadProgress(req.userId!, gameId), incoming);
    if (Object.keys(merged).length > MAX_PROGRESS_ENTRIES) {
      res.status(413).json({ error: 'Zbyt wiele wpisów postępu.' });
      return;
    }
    stmts.upsertProgress.run(req.userId!, gameId, JSON.stringify(merged), Date.now());
    res.json({ progress: merged });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Nie znaleziono.' });
  });

  if (options.staticDir && existsSync(options.staticDir)) {
    const dir = options.staticDir;
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(join(dir, 'index.html')));
  }

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera.' });
  });

  return app;
}
