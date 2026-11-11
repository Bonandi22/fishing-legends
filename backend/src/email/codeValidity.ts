import type { ChallengeService } from '../auth/challenges.js';
import type { EmailMessage } from './types.js';

/**
 * The worker's `isCodeStillValid`: a code email whose challenge has expired, been
 * superseded or been used is replaced by a code_expired_notice. Messages without a
 * challenge (notices) are always valid.
 */
export function codeValidityCheck(challenges: Pick<ChallengeService, 'isStillValid'>) {
  return (msg: EmailMessage): Promise<boolean> =>
    msg.challengeId ? challenges.isStillValid(msg.challengeId) : Promise.resolve(true);
}
