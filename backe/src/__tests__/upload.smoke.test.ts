import http from 'http';
import fs from 'fs';
import path from 'path';
import { listen, cookieHeader } from './helpers/http.js';

describe('upload smoke', () => {
  test('authenticated upload succeeds', async () => {
    const { default: User } = await import('../models/User.js');
    const userId = '507f1f77bcf86cd799439011';
    const u = new User({
      _id: userId,
      username: 'alice',
      name: 'Alice',
      email: 'alice@example.com',
      password: 'pw',
      location: { type: 'Point', coordinates: [0, 0] },
    });
    await u.save();

    const { createApp } = await import('../index.js');
    const { app, uploadsDir } = createApp();
    const server = http.createServer(app);
    const handle = await listen(server);

    // Get cookies by hitting signup with mocked user model replaced later? authController uses User;
    // easiest: mint cookies by calling login/signup is hard without full auth mocks,
    // so directly create a signed JWT and set cookies for request.
    const { default: jwt } = await import('jsonwebtoken');
    const token = jwt.sign({ id: userId }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    const csrf = 'csrf_test_token';
    const jar = { access_token: token, csrf_token: csrf };

    // 1x1 transparent PNG (valid)
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMBA6q+KSUAAAAASUVORK5CYII=',
      'base64'
    );
    const form = new FormData();
    form.append('file', new Blob([png], { type: 'image/png' }), 'test.png');

    let res: Response;
    try {
      res = await fetch(`${handle.baseUrl}/api/upload`, {
        method: 'POST',
        headers: {
          cookie: cookieHeader(jar),
          'x-csrf-token': csrf,
        },
        body: form as any,
      });
    } catch (e: any) {
      await handle.close();
      throw new Error(`fetch failed: ${e?.message || String(e)}`);
    }

    expect(res.status).toBe(200);
    if (res.status !== 200) {
      const txt = await res.text();
      await handle.close();
      throw new Error(`unexpected status ${res.status}: ${txt}`);
    }
    const json: any = await res.json();
    expect(json?.success).toBe(true);
    // response may include either `filename` (local disk) or `url` (cloud storage)
    expect(
      typeof json?.filename === 'string' || typeof json?.url === 'string'
    ).toBe(true);

    let savedPath: string | undefined;
    if (json.filename) {
      savedPath = path.join(uploadsDir, json.filename);
      expect(fs.existsSync(savedPath)).toBe(true);
    }

    await handle.close();

    if (savedPath) {
      // Windows can keep file handles open briefly; retry a few times.
      let lastErr: any;
      for (let i = 0; i < 20; i++) {
        try {
          fs.unlinkSync(savedPath);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      if (lastErr) {
        // Best-effort cleanup; don't fail the smoke test on Windows file locking.
        console.warn('Failed to delete uploaded test file:', savedPath, lastErr);
      }
    }
  });
});
