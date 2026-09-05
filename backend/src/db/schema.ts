import { pgTable, timestamp, uuid, varchar, text, char, uniqueIndex, integer, bigint, numeric } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: varchar('email', { length: 320 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  status: varchar('status', { length: 32 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  emailUnique: uniqueIndex('users_email_unique').on(table.email),
}));

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  username: varchar('username', { length: 20 }).notNull(),
  country: char('country', { length: 2 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  usernameUnique: uniqueIndex('user_profiles_username_unique').on(table.username),
}));

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  refreshTokenHash: text('refresh_token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fishingSessions = pgTable('fishing_sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  locationId: varchar('location_id', { length: 120 }).notNull(),
  rulesetVersion: varchar('ruleset_version', { length: 64 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('open'),
  idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  resultFishId: varchar('result_fish_id', { length: 120 }),
  resultWeight: numeric('result_weight', { precision: 12, scale: 2 }),
  resultXp: integer('result_xp'),
}, table => ({
  idempotencyUnique: uniqueIndex('fishing_sessions_idempotency_unique').on(table.userId, table.idempotencyKey),
}));

export const localSaveMigrations = pgTable('local_save_migrations', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  sourceVersion: integer('source_version').notNull(),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  userUnique: uniqueIndex('local_save_migrations_user_unique').on(table.userId),
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
});

export const wallets = pgTable('wallets', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  balance: bigint('balance', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const walletTransactions = pgTable('wallet_transactions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  balanceAfter: bigint('balance_after', { mode: 'number' }).notNull(),
  reason: varchar('reason', { length: 64 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const warehouseFish = pgTable('warehouse_fish', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fishId: varchar('fish_id', { length: 120 }).notNull(),
  locationId: varchar('location_id', { length: 120 }).notNull(),
  weight: numeric('weight', { precision: 12, scale: 2 }).notNull(),
  xp: integer('xp').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const aquariumFish = pgTable('aquarium_fish', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fishId: varchar('fish_id', { length: 120 }).notNull(),
  locationId: varchar('location_id', { length: 120 }).notNull(),
  weight: numeric('weight', { precision: 12, scale: 2 }).notNull(),
  sector: integer('sector').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const schema = { users, userProfiles, sessions, fishingSessions, localSaveMigrations, playerProgress, wallets, walletTransactions, warehouseFish, aquariumFish };
