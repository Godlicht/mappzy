import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../server/app';
import { openDatabase } from '../server/db';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = createApp(openDatabase(':memory:'), { authRateLimit: 1000 });
  await new Promise<void>((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

async function call(path: string, init: RequestInit & { token?: string; json?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (init.json !== undefined) headers['content-type'] = 'application/json';
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const res = await fetch(base + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : undefined });
  return { status: res.status, body: (await res.json()) as any };
}

describe('auth + progress API', () => {
  it('registers, logs in and rejects bad credentials', async () => {
    const reg = await call('/auth/register', { method: 'POST', json: { username: 'Tarnished', password: 'correct horse' } });
    expect(reg.status).toBe(201);
    expect(reg.body.user.username).toBe('Tarnished');

    expect((await call('/auth/register', { method: 'POST', json: { username: 'tarnished', password: 'whatever123' } })).status).toBe(409);
    expect((await call('/auth/register', { method: 'POST', json: { username: 'ab', password: 'whatever123' } })).status).toBe(400);
    expect((await call('/auth/login', { method: 'POST', json: { username: 'Tarnished', password: 'wrong pass' } })).status).toBe(401);

    const login = await call('/auth/login', { method: 'POST', json: { username: 'Tarnished', password: 'correct horse' } });
    expect(login.status).toBe(200);
    const me = await call('/auth/me', { token: login.body.token });
    expect(me.body.user.username).toBe('Tarnished');
  });

  it('merges progress from multiple devices by timestamp', async () => {
    const { body } = await call('/auth/register', { method: 'POST', json: { username: 'device-test', password: 'password123' } });
    const token = body.token;
    expect((await call('/progress/elden-ring', { token })).body.progress).toEqual({});

    await call('/progress/elden-ring', { method: 'PUT', token, json: { progress: { a: { f: 1, t: 10 }, b: { f: 1, t: 10 } } } });
    const second = await call('/progress/elden-ring', { method: 'PUT', token, json: { progress: { a: { f: 0, t: 20 }, b: { f: 0, t: 5 } } } });
    expect(second.body.progress).toEqual({ a: { f: 0, t: 20 }, b: { f: 1, t: 10 } });

    expect((await call('/progress/elden-ring', { method: 'PUT', token, json: { progress: { a: { f: 3 } } } })).status).toBe(400);
    expect((await call('/progress/Bad_Id', { token })).status).toBe(400);
  });

  it('requires a valid session and invalidates it on logout', async () => {
    expect((await call('/progress/elden-ring')).status).toBe(401);
    const { body } = await call('/auth/register', { method: 'POST', json: { username: 'logout-test', password: 'password123' } });
    expect((await call('/auth/logout', { method: 'POST', token: body.token })).status).toBe(200);
    expect((await call('/auth/me', { token: body.token })).status).toBe(401);
  });
});
