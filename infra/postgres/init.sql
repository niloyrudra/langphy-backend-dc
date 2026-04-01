-- ═══════════════════════════════════════════════════════════════════════════
-- Langphy PostgreSQL init script
-- Creates all 9 databases at first boot.
-- Runs automatically when the postgres container starts with an empty volume.
-- ═══════════════════════════════════════════════════════════════════════════

-- auth database already created as POSTGRES_DB default

CREATE DATABASE langphy_streaks;
CREATE DATABASE langphy_progress;
CREATE DATABASE langphy_performance;
CREATE DATABASE langphy_profile;
CREATE DATABASE langphy_settings;
-- CREATE DATABASE langphy_achievements;
CREATE DATABASE langphy_notification;
CREATE DATABASE langphy_gateway;

-- Grant the admin user access to all databases
GRANT ALL PRIVILEGES ON DATABASE langphy_auth TO langphy_admin;
GRANT ALL PRIVILEGES ON DATABASE langphy_streaks TO langphy_admin;
GRANT ALL PRIVILEGES ON DATABASE langphy_progress TO langphy_admin;
GRANT ALL PRIVILEGES ON DATABASE langphy_performance TO langphy_admin;
GRANT ALL PRIVILEGES ON DATABASE langphy_profile TO langphy_admin;
GRANT ALL PRIVILEGES ON DATABASE langphy_settings TO langphy_admin;
-- GRANT ALL PRIVILEGES ON DATABASE langphy_achievements TO langphy_admin;
GRANT ALL PRIVILEGES ON DATABASE langphy_notification TO langphy_admin;
GRANT ALL PRIVILEGES ON DATABASE langphy_gateway TO langphy_admin;