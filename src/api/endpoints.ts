import { apiFetch } from './client';
import type { ApiUser, PlayerProfile, GameStateEnvelope } from './types';

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
export function getGameState(): Promise<GameStateEnvelope> {
  return apiFetch('/me/state');
}
export function putGameState(state: unknown, baseVersion: number | null): Promise<{ version: number }> {
  return apiFetch('/me/state', { method: 'PUT', body: { state, baseVersion } });
}
