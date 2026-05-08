import { SessionAttemptRepo } from "../repos/attempt.repo.js";
import { SessionPerformanceRepo } from "../repos/sessionPerformance.repo.js";

interface SessionCompletedEvent {
    user_id: string;
    unit_id: string;
    session_type: string;
    session_key: string;
    score: number;
    attempts: number;
    total_duration_ms: number;
    completed_at: number;
};

export const handleSessionCompleted = async ( event: SessionCompletedEvent ) => {
    try {
        const completedAt = normalizeTimestamp(event.completed_at).toISOString();
        const attemptId = await SessionAttemptRepo.insertOnce({
            userId: event.user_id,
            unitId: event.unit_id,
            session_type: event.session_type,
            session_key: event.session_key,
            score: event.score,
            attempts: event.attempts,
            total_duration_ms: event.total_duration_ms,
            completed_at: completedAt
        });

        // Retry -> do nothing
        if( !attemptId ) return { updated: false };

        // New Completion or redo -> replace performance
        await SessionPerformanceRepo.upsert({
            userId: event.user_id,
            unitId: event.unit_id,
            session_type: event.session_type,
            session_key: event.session_key,
            score: event.score,
            attempts: event.attempts,
            total_duration_ms: event.total_duration_ms,
            completed_at: completedAt
        });

        return {
            updated: true
        };

    }
    catch(error) {
        console.error("Performance Service handleSessionCompleted error:", error);
        return { updated: false };
    }
}

export const normalizeTimestamp = (
    value?: string | number | Date | null
): Date => {
    if (!value) {
        return new Date();
    }

    // Already a Date
    if (value instanceof Date) {
        return value;
    }

    // Numeric timestamp
    if (typeof value === 'number') {
        // seconds -> milliseconds
        if (value < 1000000000000) {
            return new Date(value * 1000);
        }

        return new Date(value);
    }

    // Numeric string
    if (/^\d+$/.test(value)) {
        const num = Number(value);

        // seconds
        if (num < 1000000000000) {
            return new Date(num * 1000);
        }

        // milliseconds
        return new Date(num);
    }

    // ISO string
    return new Date(value);
};