import http from 'http';
import { listen, extractSetCookies, parseCookies } from './helpers/http.js';

jest.setTimeout(20000);

async function resetInMemoryStores() {
  const { default: User } = await import('../models/User.js');
  const { default: RefreshToken } = await import('../models/RefreshToken.js');
  User.__resetForTests?.();
  RefreshToken.__resetForTests?.();
}

describe('auth smoke', () => {
  beforeEach(async () => {
    await resetInMemoryStores();
  });

  test('signup sets auth cookies', async () => {
    const { createApp } = await import('../index.js');
    const { app } = createApp();
    const server = http.createServer(app);
    const handle = await listen(server);

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    const res = await fetch(`${handle.baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ac.signal,
      body: JSON.stringify({
        username: 'alice',
        name: 'Alice',
        email: 'alice@example.com',
        password: 'pw',
        location: { type: 'Point', coordinates: [0, 0] },
      }),
    });
    clearTimeout(t);

    expect(res.status).toBe(201);
    const setCookies = extractSetCookies(res);
    const jar = parseCookies(setCookies);
    expect(jar.access_token).toBeTruthy();
    expect(jar.refresh_token).toBeTruthy();
    expect(jar.csrf_token).toBeTruthy();

    await handle.close();
  });

  test('login returns 200 and sets cookies', async () => {
    const { default: User } = await import('../models/User.js');
    const u = new User({
      username: 'bob',
      name: 'Bob',
      email: 'bob@example.com',
      password: 'pw',
      location: { type: 'Point', coordinates: [0, 0] },
    });
    await u.save();

    const { createApp } = await import('../index.js');
    const { app } = createApp();
    const server = http.createServer(app);
    const handle = await listen(server);

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 10000);
    const res = await fetch(`${handle.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: ac.signal,
      body: JSON.stringify({ email: 'bob@example.com', password: 'pw' }),
    });
    clearTimeout(t);

    expect(res.status).toBe(200);
    const setCookies = extractSetCookies(res);
    const jar = parseCookies(setCookies);
    expect(jar.access_token).toBeTruthy();
    expect(jar.csrf_token).toBeTruthy();

    await handle.close();
  });
});
