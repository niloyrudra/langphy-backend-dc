import { pgPool } from "../db/index.js";

export interface VocabularyWord {
    word: string;
    lemma: string;
    pos: string;
    meaning_en: string | null;
    unit_id: string | null;
    category_id: string | null;
}

export class VocabularyModel {

    /**
     * Bulk upsert words for a user.
     * ON CONFLICT (user_id, lemma) DO NOTHING — same lemma never
     * duplicated, re-syncing the same words is safe.
     * Returns the count of NEW rows actually inserted.
     */
    static async bulkUpsert(
        userId: string,
        words: VocabularyWord[]
    ): Promise<number> {
        if (!words.length) return 0;

        const client = await pgPool.connect();
        let inserted = 0;

        try {
            await client.query("BEGIN");

            for (const w of words) {
                const result = await client.query(
                    `
                    INSERT INTO lp_vocabulary
                        (user_id, word, lemma, pos, meaning_en, unit_id, category_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (user_id, lemma) DO NOTHING
                    `,
                    [
                        userId,
                        w.word,
                        w.lemma,
                        w.pos,
                        w.meaning_en ?? null,
                        w.unit_id ?? null,
                        w.category_id ?? null,
                    ]
                );
                inserted += result.rowCount ?? 0;
            }

            await client.query("COMMIT");
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }

        return inserted;
    }

    static async getCountByUser(userId: string): Promise<number> {
        const result = await pgPool.query(
            `SELECT COUNT(*) AS count FROM lp_vocabulary WHERE user_id = $1`,
            [userId]
        );
        return parseInt(result.rows[0]?.count ?? "0", 10);
    }

    static async getAllByUser(userId: string) {
        const result = await pgPool.query(
            `SELECT * FROM lp_vocabulary WHERE user_id = $1 ORDER BY learned_at DESC`,
            [userId]
        );
        return result.rows;
    }

    static async deleteByUserId(userId: string) {
        return await pgPool.query(
            `DELETE FROM lp_vocabulary WHERE user_id = $1`,
            [userId]
        );
    }
}