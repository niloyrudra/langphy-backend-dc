import { v4 as uuid } from "uuid";
import { kafka } from "./kafka.client.js";
import { producer } from "./producer.js";
import { connectWithRetry, SessionCompletedEventSchema, TOPICS, UserDeletedEventSchema } from "@langphy/shared";
import { EventIndexModel } from "../models/eventIndex.model.js";
import { StreakRepo } from "../repos/streaks.repo.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";

const serviceName = process.env.SERVICE_NAME! ? process.env.SERVICE_NAME : 'streaks-service';
const consumerGroupId = serviceName + '-group';

export const consumer = kafka.consumer({
    groupId: consumerGroupId,
    sessionTimeout: 30000, // 30 seconds — adjust based on expected processing time
    heartbeatInterval: 3000, // 3 seconds — should be less than sessionTimeout
    // maxWaitTimeInMs: 5000, // 5 seconds — how long to wait for a batch of messages
    maxBytesPerPartition: 1048576, // 1 MB — adjust based on message size
    retry: {
        retries: 5,
    },
});

// ✅ Safe helper — handles Invalid Date objects from z.coerce.date()
const toSafeISOString = (val: unknown): string => {
    if (val instanceof Date) {
        return isNaN(val.getTime()) ? new Date().toISOString() : val.toISOString();
    }
    const d = new Date(val as string);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
};

export const initConsumer = async () => {
    await connectWithRetry( consumer, serviceName );

    await consumer.subscribe({
        topic: TOPICS.SESSION_COMPLETED,
        fromBeginning: false
    });

    await consumer.subscribe({
        topic: TOPICS.USER_DELETED,
        fromBeginning: false
    });

    await consumer.run({
        autoCommit: false, // we'll commit manually after processing each message
        eachMessage: async ( { topic, message } ) => {
            if( !message.value ) return;

            const raw = JSON.parse( message.value!.toString() );
            if (!raw.event_id || !raw.event_type) {
                console.warn(`[Streak Consumer] Skipping malformed message on ${topic}`);
                return;
            }

            if ( topic === TOPICS.SESSION_COMPLETED ) {
                try {
                    const event = SessionCompletedEventSchema.parse( raw );
                    // 1️⃣ Idempotency
                    if( await EventIndexModel.exists( event.event_id ) ) return;
                    if( await DeletedUsersRepo.exists( event.user_id ) ) return;

                    // const safeOccurredAt = event.occurred_at instanceof Date 
                    //                             ? event.occurred_at.toISOString() 
                    //                             : new Date(event.occurred_at).toISOString();
                    const safeOccurredAt = toSafeISOString(event.occurred_at);

                    // 2️⃣ Apply streak logic
                    const result = await StreakRepo.applyActivity({ userId: event.user_id });
    
                    // 3️⃣ Emit only if something changed
                    if( result.updated ) {
                        await producer.send({
                            topic: TOPICS.STREAK_UPDATED,
                            messages: [
                                {
                                    key: event.user_id,
                                    value: JSON.stringify({
                                        event_type: "streak.updated.v1",
                                        event_id: uuid(),
                                        event_version: 1,
                                        user_id: event.user_id,
                                        occurred_at: safeOccurredAt,
                                        payload: {
                                            current_streak: result.currentStreak,
                                            longest_streak: result.longestStreak,
                                            celebration: result.celebration,
                                            last_activity_date: result.lastActivityDate 
                                                ? toSafeISOString(result.lastActivityDate) 
                                                : null,
                                            is_active: result.is_active
                                        },
                                    }),
                                },
                            ],
                        });
                    }
    
                    // 4️⃣ Mark inbox
                    await EventIndexModel.markProcessed({
                        event_id: event.event_id,
                        event_type: event.event_type,
                        event_version: event.event_version,
                        user_id: event.user_id,
                        // FIX: Convert to ISO string to satisfy the Postgres 'occurred_at' column
                        occurred_at: safeOccurredAt,
                        payload: event.payload // Updated to event.payload | previously it was event which is the entire event object, but we should only store the payload to save space and because that's all we need for idempotency checks
                    });
                }
                catch(error) {
                    // Log and skip — don't rethrow, so KafkaJS commits the offset
                    // and moves on instead of retrying the same bad message forever
                    console.error(`[Streak Consumer] Skipping bad message on topic ${topic}:`, error);
                    // Optionally write to a dead letter log for later inspection
                    console.error(`[Streak Consumer] Raw message was:`, JSON.stringify(raw));
                }
            }

            if ( topic === TOPICS.USER_DELETED ) {
                try {
                    const event = UserDeletedEventSchema.parse( raw );
                    if ( await EventIndexModel.exists( event.event_id ) ) return;
                    // const safeOccurredAt = event.occurred_at instanceof Date 
                    //                             ? event.occurred_at.toISOString() 
                    //                             : new Date(event.occurred_at).toISOString();

                    const safeOccurredAt = toSafeISOString(event.occurred_at);

                    await DeletedUsersRepo.insert( event.user_id );
                    await StreakRepo.deleteStreak( event.user_id );
                    await EventIndexModel.markProcessed({
                        event_id: event.event_id,
                        event_type: event.event_type,
                        event_version: event.event_version,
                        user_id: event.user_id,
                        // FIX: Convert to ISO string to satisfy the Postgres 'occurred_at' column
                        occurred_at: safeOccurredAt,
                        payload: event.payload
                    });

                    console.log( "🗑 Streak deleted for:", event.user_id );
                }
                catch(error) {
                    // Log and skip — don't rethrow, so KafkaJS commits the offset
                    // and moves on instead of retrying the same bad message forever
                    console.error(`[Streak Consumer] Skipping bad message on topic ${topic}:`, error);
                    // Optionally write to a dead letter log for later inspection
                    console.error(`[Streak Consumer] Raw message was:`, JSON.stringify(raw));
                }
            }
            
        },
    });
};