CREATE TABLE IF NOT EXISTS deleted_users (
    user_id UUID PRIMARY KEY,
    deleted_at TIMESTAMP NOT NULL
);