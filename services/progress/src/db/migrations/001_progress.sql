DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN duplicate_object THEN
    NULL; -- already exists, ignore
END
$$;

CREATE TABLE IF NOT EXISTS lp_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    user_id UUID NOT NULL,
    content_type TEXT NOT NULL, -- quiz | lesson | practice
    content_id TEXT NOT NULL,
    
    session_key TEXT NOT NULL,
    lesson_order INTEGER NOT NULL DEFAULT 0,

    completed BOOLEAN DEFAULT false,
    progress_percent INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    UNIQUE (user_id, content_type, content_id)
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lp_progress_updated_at
BEFORE UPDATE ON lp_progress
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();