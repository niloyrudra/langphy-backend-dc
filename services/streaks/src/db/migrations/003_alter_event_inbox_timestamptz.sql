-- ─────────────────────────────────────────────────────────────────────────
-- Bring event_inbox.occurred_at in line with auth's schema
-- (TIMESTAMP WITH TIME ZONE). The original migration
-- (003_event_index.sql) used TIMESTAMP WITHOUT TIME ZONE which loses
-- information when the producer serializes occurred_at as an ISO 8601
-- string with offset.
--
-- Idempotent: only runs the ALTER if the column is still naive. Safe
-- to re-apply.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'event_inbox'
          AND column_name = 'occurred_at'
          AND data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE event_inbox
            ALTER COLUMN occurred_at TYPE TIMESTAMP WITH TIME ZONE
            USING occurred_at AT TIME ZONE 'UTC';
    END IF;
END
$$;
