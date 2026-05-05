DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN duplicate_object THEN
    NULL; -- already exists, ignore
END
$$;

CREATE TABLE IF NOT EXISTS lp_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type TEXT NOT NULL, -- notification.created.v1
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read BOOLEAN DEFAULT false,
    data JSON,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

    -- UNIQUE(user_id) -- INDEX(user_id)
);