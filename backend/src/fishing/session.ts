// A fishing session must be completed within this window of being started.
// After that the server marks it `expired` and refuses the catch.
export const FISHING_SESSION_TTL_MS = 5 * 60 * 1000;

export function isSessionExpired(createdAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - createdAt.getTime() > FISHING_SESSION_TTL_MS;
}

export function sessionExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + FISHING_SESSION_TTL_MS);
}
