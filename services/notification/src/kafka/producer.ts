import { TOPICS, type NotificationCreatedEvent, type ReminderTriggeredEvent } from "@langphy/shared";
import { kafka } from "./kafka.client.js";
import type { Notification } from "../controllers/notifications.controller.js";

export let producer: ReturnType<typeof kafka.producer> | null = null;

export const initProducer = async () => {
    let retries = 10;
    producer = kafka.producer();

    while( retries > 0 ) {
        try {
            await producer.connect();
            console.log("Notifications - Kafka Produer connected successfully!");
            return;
        }
        catch(err: any) {
            console.log("Notifications - Kafka not ready, retrying...", err.message);
            retries--;
            await new Promise( res => setTimeout( res, 3000 ) );
        }
    }

    throw new Error("Notifications - Kafka not ready after retries");
};

export async function emitNotificationCreated( notification: Notification ) {
    if (!producer) {
        throw new Error("Kafka producer not initialized");
    }

    const event: NotificationCreatedEvent = {
        event_id: crypto.randomUUID(),
        event_type: "notification.created.v1",
        event_version: 1,
        occurred_at: new Date().toISOString(),
        user_id: notification.user_id,
        payload: {
            title: notification.title,
            body: notification.body,
            read: notification.read,
            created_at: notification.created_at,
            data: notification.data,
        },
    };

    await producer.send({
        topic: TOPICS.NOTIFICATION_CREATED,
        messages: [
        {
            key: notification.user_id,
            value: JSON.stringify(event),
        },
        ],
    });
}

export async function emitReminderTriggered( notification: Notification ) {
    if (!producer) {
        throw new Error("Kafka producer not initialized");
    }

    const event: ReminderTriggeredEvent = {
        event_id: crypto.randomUUID(),
        event_type: "reminder.triggered.v1",
        event_version: 1,
        occurred_at: new Date().toISOString(),
        user_id: notification.user_id,
        payload: {
            title: notification.title,
            body: notification.body,
            read: notification.read,
            created_at: notification.created_at,
            data: notification.data,
        },
    };

    await producer.send({
        topic: TOPICS.REMINDER_TRIGGERED,
        messages: [
        {
            key: notification.user_id,
            value: JSON.stringify(event),
        },
        ],
    });
}