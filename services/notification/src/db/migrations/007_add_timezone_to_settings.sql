-- Add timezone column to lp_settings table for per-user timezone support
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'lp_settings' AND column_name = 'timezone'
    ) THEN
        ALTER TABLE lp_settings 
        ADD COLUMN timezone TEXT DEFAULT 'UTC';
    END IF;
END
$$;

-- Update existing rows to have a default timezone if NULL
UPDATE lp_settings 
SET timezone = 'UTC' 
WHERE timezone IS NULL;