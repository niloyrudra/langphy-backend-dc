import { pgPool } from "../db/index.js";

export interface UserSettings {
    id: string;
    user_id: string;
    theme: string;
    notifications: boolean;
    language: string;
    created_at: Date;
    updated_at: Date;
}

export interface SettingsData {
    user_id: string;
    theme?: string;
    sound_effect?: boolean;
    speaking_service?: boolean;
    reading_service?: boolean;
    writing_service?: boolean;
    listening_service?: boolean;
    practice_service?: boolean;
    quiz_service?: boolean;
    notifications?: boolean;
    language?: string;
}

export class SettingsModel {

    // Get settings
    static async getSettings(userId: string): Promise<UserSettings | null> {
        const result = await pgPool.query(
            `SELECT * FROM lp_settings WHERE user_id = $1`,
            [userId]
        );
        return result.rows[0] || null;
    }

    // Create settings
    static async createSettings(data: SettingsData): Promise<UserSettings> {
        try {
            const query = `
                INSERT INTO settings (
                    user_id,
                    theme,
                    language,
                    notifications,
                    sound_effect,
                    speaking_service,
                    reading_service,
                    listening_service,
                    writing_service,
                    practice_service,
                    quiz_service
                )
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
                ON CONFLICT (user_id)
                DO UPDATE SET
                    theme = EXCLUDED.theme,
                    language = EXCLUDED.language,
                    notifications = EXCLUDED.notifications,
                    sound_effect = EXCLUDED.sound_effect,
                    speaking_service = EXCLUDED.speaking_service,
                    reading_service = EXCLUDED.reading_service,
                    listening_service = EXCLUDED.listening_service,
                    writing_service = EXCLUDED.writing_service,
                    practice_service = EXCLUDED.practice_service,
                    quiz_service = EXCLUDED.quiz_service
                RETURNING *;
                `;

            const result = await pgPool.query(
                query,
                [
                    data.user_id,
                    data.theme,
                    data.language,
                    data.notifications,
                    data.sound_effect,
                    data.speaking_service,
                    data.reading_service,
                    data.listening_service,
                    data.writing_service,
                    data.practice_service,
                    data.quiz_service,
                ]
            );
            return result.rows[0];
        } catch (err: any) {
            // Handle unique user_id violation (duplicate row)
            if (err.code === "23505") {
                throw new Error("Settings already exist for this user.");
            }
            throw err;
        }
    }

    static async settingsIfNotExists(user_id: string): Promise<UserSettings | undefined> {
        try {
            const existing = await pgPool.query(
                `SELECT id FROM lp_settings WHERE user_id = $1`,
                [user_id]
            );

            if (existing && existing.rowCount! > 0) {
                return existing.rows[0];
            }
        }
        catch(err) {
            console.error("create user's settings error:", err);
            throw err;
        }
    }

    static async upsertUserSettings(user_id: string): Promise<UserSettings> {
        const result = await pgPool.query(`
            INSERT INTO lp_settings (user_id, language, theme)
            VALUES ($1, 'en', 'light')
            ON CONFLICT (user_id)
            DO UPDATE SET language = lp_settings.language, theme = lp_settings.theme
            RETURNING *;
        `, [user_id]);

        return result.rows[0];
    }

    static async createSettingsIfNotExists( user_id: string ): Promise<UserSettings> {
        try {
            const result = await pgPool.query(
                `
                INSERT INTO lp_settings (user_id, language, theme)
                VALUES ($1, 'en', 'light')
                ON CONFLICT (user_id) DO NOTHING
                RETURNING *
                `,
                [user_id]
            );
            return result.rows[0];
        } catch (err: any) {
            // Handle unique user_id violation (duplicate row)
            if (err.code === "23505") {
                throw new Error("Settings already exist for this user.");
            }
            throw err;
        }
    }

    static async deleteSettingsByUserId( user_id: string ): Promise<boolean> {
        try {
            const result = await pgPool.query(
                `
                DELETE FROM lp_settings WHERE user_id = $1
                `,
                [user_id]
            );
            return true;
        } catch (error: any) {
            // Handle unique user_id violation (duplicate row)
            console.error("deleteSettingsByUserId error:", error);
            return false;
        }
    }

    // Update settings
    static async updateSettings(userId: string, data: SettingsData): Promise<UserSettings> {
        try {
            const result = await pgPool.query(
                `UPDATE lp_settings
                 SET theme = COALESCE($1, theme),
                     speaking_service = COALESCE($2, speaking_service),
                     reading_service = COALESCE($3, reading_service),
                     writing_service = COALESCE($4, writing_service),
                     listening_service = COALESCE($5, listening_service),
                     practice_service = COALESCE($6, practice_service),
                     quiz_service = COALESCE($7, quiz_service),
                     sound_effect = COALESCE($8, sound_effect),
                     notifications = COALESCE($9, notifications),
                     language = COALESCE($10, language),
                     updated_at = now()
                 WHERE user_id = $11
                 RETURNING *`,
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
                    userId
                ]
            );
    
            if (!result.rows[0]) {
                throw new Error("Settings not found for this user.");
            }
    
            return result.rows[0];
        }
        catch(error) {
            console.error("updateSettings error:", error);
            throw error;
        }
    }
}