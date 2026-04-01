CREATE TABLE IF NOT EXISTS lp_event_inbox (
    event_id UUID PRIMARY KEY,
    event_type TEXT NOT NULL,
    event_version INT NOT NULL,
    user_id UUID NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);