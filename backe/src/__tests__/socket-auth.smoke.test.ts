import { authenticateHandshake } from '../socket/index.js';

describe('socket auth smoke', () => {
  test('accepts Bearer token', async () => {
    const { default: jwt } = await import('jsonwebtoken');
    const token = jwt.sign({ id: '507f1f77bcf86cd799439011' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

    const res = authenticateHandshake({
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.userId).toBe('507f1f77bcf86cd799439011');
  });

  test('accepts cookie token', async () => {
    const { default: jwt } = await import('jsonwebtoken');
    const token = jwt.sign({ id: '507f1f77bcf86cd799439012' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });

    const res = authenticateHandshake({
      headers: { cookie: `access_token=${encodeURIComponent(token)}; other=1` },
    });

    expect(res.userId).toBe('507f1f77bcf86cd799439012');
  });

  test('rejects missing token', () => {
    expect(() => authenticateHandshake({ headers: {} })).toThrow(/Authentication error/);
  });
});
