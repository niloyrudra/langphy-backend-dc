CREATE TABLE IF NOT EXISTS lp_session_performance (
    user_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    session_type TEXT NOT NULL, -- practice | quiz | listening | speaking | reading | writing
    session_key TEXT NOT NULL,
  
    score INT NOT NULL,
    attempts INT NOT NULL,
    total_duration_ms INT NOT NULL,

    completed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, session_key, session_type)
);