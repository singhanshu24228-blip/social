import rateLimit from 'express-rate-limit';

export const usernameCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // limit each IP to 20 requests per windowMs
  message: { message: 'Too many username checks from this IP, please try again later.' },
});
