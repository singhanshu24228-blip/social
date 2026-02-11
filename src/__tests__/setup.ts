process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
process.env.DISABLE_UPLOADS_CACHE = 'true';
process.env.AUTH_RATE_LIMIT_MAX = '1000';
process.env.IN_MEMORY_DB = 'true';
