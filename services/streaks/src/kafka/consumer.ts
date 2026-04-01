import { v4 as uuid } from "uuid";
import { kafka } from "./kafka.client.js";
import { producer } from "./producer.js";
import { SessionCompletedEventSchema, TOPICS, UserDeletedEventSchema } from "@langphy/shared";
import { EventIndexModel } from "../models/eventIndex.model.js";
import { StreakRepo } from "../repos/streaks.repo.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";

export const consumer = kafka.consumer({
    groupId: process.env.SERVICE_NAME + '-group'
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
        eachMessage: async ( { topic, message } ) => {
            if( !message.value ) return;

            const raw = JSON.parse( message.value!.toString() );

            if ( topic === TOPICS.SESSION_COMPLETED ) {
                const event = SessionCompletedEventSchema.parse( raw );

                // 1️⃣ Idempotency
                if( await EventIndexModel.exists( event.event_id ) ) return;
                if( await DeletedUsersRepo.exists( event.event_id ) ) return;

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
                                    occurred_at: event.occurred_at,
                                    payload: {
                                        current_streak: result.currentStreak,
                                        longest_streak: result.longestStreak,
                                        last_activity_date: result.lastActivityDate,
                                        celebration: result.celebration,
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
                    occurred_at: event?.occurred_at ?? new Date().toISOString(),
                    payload: event
                });
            }

            if ( topic === TOPICS.USER_DELETED ) {
                const event = UserDeletedEventSchema.parse( raw );
                try {
                    if ( await EventIndexModel.exists( event.event_id ) ) return;

                    await DeletedUsersRepo.insert( event.user_id );
                    await StreakRepo.deleteStreak( event.user_id );
                    await EventIndexModel.markProcessed( event );

                    console.log( "🗑 Streak deleted for:", event.user_id );
                }
                catch(err) {
                    console.error( "Streak deletion failed:", err );
                }
            }
            
        },
    });
};