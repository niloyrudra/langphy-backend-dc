import { pgPool } from "../db/index.js";

type LessonType =
  | "quiz"
  | "practice"
  | "reading"
  | "writing"
  | "speaking"
  | "listening";

export class PerformanceModel {

    static async upsertUser(userId: string) {
        await pgPool.query(
            `
            INSERT INTO lp_session_performance (user_id)
            VALUES ($1)
            ON CONFLICT (user_id) DO NOTHING
            `,
            [userId]
        );
    }

    static async applyLessonCompeted(input: {
        userId: string;
        lessonType: string;
        score: number;
        durationMs: number;
    }) {
        await pgPool.query(
            `
            UPDATE lp_performance
            SET
            total_lessons_completed = total_lessons_completed + 1,
            total_duration_ms = total_duration_ms + $2,
            ${input.lessonType}_completed = ${input.lessonType}_completed + 1,
            ${input.lessonType}_score_count = ${input.lessonType}_score_count + 1,
            avg_${input.lessonType}_score =
                ((COALESCE(avg_${input.lessonType}_score, 0)
                * (${input.lessonType}_score_count))
                + $3)
                / (${input.lessonType}_score_count + 1),
            updated_at = now()
            WHERE user_id = $1
            `,
            [input.userId, input.durationMs, input.score]
        );
    }

    static async updateOnCompletion(
        userId: string,
        lessonType: LessonType,
        score?: number
    ) {
        await this.upsertUser(userId);

        const incrementColumn = `${lessonType}_completed`;

        let scoreUpdateSQL = "";
        const values: any[] = [userId];

        if (lessonType === "quiz" && score !== undefined) {
            scoreUpdateSQL = `
                , avg_quiz_score =
                    ((COALESCE(avg_quiz_score, 0) * quiz_score_count) + $2)
                    / (quiz_score_count + 1),
                quiz_score_count = quiz_score_count + 1
            `;
            values.push(score);
        }

        if (lessonType === "speaking" && score !== undefined) {
            scoreUpdateSQL = `
                , avg_speaking_score =
                    ((COALESCE(avg_speaking_score, 0) * speaking_score_count) + $2)
                    / (speaking_score_count + 1),
                speaking_score_count = speaking_score_count + 1
            `;
            values.push(score);
        }

        if (lessonType === "listening" && score !== undefined) {
            scoreUpdateSQL = `
                , avg_listening_score =
                    ((COALESCE(avg_listening_score, 0) * listening_score_count) + $2)
                    / (listening_score_count + 1),
                listening_score_count = listening_score_count + 1
            `;
            values.push(score);
        }

        if (lessonType === "writing" && score !== undefined) {
            scoreUpdateSQL = `
                , avg_writing_score =
                    ((COALESCE(avg_writing_score, 0) * writing_score_count) + $2)
                    / (writing_score_count + 1),
                writing_score_count = writing_score_count + 1
            `;
            values.push(score);
        }

        await pgPool.query(
            `
            UPDATE lp_session_performance
            SET
                total_lessons_completed = total_lessons_completed + 1,
                ${incrementColumn} = ${incrementColumn} + 1,
                updated_at = now()
                ${scoreUpdateSQL}
            WHERE user_id = $1
            `,
            values
        );
    }

    static async getSummary(userId: string) {
        const res = await pgPool.query(
            `SELECT * FROM lp_session_performance WHERE user_id = $1`,
            [userId]
        );

        return res.rows[0] ?? null;
    }

    static async deletePerformanceByUserId(userId: string) {
        try {
            return await pgPool.query(
                `DELETE FROM lp_session_performance WHERE user_id = $1`,
                [userId]
            );
        }
        catch(error) {
            console.error("deletePerformanceByUserId error:", error);
            return false;
        }
    }
}