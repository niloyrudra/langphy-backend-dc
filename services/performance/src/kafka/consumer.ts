import { handleSessionCompleted } from "../services/performance.service.js";
import { EventIndexModel } from "../models/eventIndex.model.js";
import { kafka } from "./kafka.client.js";
import { SessionCompletedEventSchema, TOPICS, UserDeletedEventSchema } from "@langphy/shared";
// import { producer } from "./producer.js";
import { SessionPerformanceRepo } from "../repos/sessionPerformance.repo.js";
import { SessionAttemptRepo } from "../repos/attempt.repo.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";

const consumer = kafka.consumer({
    groupId: `${process.env.SERVICE_NAME}-group`
});

export const initConsumer = async () => {
    await consumer.connect();
    
    await consumer.subscribe({
        topic: TOPICS.SESSION_COMPLETED,
        fromBeginning: false
    });
    
    await consumer.subscribe({
        topic: TOPICS.USER_DELETED,
        fromBeginning: false
    });

    await consumer.run({
        eachMessage: async ({ topic, message }) => {
            if( !message.value ) return;

            const rawData = JSON.parse( message.value.toString() );

            if( topic === TOPICS.SESSION_COMPLETED ) {    
                const event = SessionCompletedEventSchema.parse(rawData);
                
                const existing = await EventIndexModel.exists( event.event_id );
                if(existing) return;
                if(await DeletedUsersRepo.exists( event.user_id )) return;

                const result = await handleSessionCompleted({
                    user_id: event.user_id,
                    unit_id: event.payload.unit_id,
                    session_type: event.payload.session_type,
                    session_key: event.payload.session_key,
                    score: event.payload.score ?? 0,
                    attempts: event.payload.attempts ?? 0,
                    total_duration_ms: event.payload.total_duration_ms,
                    completed_at: event.payload.completed_at,
                });

                if(result.updated) {
                    // await producer?.send({
                    //     topic: TOPICS.PERFORMANCE_UPDATED,
                    //     messages: [{
                    //         key: event.user_id,
                    //         value: JSON.stringify({
                    //             event_type: "performance.updated",
                    //             payload: event.payload
                    //         }),
                    //     }],
                    // });
                }

                await EventIndexModel.markProcessed(event);
            }

            if ( topic === TOPICS.USER_DELETED ) {
                const event = UserDeletedEventSchema.parse( rawData );
                try {
                    if ( await EventIndexModel.exists( event.event_id ) ) return;

                    await DeletedUsersRepo.insert( event.user_id );

                    await SessionPerformanceRepo.deleteSessionPerformanceByUserId( event.user_id );
                    await SessionAttemptRepo.deleteSessionAttemptsByUserId( event.user_id );

                    await EventIndexModel.markProcessed( event );

                    console.log( "🗑 Session Performance deleted for:", event.user_id );
                }
                catch(err) {
                    console.error( "Session Performance deletion failed:", err );
                }
            }

        }
    });
};

export const stopConsumer = async () => {
  await consumer.disconnect();
};