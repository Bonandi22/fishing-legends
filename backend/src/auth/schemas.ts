import { z } from 'zod';

const LOCALES = ['pt', 'en', 'es', 'fr', 'de', 'ja'] as const;

// Trim + lowercase before validating, so ' User@X.COM ' and 'user@x.com' are one account.
const emailSchema = z.string().trim().toLowerCase().email().max(320);

// A loose guard only. Length, common-password and personal-info rules belong to
// checkPassword (shared with the frontend), which counts code points; Zod counts
// UTF-16 units and must not contradict it.
const passwordSchema = z.string().min(1).max(512);

export const localeSchema = z.enum(LOCALES);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  username: z.string().trim().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  country: z.string().length(2).regex(/^[A-Za-z]{2}$/).transform(value => value.toUpperCase()),
  locale: localeSchema.optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  locale: localeSchema.optional(),
});

const challengeIdSchema = z.string().uuid();

export const verifyCodeSchema = z.object({
  challengeId: challengeIdSchema,
  // Format is checked by the challenge service so a malformed code still costs an attempt.
  code: z.string().min(1).max(32),
});

export const resendSchema = z.object({ challengeId: challengeIdSchema });

export const challengeResponseSchema = z.object({ challengeId: z.string() });
