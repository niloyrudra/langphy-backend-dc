import { pgPool } from "../db/index.js";

export interface StreakMilestone {
    days: number;
    label: string;
    sort_order: number;
}

/**
 * Data access for lp_streak_milestones. Today Read-only by the service;
 * upsert is here for the ("PM eddies via psql") use case + future
 * /admin endpoint.
 */
export class StreakMilestonesModel {
    static async getMilestones(): Promise<StreakMilestone[]> {
        const result = await pgPool.query<StreakMilestone>(
            `SELECT days, label, sort_order
             FROM lp_streak_milestones
             ORDER BY sort_order ASC`,
        );
        return result.rows;
    }

    static async upsert(
        days: number,
        label: string,
        sortOrder: number,
    ): Promise<void> {
        await pgPool.query(
            `INSERT INTO lp_streak_milestones (days, label, sort_order)
             VALUES ($1, $2, $3)
             ON CONFLICT (days) DO UPDATE
             SET label = EXCLUDED.label,
                 sort_order = EXCLUDED.sort_order`,
            [days, label, sortOrder],
        );
    }

    static async delete(days: number): Promise<boolean> {
        const result = await pgPool.query(
            `DELETE FROM lp_streak_milestones WHERE days = $1`,
            [days],
        );
        return (result.rowCount ?? 0) > 0;
    }
}
