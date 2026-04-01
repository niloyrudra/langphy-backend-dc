import { LessonCompletedEventSchema, TOPICS, UserDeletedEventSchema } from "@langphy/shared";
import { kafka } from "./kafka.client.js"
import { EventIndexModel } from "../models/eventIndex.model.js";
import { producer } from "./producer.js";
import { ProgressRepo } from "../repos/progress.repo.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";

const consumer = kafka.consumer({
    groupId: process.env.SERVICE_NAME + '-group'
});

export const initConsumer = async () => {
    await consumer.connect();

    await consumer.subscribe({
        topic: TOPICS.LESSON_COMPLETED,
        fromBeginning: false
    });

    // ✅ FIX: removed PROGRESS_UPDATED subscription — was circular.
    // Progress produces PROGRESS_UPDATED but must NOT consume it.
    // await consumer.subscribe({
    //     topic: TOPICS.PROGRESS_UPDATED,
    //     fromBeginning: false
    // });

    await consumer.subscribe({
        topic: TOPICS.USER_DELETED,
        fromBeginning: false
    });

    await consumer.run({
        eachMessage: async ({topic, message}) => {
            if(!message.value) return;

            const raw = JSON.parse( message.value!.toString() );

            if( topic === TOPICS.LESSON_COMPLETED ) {               
                const event = LessonCompletedEventSchema.parse( raw );
            
                // 1️⃣ Idempotency
                if( await EventIndexModel.exists( event.event_id ) ) return;
                if( await DeletedUsersRepo.exists( event.user_id ) ) return;

                // 2️⃣ Apply Progress logic
                const result = await ProgressRepo.applyActivity( {
                    category_id: event.payload.category_id,
                    unit_id: event.payload.unit_id,
                    user_id: event.user_id,
                    content_type: event.payload.session_type, // "quiz" | "practice" | "reading" | "writing" | "speaking" | "listening"
                    content_id: event.payload.lesson_id,
                    session_key: event.payload.session_key,
                    lesson_order: event.payload.lesson_order,
                    completed: event.payload.completed,
                    score: event.payload.score ?? 0,
                    duration_ms: event.payload.duration_ms,
                    progress_percent: event.payload.progress_percent
                } ); 

                // 3️⃣ Emit only if meaningful change
                if (result.updated) {
                    await producer?.send({
                        topic: TOPICS.PROGRESS_UPDATED,
                        messages: [
                            {
                                key: event.user_id,
                                value: JSON.stringify({
                                    event_id: crypto.randomUUID(),
                                    event_type: "progress.updated.v1",
                                    event_version: 1,
                                    occurred_at: event.occurred_at,
                                    user_id: event.user_id,
                                    payload: result.progress,
                                }),
                            },
                        ],
                    });
                }

                // 4️⃣ Mark processed
                await EventIndexModel.markProcessed({
                    event_id: event.event_id,
                    event_type: event.event_type,
                    event_version: event.event_version,
                    user_id: event.user_id,
                    occurred_at: event.occurred_at,
                    payload: event,
                });
            }

            if ( topic === TOPICS.USER_DELETED ) {
                const event = UserDeletedEventSchema.parse( raw );
                try {
                    if ( await EventIndexModel.exists( event.event_id ) ) return;
                    await DeletedUsersRepo.insert( event.user_id );
                    await ProgressRepo.deleteProgress( event.user_id );
                    await EventIndexModel.markProcessed( event );

                    console.log( "🗑 Progress deleted for:", event.user_id );
                }
                catch(err) {
                    console.error( "Progress deletion failed:", err );
                }
            }

        }
    });

}