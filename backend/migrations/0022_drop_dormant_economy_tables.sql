-- Task 10.3 slice 8: economy, inventory and the standalone daily-reward-claim
-- route were superseded by the player_game_state blob back in slices 1-6c and
-- have had no reader since. wallets/wallet_transactions/daily_reward_claims
-- have no remaining referrer anywhere in the codebase (player_progress,
-- warehouse_fish and aquarium_fish stay: the local-save migration import path
-- still uses them).
DROP TABLE IF EXISTS wallet_transactions;
DROP TABLE IF EXISTS wallets;
DROP TABLE IF EXISTS daily_reward_claims;
