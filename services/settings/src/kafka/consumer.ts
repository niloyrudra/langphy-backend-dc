import { kafka } from "./kafka.client.js"
import { SettingsModel } from "../models/settings.model.js";
import { connectWithRetry, SettingsUpdatedEventSchema, TOPICS, UserDeletedEventSchema, UserRegisteredEventSchema } from "@langphy/shared";
import { EventIndexModel } from "../models/eventIndex.model.js";
import { DeletedUsersRepo } from "../repos/deleted-users.repo.js";

const serviceName = process.env.SERVICE_NAME! ? process.env.SERVICE_NAME : 'settings-service';
const consumerGroupId = serviceName + '-group';
export const consumer = kafka.consumer({
    groupId: consumerGroupId
});

export const initSettingsConsumers = async () => {
    // await consumer.connect();
    await connectWithRetry( consumer, serviceName );

    await consumer.subscribe({
        topic: TOPICS.USER_REGISTERED,
        fromBeginning: true
    });

    // await consumer.subscribe({
    //     topic: TOPICS.SETTINGS_UPDATED,
    //     fromBeginning: false
    // });

    await consumer.subscribe({
        topic: TOPICS.USER_DELETED,
        fromBeginning: false
    });

    console.log( `[${process.env.SERVICE_NAME}] Kafka is connected` );

    await consumer.run({
        eachMessage: async ({ topic, message }) => {
            if (!message.value) {
                console.warn("Empty Kafka message");
                return;
            }

            const raw = JSON.parse(message.value.toString());

            if( topic === TOPICS.SETTINGS_UPDATED ) {
                let event;
                try {
                    event = SettingsUpdatedEventSchema.parse( raw );
                } catch (err) {
                    console.error("Failed to parse SETTINGS_UPDATED event:", err);
                    return;
                }

                console.log("Processing SETTINGS_UPDATED for:", event.user_id);

                try {
                    if ( await EventIndexModel.exists( event.event_id ) ) return;
                    if( await DeletedUsersRepo.exists( event.user_id ) ) return;

                    const settings = await SettingsModel.updateSettings(
                        event.user_id,
                        {
                            user_id: event.user_id,
                            theme: event.payload.theme ?? "light",
                            sound_effect: event.payload.sound_effect,
                            speaking_service: event.payload.speaking_service,
                            reading_service: event.payload.reading_service,
                            writing_service: event.payload.writing_service,
                            listening_service: event.payload.listening_service,
                            practice_service: event.payload.practice_service,
                            quiz_service: event.payload.quiz_service,
                            notifications: event.payload.notifications,
                            language: event.payload.language ?? "en",
                        }
                    );
                    if (settings) {
                        console.log("✅ Settings updated for user:", event.user_id);
                    } else {
                        console.warn("⚠️ Settings update returned nothing (may already exist)");
                    }

                    await EventIndexModel.markProcessed( event );

                } catch (err) {
                    console.error("Settings update failed:", err);
                }
            }

            if( topic === TOPICS.USER_REGISTERED ) {
                let event;
                try {
                    event = UserRegisteredEventSchema.parse( raw );
                } catch (err) {
                    console.error("Failed to parse USER_REGISTERED event:", err);
                    return;
                }

                console.log("Processing USER_REGISTERED for:", event.user_id);

                try {
                    if ( await EventIndexModel.exists( event.event_id ) ) return;

                    const exists = await SettingsModel.getSettings(event.user_id);
                    if (exists) {
                        console.log("Settings already exist for:", event.user_id);
                        return;
                    }
                    if( await DeletedUsersRepo.exists( event.user_id) ) return;

                    const settings = await SettingsModel.createSettingsIfNotExists(event.user_id);
                    if (settings) {
                        console.log("✅ Settings created for user:", event.user_id);
                    } else {
                        console.warn("⚠️ Settings insert returned nothing (may already exist)");
                    }

                    await EventIndexModel.markProcessed( event );

                } catch (err) {
                    console.error("Settings creation failed:", err);
                }
            }

            if ( topic === TOPICS.USER_DELETED ) {
                const event = UserDeletedEventSchema.parse( raw );
                try {
                    if ( await EventIndexModel.exists( event.event_id ) ) return;

                    await DeletedUsersRepo.insert(event.user_id);

                    await SettingsModel.deleteSettingsByUserId( event.user_id );

                    await EventIndexModel.markProcessed( event );

                    console.log( "🗑 Settings deleted for:", event.user_id );
                }
                catch(err) {
                    console.error( "Settings deletion failed:", err );
                }
            }

        },
    });
}