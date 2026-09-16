ALTER TABLE lp_users
  ADD COLUMN IF NOT EXISTS provider_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lp_users_provider_user_id
  ON lp_users (provider, provider_user_id)
  WHERE provider_user_id IS NOT NULL;