-- ─────────────────────────────────────────────────────────────────────────
-- Streak celebration milestones.
--
-- The streak service emits `celebration: "streak_7"` etc. when a user
-- reaches a milestone. The set of milestones was previously hardcoded in
-- services/streaks/src/repos/streaks.repo.ts (1, 3, 7, 14, 21, 30, 50,
-- 100). This table makes the list PM-editable without a redeploy.
--
-- `sort_order` is the order the client should display milestones; `days`
-- is the trigger threshold. Both must be unique to make the table
-- queryable by either dimension.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS lp_streak_milestones (
    days       INT  PRIMARY KEY CHECK (days > 0),
    label      TEXT NOT NULL UNIQUE,
    sort_order INT  NOT NULL UNIQUE
);

-- Seed the milestones that match the previous hardcoded list, minus
-- the dropped 21 (per the current product decision — milestone gaps
-- should not be smaller than 7 days once the streak is "real"). The
-- PM can add or remove rows in subsequent migrations or directly via
-- psql.
INSERT INTO lp_streak_milestones (days, label, sort_order) VALUES
    (1,   'streak_1',   1),
    (3,   'streak_3',   2),
    (7,   'streak_7',   3),
    (14,  'streak_14',  4),
    (30,  'streak_30',  5),
    (50,  'streak_50',  6),
    (100, 'streak_100', 7)
ON CONFLICT (days) DO NOTHING;
