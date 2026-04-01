CREATE TABLE IF NOT EXISTS event_inbox (
  event_id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_version INT NOT NULL,
  user_id UUID NOT NULL,
  occurred_at TIMESTAMP NOT NULL,
  processed_at TIMESTAMP DEFAULT NOW(),
  payload JSONB NOT NULL
);