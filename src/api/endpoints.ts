import { apiFetch } from './client';
import type { ApiUser, PlayerProfile, MigrationPreview, MigrationResult, GameStateEnvelope } from './types';

export interface RegisterInput { email: string; password: string; username: string; country: string; }

export function register(input: RegisterInput): Promise<{ user: ApiUser }> {
  return apiFetch('/auth/register', { method: 'POST', body: input });
}
export function login(input: { email: string; password: string }): Promise<{ user: ApiUser }> {
  return apiFetch('/auth/login', { method: 'POST', body: input });
}
export function logout(): Promise<void> {
  return apiFetch('/auth/logout', { method: 'POST' });
}
export function getMe(): Promise<{ user: PlayerProfile }> {
  return apiFetch('/me');
}
export function previewMigration(save: unknown): Promise<MigrationPreview> {
  return apiFetch('/migration/local/preview', { method: 'POST', body: save });
}
export function importMigration(save: unknown, idempotencyKey: string): Promise<MigrationResult> {
  return apiFetch('/migration/local/import', { method: 'POST', body: save, idempotencyKey });
}
export function getGameState(): Promise<GameStateEnvelope> {
  return apiFetch('/me/state');
}
export function putGameState(state: unknown): Promise<void> {
  return apiFetch('/me/state', { method: 'PUT', body: { state } });
}
