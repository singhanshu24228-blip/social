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

  test('lockout triggers after 5 wrong passwords', async () => {
    const { default: User } = await import('../models/User.js');
    const u = new User({
      username: 'charlie',
      name: 'Charlie',
      email: 'charlie@example.com',
      password: 'right',
      location: { type: 'Point', coordinates: [0, 0] },
    });
    await u.save();

    const { createApp } = await import('../index.js');
    const { app } = createApp();
    const server = http.createServer(app);
    const handle = await listen(server);

    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${handle.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'charlie@example.com', password: 'wrong' }),
      });
      expect(res.status).toBe(401);
    }
    const blocked = await fetch(`${handle.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'charlie@example.com', password: 'right' }),
    });
    expect(blocked.status).toBe(429);

    await handle.close();
  });

  test('forgot/reset password flow', async () => {
    const crypto = await import('crypto');
    const { default: User } = await import('../models/User.js');
    const u = new User({
      username: 'dave',
      name: 'Dave',
      email: 'dave@example.com',
      password: 'initial',
      location: { type: 'Point', coordinates: [0, 0] },
    });
    await u.save();

    const { createApp } = await import('../index.js');
    const { app } = createApp();
    const server = http.createServer(app);
    const handle = await listen(server);

    let res = await fetch(`${handle.baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'dave@example.com' }),
    });
    expect(res.status).toBe(200);

    const userAfter = await User.findOne({ email: 'dave@example.com' });
    expect(userAfter?.passwordReset?.otpHash).toBeTruthy();

    const testOtp = '123456';
    userAfter!.passwordReset = { otpHash: crypto.createHash('sha256').update(testOtp).digest('hex'), expires: new Date(Date.now() + 100000) } as any;
    await userAfter!.save();

    res = await fetch(`${handle.baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'dave@example.com', otp: testOtp, newPassword: 'newpw' }),
    });
    expect(res.status).toBe(200);

    const loginRes = await fetch(`${handle.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'dave@example.com', password: 'newpw' }),
    });
    expect(loginRes.status).toBe(200);

    await handle.close();
  });

  test('signup is not rate-limited by refresh traffic', async () => {
    const previousLimit = process.env.AUTH_RATE_LIMIT_MAX;
    process.env.AUTH_RATE_LIMIT_MAX = '2';
    jest.resetModules();

    await resetInMemoryStores();

    const { createApp } = await import('../index.js');
    const { app } = createApp();
    const server = http.createServer(app);
    const handle = await listen(server);

    try {
      for (let i = 0; i < 5; i++) {
        const refreshRes = await fetch(`${handle.baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        });

        expect([401, 403]).toContain(refreshRes.status);
      }

      const signupRes = await fetch(`${handle.baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          username: 'refreshsafe',
          name: 'Refresh Safe',
          email: 'refreshsafe@example.com',
          password: 'pw',
          location: { type: 'Point', coordinates: [0, 0] },
        }),
      });

      expect(signupRes.status).toBe(201);
    } finally {
      process.env.AUTH_RATE_LIMIT_MAX = previousLimit || '1000';
      await handle.close();
      jest.resetModules();
    }
  });

  test('request and delete account using password + OTP', async () => {
    const crypto = await import('crypto');
    const { default: User } = await import('../models/User.js');
    // create a fresh user via signup so we get cookies easily
    const { createApp } = await import('../index.js');
    const { app } = createApp();
    const server = http.createServer(app);
    const handle = await listen(server);

    // signup new user
    let res = await fetch(`${handle.baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'deleter',
        name: 'Delete Me',
        email: 'deleter@example.com',
        password: 'secret',
        location: { type: 'Point', coordinates: [0, 0] },
      }),
    });
    expect(res.status).toBe(201);
    const setCookies = extractSetCookies(res);
    const jar = parseCookies(setCookies);
    const authHeaders = {
      'content-type': 'application/json',
      'x-csrf-token': jar.csrf_token,
      cookie: `access_token=${jar.access_token}; refresh_token=${jar.refresh_token}; csrf_token=${jar.csrf_token}`,
    };

    // request OTP for deletion
    res = await fetch(`${handle.baseUrl}/api/auth/request-delete`, {
      method: 'POST',
      headers: authHeaders,
    });
    expect(res.status).toBe(200);

    const userAfter = await User.findOne({ email: 'deleter@example.com' });
    expect(userAfter?.accountDeletion?.otpHash).toBeTruthy();

    // simulate OTP code to known value
    const testOtp = '123456';
    userAfter!.accountDeletion = { otpHash: crypto.createHash('sha256').update(testOtp).digest('hex'), expires: new Date(Date.now() + 100000) } as any;
    await userAfter!.save();

    // attempt deletion with wrong password
    res = await fetch(`${handle.baseUrl}/api/auth/delete-account`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ password: 'wrong', otp: testOtp }),
    });
    expect(res.status).toBe(401);

    // now correct deletion
    res = await fetch(`${handle.baseUrl}/api/auth/delete-account`, {
      method: 'DELETE',
      headers: authHeaders,
      body: JSON.stringify({ password: 'secret', otp: testOtp }),
    });
    expect(res.status).toBe(200);

    const deleted = await User.findOne({ email: 'deleter@example.com' });
    expect(deleted).toBeNull();

    await handle.close();
  });

  test('request and perform username change using password + OTP', async () => {
    const crypto = await import('crypto');
    const { default: User } = await import('../models/User.js');
    const { createApp } = await import('../index.js');
    const { app } = createApp();
    const server = http.createServer(app);
    const handle = await listen(server);

    // signup user
    let res = await fetch(`${handle.baseUrl}/api/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'origname',
        name: 'Orig Name',
        email: 'orig@example.com',
        password: 'pw',
        location: { type: 'Point', coordinates: [0, 0] },
      }),
    });
    expect(res.status).toBe(201);
    const setCookies = extractSetCookies(res);
    const jar = parseCookies(setCookies);
    const authHeaders = {
      'content-type': 'application/json',
      'x-csrf-token': jar.csrf_token,
      cookie: `access_token=${jar.access_token}; refresh_token=${jar.refresh_token}; csrf_token=${jar.csrf_token}`,
    };

    // request username change
    res = await fetch(`${handle.baseUrl}/api/auth/request-username-change`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ newUsername: 'newname' }),
    });
    expect(res.status).toBe(200);

    const userAfter = await User.findOne({ email: 'orig@example.com' });
    expect(userAfter?.usernameChange?.otpHash).toBeTruthy();
    expect(userAfter?.usernameChange?.newUsername).toBe('newname');

    // simulate OTP value
    const testOtp = '123456';
    userAfter!.usernameChange = { newUsername: 'newname', otpHash: crypto.createHash('sha256').update(testOtp).digest('hex'), expires: new Date(Date.now() + 100000) } as any;
    await userAfter!.save();

    // wrong password
    res = await fetch(`${handle.baseUrl}/api/auth/change-username`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ password: 'wrong', otp: testOtp }),
    });
    expect(res.status).toBe(401);

    // correct change
    res = await fetch(`${handle.baseUrl}/api/auth/change-username`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ password: 'pw', otp: testOtp }),
    });
    expect(res.status).toBe(200);

    const updated = await User.findOne({ email: 'orig@example.com' });
    expect(updated?.username).toBe('newname');
    expect(updated?.usernameChange).toBeUndefined();

    await handle.close();
  });
});
