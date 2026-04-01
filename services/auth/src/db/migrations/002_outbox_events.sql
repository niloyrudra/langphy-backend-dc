CREATE TABLE IF NOT EXISTS outbox_events (
  id UUID PRIMARY KEY,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  occurred_at TIMESTAMP NOT NULL,
  published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMP NULL,
  retry_count INT DEFAULT 0
);

CREATE INDEX idx_outbox_unpublished
ON outbox_events (published)
WHERE published = false;

CREATE TABLE IF NOT EXISTS processed_events (
  event_id UUID PRIMARY KEY,
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);