import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(12).max(128),
  username: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  country: z.string().length(2).regex(/^[A-Za-z]{2}$/).transform(value => value.toUpperCase()),
});

export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(32).max(256),
});
