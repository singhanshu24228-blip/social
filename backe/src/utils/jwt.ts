export function getJwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) {
    throw new Error('JWT secret not set. Please set JWT_SECRET in your environment (.env)');
  }
  return s;
}
