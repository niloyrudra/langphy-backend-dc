DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN duplicate_object THEN
    NULL; -- already exists, ignore
END
$$;

CREATE TABLE IF NOT EXISTS lp_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    provider TEXT NOT NULL, -- email | google | apple | etc

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    CONSTRAINT lp_users_email_not_empty CHECK (length(email) > 0)
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lp_users_updated_at
BEFORE UPDATE ON lp_users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();