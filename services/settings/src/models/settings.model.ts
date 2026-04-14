import { pgPool } from "../db/index.js";

/**
 * Single source of truth for the lp_settings row shape.
 * Matches the PostgreSQL schema exactly — every column is represented.
 * Previously UserSettings was missing the service toggle fields, causing
 * the client to receive undefined for them and silently overwrite
 * the user's real preferences with false/0 on every sync.
 */
export interface UserSettings {
    id:                string;
    user_id:           string;
    theme:             string;
    sound_effect:      boolean;
    speaking_service:  boolean;
    reading_service:   boolean;
    listening_service: boolean;
    writing_service:   boolean;
    practice_service:  boolean;
    quiz_service:      boolean;
    notifications:     boolean;
    language:          string;
    created_at:        Date;
    updated_at:        Date;
}

export interface SettingsData {
    user_id?:           string;
    theme?:             string;
    sound_effect?:      boolean;
    speaking_service?:  boolean;
    reading_service?:   boolean;
    writing_service?:   boolean;
    listening_service?: boolean;
    practice_service?:  boolean;
    quiz_service?:      boolean;
    notifications?:     boolean;
    language?:          string;
}

export class SettingsModel {

    static async getSettings(userId: string): Promise<UserSettings | null> {
        const result = await pgPool.query(
            `SELECT * FROM lp_settings WHERE user_id = $1`,
            [userId]
        );
        return result.rows[0] ?? null;
    }

    /**
     * Called by the Kafka USER_REGISTERED consumer to seed default settings.
     * Uses ON CONFLICT DO NOTHING so re-processing the same event is safe.
     */
    static async createSettingsIfNotExists(user_id: string): Promise<UserSettings | null> {
        const result = await pgPool.query(
            `
            INSERT INTO lp_settings (user_id, language, theme)
            VALUES ($1, 'en', 'dark')
            ON CONFLICT (user_id) DO NOTHING
            RETURNING *
            `,
            [user_id]
        );
        return result.rows[0] ?? null;
    }

    static async updateSettings(userId: string, data: SettingsData): Promise<UserSettings> {
        const result = await pgPool.query(
            `
            UPDATE lp_settings
            SET
                theme             = COALESCE($1,  theme),
                speaking_service  = COALESCE($2,  speaking_service),
                reading_service   = COALESCE($3,  reading_service),
                writing_service   = COALESCE($4,  writing_service),
                listening_service = COALESCE($5,  listening_service),
                practice_service  = COALESCE($6,  practice_service),
                quiz_service      = COALESCE($7,  quiz_service),
                sound_effect      = COALESCE($8,  sound_effect),
                notifications     = COALESCE($9,  notifications),
                language          = COALESCE($10, language),
                updated_at        = now()
            WHERE user_id = $11
            RETURNING *
            `,
            [
                data.theme,
                data.speaking_service,
                data.reading_service,
                data.writing_service,
                data.listening_service,
                data.practice_service,
                data.quiz_service,
                data.sound_effect,
                data.notifications,
                data.language,
                userId,
            ]
        );

        if (!result.rows[0]) {
            throw new Error("Settings not found for this user.");
        }

        return result.rows[0];
    }

    static async deleteSettingsByUserId(user_id: string): Promise<boolean> {
        try {
            await pgPool.query(
                `DELETE FROM lp_settings WHERE user_id = $1`,
                [user_id]
            );
            return true;
        } catch (error) {
            console.error("deleteSettingsByUserId error:", error);
            return false;
        }
    }
}