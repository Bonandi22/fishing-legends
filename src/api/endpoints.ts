import { apiFetch } from './client';
import type { ApiUser, PlayerProfile, GameStateEnvelope, LeaderboardPage, Season } from './types';
import type { RewardGrant } from '@/game/rewards';

export interface RegisterInput { email: string; password: string; username: string; country: string; locale: string; }
export interface CodeInput { challengeId: string; code: string; }

export function register(input: RegisterInput): Promise<{ challengeId: string }> {
  return apiFetch('/auth/register', { method: 'POST', body: input });
}
export function verifyEmail(input: CodeInput): Promise<{ user: ApiUser }> {
  return apiFetch('/auth/verify-email', { method: 'POST', body: input });
}
export function login(input: { email: string; password: string; locale: string }): Promise<{ challengeId: string }> {
  return apiFetch('/auth/login', { method: 'POST', body: input });
}
export function verifyLogin(input: CodeInput): Promise<{ user: ApiUser }> {
  return apiFetch('/auth/login/verify', { method: 'POST', body: input });
}
export function resendCode(input: { challengeId: string }): Promise<{ challengeId: string }> {
  return apiFetch('/auth/challenges/resend', { method: 'POST', body: input });
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
export function bootstrapGameState(state: unknown): Promise<{ version: number }> {
  return apiFetch('/me/state/bootstrap', { method: 'POST', body: { state } });
}
export function sellWarehouse(idempotencyKey: string): Promise<GameStateEnvelope> {
  return apiFetch('/me/economy/warehouse/sell', { method: 'POST', idempotencyKey });
}
export function purchaseNet(idempotencyKey: string): Promise<GameStateEnvelope> {
  return apiFetch('/me/economy/nets/purchase', { method: 'POST', idempotencyKey });
}
export function purchaseMultiplier(
  idempotencyKey: string,
  type: 'luck' | 'strength',
  power: 2 | 4,
): Promise<GameStateEnvelope> {
  return apiFetch('/me/economy/multipliers/purchase', { method: 'POST', body: { type, power }, idempotencyKey });
}
export function purchaseSkin(
  idempotencyKey: string,
  kind: 'rod' | 'boat',
  skinId: string,
): Promise<GameStateEnvelope> {
  return apiFetch('/me/economy/skins/purchase', { method: 'POST', body: { kind, skinId }, idempotencyKey });
}
export function equipSkin(idempotencyKey: string, kind: 'rod' | 'boat', skinId: string): Promise<GameStateEnvelope> {
  return apiFetch('/me/economy/skins/equip', { method: 'POST', body: { kind, skinId }, idempotencyKey });
}

export type RewardEnvelope = GameStateEnvelope & { reward: RewardGrant };

export function spinRoulette(idempotencyKey: string): Promise<RewardEnvelope> {
  return apiFetch('/me/economy/roulette/spin', { method: 'POST', idempotencyKey });
}
export function spinSkinRoulette(idempotencyKey: string): Promise<RewardEnvelope> {
  return apiFetch('/me/economy/skin-roulette/spin', { method: 'POST', idempotencyKey });
}
export function claimDailyGift(idempotencyKey: string): Promise<RewardEnvelope> {
  return apiFetch('/me/economy/daily-gift/claim', { method: 'POST', idempotencyKey });
}

export function placeAquariumFish(idempotencyKey: string, timestamp: number, sector: number): Promise<GameStateEnvelope> {
  return apiFetch('/me/economy/aquarium/place', { method: 'POST', body: { timestamp, sector }, idempotencyKey });
}

export type FishMode = 'rod' | 'net' | 'submarine';
export interface NetInfo { id: string; rarity: string; fishCount: number; greenZoneSize: number; speed: number }
export interface BatchEntry { fishId: string; weight: number }

type CastBase = GameStateEnvelope & { sessionId: string; lucky: boolean };
export type RodCast = CastBase & { mode: 'rod'; fishId: string; weight: number; xp: number };
export type NetCast = CastBase & { mode: 'net'; net: NetInfo; catches: BatchEntry[] };
export type SubmarineCast = CastBase & { mode: 'submarine'; catches: Array<{ id: string; fishId: string; weight: number }> };
export type CastResult = RodCast | NetCast | SubmarineCast;
export type LandResult = GameStateEnvelope & { caught: Array<{ fishId: string; weight: number; location: string }> };

export function castLine(idempotencyKey: string, locationId: string, mode: FishMode = 'rod'): Promise<CastResult> {
  return apiFetch('/me/fishing/cast', { method: 'POST', body: { locationId, mode }, idempotencyKey });
}
export function landCatch(idempotencyKey: string, sessionId: string, catchId?: string): Promise<LandResult> {
  return apiFetch('/me/fishing/land', { method: 'POST', body: { sessionId, ...(catchId ? { catchId } : {}) }, idempotencyKey });
}

export function getLeaderboard(limit = 100, offset = 0): Promise<LeaderboardPage> {
  return apiFetch(`/leaderboard?limit=${limit}&offset=${offset}`);
}
export function getCurrentSeason(): Promise<{ season: Season | null }> {
  return apiFetch('/seasons/current');
}
