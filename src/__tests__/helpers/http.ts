import http from 'http';

export async function listen(server: http.Server): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    throw new Error('Failed to bind server');
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    close: async () => {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    },
  };
}

export function extractSetCookies(res: Response): string[] {
  const anyHeaders = res.headers as any;
  const arr = typeof anyHeaders.getSetCookie === 'function' ? (anyHeaders.getSetCookie() as string[]) : [];
  return Array.isArray(arr) ? arr : [];
}

export function parseCookies(setCookies: string[]): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const sc of setCookies) {
    const [pair] = sc.split(';');
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (name) jar[name] = value;
  }
  return jar;
}

export function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

