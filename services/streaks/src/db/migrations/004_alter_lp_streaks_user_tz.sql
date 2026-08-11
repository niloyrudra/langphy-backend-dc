-- ─────────────────────────────────────────────────────────────────────────
-- Per-user timezone on lp_streaks.
--
-- The streak service computes day boundaries in the user's local
-- timezone so that a German user practicing at 23:30 local does not
-- see their streak "reset" at 00:00 UTC.
--
-- Stored on the lp_streaks row at first write (consumer receives
-- timezone via user.registered.v1.payload.timezone). Defaults to
-- Europe/Berlin — the product's primary market.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE lp_streaks
    ADD COLUMN IF NOT EXISTS user_timezone TEXT NOT NULL DEFAULT 'Europe/Berlin';
