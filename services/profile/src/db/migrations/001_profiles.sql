DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN duplicate_object THEN
    NULL; -- already exists, ignore
END
$$;

CREATE TABLE IF NOT EXISTS lp_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    username TEXT UNIQUE,
    first_name TEXT,
    last_name TEXT,
    profile_image TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    CONSTRAINT lp_profiles_username_not_empty
        CHECK (username IS NULL OR length(username) > 0)
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lp_profiles_updated_at
BEFORE UPDATE ON lp_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();