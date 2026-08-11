-- Create table to track daily reminder counts per user
CREATE TABLE IF NOT EXISTS lp_user_reminder_counts (
    user_id UUID NOT NULL,
    reminder_date DATE NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    last_reminder_at TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (user_id, reminder_date)
);

-- Create index for efficient lookup
CREATE INDEX IF NOT EXISTS idx_lp_user_reminder_counts_user_date 
ON lp_user_reminder_counts(user_id, reminder_date);