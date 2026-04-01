CREATE TABLE IF NOT EXISTS lp_session_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    session_type TEXT NOT NULL,             -- practice | quiz | listening | speaking | reading | writing
    session_key TEXT NOT NULL,              -- unit123:listening:attemptUUID

    score INTEGER NOT NULL,
    attempts INTEGER NOT NULL,
    total_duration_ms INTEGER NOT NULL,

    occurred_at BIGINT NOT NULL,            -- TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),   -- TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    UNIQUE (user_id, session_key)
);