import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Mirrors the hand-written SQL in backend/migrations/*.sql, which remains the
// reviewable source of schema changes. Keep both in sync: constraints, checks and
// partial indexes below exist so `drizzle-kit generate` does not propose dropping
// them when used for drift detection.

export const schemaMigrations = pgTable('schema_migrations', {
  version: varchar('version', { length: 64 }).primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: varchar('email', { length: 320 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  emailUnique: uniqueIndex('users_email_unique').on(table.email),
  statusCheck: check('users_status_check', sql`${table.status} IN ('active', 'suspended', 'deleted')`),
}));

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  username: varchar('username', { length: 20 }).notNull(),
  country: char('country', { length: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  usernameUnique: uniqueIndex('user_profiles_username_unique').on(sql`lower(${table.username})`),
}));

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  userIdIdx: index('sessions_user_id_idx').on(table.userId),
}));

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  replacedBy: uuid('replaced_by').references((): AnyPgColumn => refreshTokens.id, { onDelete: 'set null' }),
  replacedAt: timestamp('replaced_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, table => ({
  tokenHashUnique: uniqueIndex('refresh_tokens_token_hash_unique').on(table.tokenHash),
  sessionIdIdx: index('refresh_tokens_session_id_idx').on(table.sessionId),
}));

export const fishingSessions = pgTable('fishing_sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  locationId: varchar('location_id', { length: 120 }).notNull(),
  rulesetVersion: varchar('ruleset_version', { length: 64 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('open'),
  mode: varchar('mode', { length: 16 }).notNull().default('rod'),
  idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  resultFishId: varchar('result_fish_id', { length: 120 }),
  resultWeight: numeric('result_weight', { precision: 12, scale: 2 }),
  resultXp: integer('result_xp'),
  resultLucky: boolean('result_lucky').notNull().default(false),
  resultCatches: jsonb('result_catches').$type<Array<{ id?: string; fishId: string; weight: number }>>(),
}, table => ({
  idempotencyUnique: uniqueIndex('fishing_sessions_idempotency_unique').on(table.userId, table.idempotencyKey),
  statusCheck: check('fishing_sessions_status_check', sql`${table.status} IN ('open', 'completed', 'expired')`),
  modeCheck: check('fishing_sessions_mode_check', sql`${table.mode} IN ('rod', 'net', 'submarine')`),
}));

export const localSaveMigrations = pgTable('local_save_migrations', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sourceVersion: integer('source_version').notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  userUnique: uniqueIndex('local_save_migrations_user_unique').on(table.userId),
}));

export const seasons = pgTable('seasons', {
  id: uuid('id').primaryKey(),
  seasonKey: varchar('season_key', { length: 64 }).notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('scheduled'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  rulesetVersion: varchar('ruleset_version', { length: 64 }).notNull(),
  minimumLevel: integer('minimum_level').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  seasonKeyUnique: uniqueIndex('seasons_key_unique').on(table.seasonKey),
  activeUnique: uniqueIndex('seasons_active_unique').on(table.status).where(sql`status = 'active'`),
  statusCheck: check('seasons_status_check', sql`${table.status} IN ('scheduled', 'active', 'closed')`),
  datesCheck: check('seasons_dates_check', sql`${table.endsAt} > ${table.startsAt}`),
  minimumLevelCheck: check('seasons_minimum_level_check', sql`${table.minimumLevel} >= 1`),
}));

export const playerProgress = pgTable('player_progress', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  level: integer('level').notNull().default(1),
  xp: integer('xp').notNull().default(0),
  totalFishCaught: integer('total_fish_caught').notNull().default(0),
  coins: bigint('coins', { mode: 'number' }).notNull().default(0),
  nets: integer('nets').notNull().default(10),
  luckMultiplierPower: integer('luck_multiplier_power').notNull().default(0),
  luckMultiplierExpiresAt: timestamp('luck_multiplier_expires_at', { withTimezone: true }),
  strengthMultiplierPower: integer('strength_multiplier_power').notNull().default(0),
  strengthMultiplierExpiresAt: timestamp('strength_multiplier_expires_at', { withTimezone: true }),
  unlockedLocations: text('unlocked_locations').array().notNull().default([]),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  levelCheck: check('player_progress_level_check', sql`${table.level} >= 1 AND ${table.level} <= 30`),
  xpCheck: check('player_progress_xp_check', sql`${table.xp} >= 0`),
  totalFishCaughtCheck: check('player_progress_total_fish_caught_check', sql`${table.totalFishCaught} >= 0`),
  coinsCheck: check('player_progress_coins_check', sql`${table.coins} >= 0`),
  netsCheck: check('player_progress_nets_check', sql`${table.nets} >= 0 AND ${table.nets} <= 10`),
  luckMultiplierPowerCheck: check('player_progress_luck_multiplier_power_check', sql`${table.luckMultiplierPower} IN (0, 2, 4)`),
  strengthMultiplierPowerCheck: check('player_progress_strength_multiplier_power_check', sql`${table.strengthMultiplierPower} IN (0, 2, 4)`),
}));

export const playerGameState = pgTable('player_game_state', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  state: jsonb('state').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  version: integer('version').notNull().default(1),
});

export const gameStateOperations = pgTable('game_state_operations', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  idempotencyKey: text('idempotency_key').notNull(),
  operation: text('operation').notNull(),
  result: jsonb('result').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ name: 'game_state_operations_idempotency_pk', columns: [t.userId, t.idempotencyKey, t.operation] }),
}));

export const warehouseFish = pgTable('warehouse_fish', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fishId: varchar('fish_id', { length: 120 }).notNull(),
  locationId: varchar('location_id', { length: 120 }).notNull(),
  weight: numeric('weight', { precision: 12, scale: 2 }).notNull(),
  xp: integer('xp').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  userIdIdx: index('warehouse_fish_user_id_idx').on(table.userId),
  weightCheck: check('warehouse_fish_weight_check', sql`${table.weight} > 0`),
  xpCheck: check('warehouse_fish_xp_check', sql`${table.xp} >= 0`),
}));

export const aquariumFish = pgTable('aquarium_fish', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fishId: varchar('fish_id', { length: 120 }).notNull(),
  locationId: varchar('location_id', { length: 120 }).notNull(),
  weight: numeric('weight', { precision: 12, scale: 2 }).notNull(),
  sector: integer('sector').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  userIdIdx: index('aquarium_fish_user_id_idx').on(table.userId),
  weightCheck: check('aquarium_fish_weight_check', sql`${table.weight} > 0`),
  sectorCheck: check('aquarium_fish_sector_check', sql`${table.sector} BETWEEN 1 AND 5`),
}));

export const emailOutbox = pgTable('email_outbox', {
  id: uuid('id').primaryKey(),
  kind: varchar('kind', { length: 40 }).notNull(),
  recipient: varchar('recipient', { length: 320 }).notNull(),
  locale: char('locale', { length: 2 }).notNull(),
  payload: jsonb('payload').$type<Record<string, string>>().notNull().default({}),
  challengeId: uuid('challenge_id'),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  sentAt: timestamp('sent_at', { withTimezone: true }),
}, table => ({
  statusCreatedAtIdx: index('email_outbox_status_created_at_idx').on(table.status, table.createdAt),
  recipientCreatedAtIdx: index('email_outbox_recipient_created_at_idx').on(table.recipient, table.createdAt),
  kindCheck: check('email_outbox_kind_check', sql`${table.kind} IN ('verify_email_code', 'login_code', 'password_reset_code', 'register_attempt_notice', 'code_expired_notice')`),
  statusCheck: check('email_outbox_status_check', sql`${table.status} IN ('pending', 'published', 'sent', 'failed')`),
}));

export const schema = {
  schemaMigrations,
  users,
  userProfiles,
  sessions,
  refreshTokens,
  fishingSessions,
  localSaveMigrations,
  seasons,
  playerProgress,
  playerGameState,
  gameStateOperations,
  warehouseFish,
  aquariumFish,
  emailOutbox,
};
