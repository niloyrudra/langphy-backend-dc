DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN duplicate_object THEN
    NULL; -- already exists, ignore
END
$$;

CREATE TABLE IF NOT EXISTS lp_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    theme TEXT DEFAULT 'light',
    sound_effect BOOLEAN DEFAULT true, 
    speaking_service BOOLEAN DEFAULT true,
    reading_service BOOLEAN DEFAULT true,
    listening_service BOOLEAN DEFAULT true,
    writing_service BOOLEAN DEFAULT true,
    practice_service BOOLEAN DEFAULT true,
    quiz_service BOOLEAN DEFAULT true,
    notifications BOOLEAN DEFAULT true,
    language TEXT DEFAULT 'en',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lp_settings_updated_at
BEFORE UPDATE ON lp_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();