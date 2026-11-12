import type { AuthRepository } from './types.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export const UNVERIFIED_RETENTION_MS = 7 * DAY_MS;
export const CHALLENGE_RETENTION_MS = 24 * HOUR_MS;
export const EMAIL_RETENTION_MS = 7 * DAY_MS;

/**
 * Purges never-confirmed accounts (7 days after registration) and challenges,
 * real or decoy, that expired more than 24h ago. Decoys have no user to
 * cascade from, so without this they would grow forever. Also drops outbox rows
 * that were sent or failed more than 7 days ago (recipient addresses at rest).
 */
export async function runAuthCleanup(
  repo: AuthRepository,
  now: Date,
): Promise<{ unverified: number; challenges: number; emails: number }> {
  const unverified = await repo.deleteStaleUnverified(new Date(now.getTime() - UNVERIFIED_RETENTION_MS));
  const challenges = await repo.deleteExpiredChallenges(new Date(now.getTime() - CHALLENGE_RETENTION_MS));
  const emails = await repo.deleteFinishedEmails(new Date(now.getTime() - EMAIL_RETENTION_MS));
  return { unverified, challenges, emails };
}
