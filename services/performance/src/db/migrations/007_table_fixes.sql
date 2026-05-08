ALTER TABLE lp_session_attempts
ALTER COLUMN occurred_at
TYPE TIMESTAMPTZ
USING to_timestamp(occurred_at / 1000.0);

ALTER TABLE event_inbox
ALTER COLUMN occurred_at
TYPE TIMESTAMPTZ
USING occurred_at AT TIME ZONE 'UTC';

ALTER TABLE event_inbox
ALTER COLUMN processed_at
TYPE TIMESTAMPTZ
USING processed_at AT TIME ZONE 'UTC';

ALTER TABLE deleted_users
ALTER COLUMN deleted_at
TYPE TIMESTAMPTZ
USING deleted_at AT TIME ZONE 'UTC';