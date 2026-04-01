import { kafka } from "./kafka.client.js";
import { ProfileModel } from "../models/profile.model.js";
import { TOPICS, UserDeletedEventSchema, UserRegisteredEventSchema } from "@langphy/shared";
import { EventIndexModel } from "../models/eventIndex.model.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";

const consumer = kafka.consumer({
    groupId: process.env.SERVICE_NAME! + '-group'
});

export const startProfileConsumers = async () => {
    await consumer.connect();

    await consumer.subscribe({
        topic: TOPICS.USER_REGISTERED,
    });

    await consumer.subscribe({
        topic: TOPICS.USER_DELETED
    });

    console.log(`[${process.env.SERVICE_NAME}] Kafka is connected`);

    await consumer.run({
        eachMessage: async ({ topic, message }) => {
            if(!message?.value) return;

            const raw = JSON.parse(message.value.toString());

            if ( topic === TOPICS.USER_DELETED ) {
                const event = UserDeletedEventSchema.parse( raw );
                try {
                    if (await EventIndexModel.exists(event.event_id)) return;

                    await DeletedUsersRepo.insert( event.user_id );
                    await ProfileModel.deleteProfileById(event.user_id);
                    await EventIndexModel.markProcessed(event);

                    console.log("🗑 Profile deleted for:", event.user_id);
                }
                catch(err) {
                    console.error("Profile deletion failed:", err);
                }
            }

            if( topic === TOPICS.USER_REGISTERED ) {
                const event = UserRegisteredEventSchema.parse( raw );
                try {
                    const exists = await ProfileModel.profileIfNotExists( event.user_id );
                    if( exists ) return;

                    if (await EventIndexModel.exists(event.event_id)) return;

                    await ProfileModel.createProfileIfNotExists( event.user_id, event.payload.email );
                    await EventIndexModel.markProcessed(event);
        
                    console.log("✅ Profile created for user:", event.user_id);
                }
                catch(err) {
                    console.error("Profile creation failed:", err);
                    console.error("ℹ️ Profile already exists for user:", event.user_id);
                    // throw err;
                }
            }
        },
    });

};