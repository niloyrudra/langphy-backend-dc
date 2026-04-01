CREATE TABLE IF NOT EXISTS lp_user_daily_activity (
    user_id UUID PRIMARY KEY,
    last_activity_date DATE NOT NULL
);