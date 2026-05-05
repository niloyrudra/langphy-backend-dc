-- Drop the incorrect unique constraint (allows only 1 notification per user)
ALTER TABLE lp_notifications DROP CONSTRAINT IF EXISTS lp_notifications_user_id_key;

-- Add a plain index for fast lookups by user_id (no uniqueness enforced)
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON lp_notifications(user_id);