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
        const attemptId = await SessionAttemptRepo.insertOnce({
            userId: event.user_id,
            unitId: event.unit_id,
            session_type: event.session_type,
            session_key: event.session_key,
            score: event.score,
            attempts: event.attempts,
            total_duration_ms: event.total_duration_ms,
            completed_at: event.completed_at
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
            completed_at: event.completed_at
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