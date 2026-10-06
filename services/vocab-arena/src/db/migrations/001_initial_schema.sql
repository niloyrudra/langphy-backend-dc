-- 001_initial_schema.sql
-- Vocab Arena initial database schema

-- Idempotency tracking for Kafka consumer
CREATE TABLE IF NOT EXISTS event_inbox (
    event_id      UUID PRIMARY KEY,
    event_type    TEXT NOT NULL,
    event_version INTEGER NOT NULL,
    user_id       UUID NOT NULL,
    occurred_at   TIMESTAMPTZ NOT NULL,
    payload       JSONB NOT NULL
);

-- Tombstones for deleted users (GDPR / account deletion)
CREATE TABLE IF NOT EXISTS deleted_users (
    user_id     UUID PRIMARY KEY,
    deleted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User's spaced-repetition schedule per lemma
CREATE TABLE IF NOT EXISTS srs_schedule (
    user_id       UUID NOT NULL,
    lemma         TEXT NOT NULL,
    pos           TEXT,
    meaning_en    TEXT,
    ease_factor   REAL NOT NULL DEFAULT 2.5,
    interval_days INTEGER NOT NULL DEFAULT 0,
    repetitions   INTEGER NOT NULL DEFAULT 0,
    next_review   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_review   TIMESTAMPTZ,
    last_grade    SMALLINT,
    PRIMARY KEY (user_id, lemma)
);

-- Index for efficient due-word queries
CREATE INDEX IF NOT EXISTS idx_srs_schedule_next_review
    ON srs_schedule (next_review)
    WHERE next_review <= NOW();

-- Gamification meta
CREATE TABLE IF NOT EXISTS user_game_profile (
    user_id           UUID PRIMARY KEY,
    xp                INTEGER NOT NULL DEFAULT 0,
    level             INTEGER NOT NULL DEFAULT 1,
    current_streak    INTEGER NOT NULL DEFAULT 0,
    longest_streak    INTEGER NOT NULL DEFAULT 0,
    last_session_date DATE,
    total_words_learned INTEGER NOT NULL DEFAULT 0,
    total_sessions    INTEGER NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Achievements (extensible)
CREATE TABLE IF NOT EXISTS achievement_def (
    code        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT,
    xp_reward   INTEGER NOT NULL DEFAULT 0,
    icon        TEXT
);

-- Pre-seed base achievements
INSERT INTO achievement_def (code, name, description, xp_reward, icon) VALUES
    ('first_session', 'First Steps', 'Complete your first vocabulary session', 50, '🎯'),
    ('first_50', 'Word Collector', 'Learn 50 unique words', 200, '📚'),
    ('first_100', 'Vocabulary Builder', 'Learn 100 unique words', 500, '📖'),
    ('first_500', 'Polyglot in Training', 'Learn 500 unique words', 2000, '🌍'),
    ('streak_3', 'Three-Peat', 'Maintain a 3-day streak', 100, '🔥'),
    ('streak_7', 'Week Warrior', 'Maintain a 7-day streak', 300, '🔥🔥'),
    ('streak_30', 'Monthly Master', 'Maintain a 30-day streak', 1000, '🔥🔥🔥'),
    ('perfect_session', 'Perfectionist', 'Complete a session with 100% accuracy', 200, '⭐'),
    ('night_owl', 'Night Owl', 'Complete a session after 10 PM', 100, '🦉'),
    ('early_bird', 'Early Bird', 'Complete a session before 7 AM', 100, '🐦'),
    ('speed_demon', 'Speed Demon', 'Complete 10 words in under 60 seconds', 300, '⚡'),
    ('comeback_kid', 'Comeback Kid', 'Resume a streak after a break', 200, '🔄')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS user_achievement (
    user_id       UUID NOT NULL REFERENCES user_game_profile(user_id) ON DELETE CASCADE,
    code          TEXT NOT NULL REFERENCES achievement_def(code) ON DELETE CASCADE,
    unlocked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, code)
);

-- Session log for analytics
CREATE TABLE IF NOT EXISTS vocab_session (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES user_game_profile(user_id) ON DELETE CASCADE,
    mode          TEXT NOT NULL,
    words_total   INTEGER NOT NULL,
    words_correct INTEGER NOT NULL,
    duration_ms   INTEGER NOT NULL,
    xp_earned     INTEGER NOT NULL,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_vocab_session_user_id
    ON vocab_session (user_id);

CREATE INDEX IF NOT EXISTS idx_vocab_session_started_at
    ON vocab_session (started_at);