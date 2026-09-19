import { mockPool } from "../../helpers/mock-pg.js";
import { beforeEach, describe, it, expect, jest } from "@jest/globals";

// Initialize mocks BEFORE any imports of the module under test.
const mockPgPool = mockPool();

jest.mock("../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

// Mock @langphy/shared to avoid loading ESM dist in Jest.
jest.mock("@langphy/shared", () => ({
    TOPICS: {
        SESSION_COMPLETED: "session.completed.v1",
        LESSON_COMPLETED: "lesson.completed.v1",
    },
    BaseEventSchema: {
        parse: (raw: any) => ({
            ...raw,
            occurred_at: new Date(raw.occurred_at),
        }),
    },
}));

// Create a factory function to create mock producers
const createMockProducer = (connectImpl = jest.fn(() => Promise.resolve())) => ({
    connect: connectImpl,
    send: jest.fn(() => Promise.resolve()),
    disconnect: jest.fn(() => Promise.resolve()),
});

let mockKafkaProducerFactory = jest.fn(() => createMockProducer());

jest.mock("../../../src/kafka/kafka.client.js", () => ({
    kafka: {
        producer: mockKafkaProducerFactory,
    },
}));

import { initProducer, publishEvent, shutdownProducer, getProducer } from "../../../src/kafka/producer.js";
import { TOPICS } from "@langphy/shared";

describe("Kafka Producer (gateway)", () => {
    beforeEach(() => {
        mockPgPool.query.mockReset();
        jest.clearAllMocks();
        mockKafkaProducerFactory.mockImplementation(() => createMockProducer());
        // Reset the internal producer state by calling shutdownProducer
        shutdownProducer();
    });

    describe("initProducer", () => {
        it("connects to Kafka with retry logic", async () => {
            const producer = await initProducer();
            expect(producer.connect).toHaveBeenCalled();
        });

        it("returns existing producer if already initialized", async () => {
            const producer1 = await initProducer();
            const producer2 = await initProducer();
            expect(producer1).toBe(producer2);
        });

        it("retries on connection failure and eventually succeeds", async () => {
            let attempts = 0;
            mockKafkaProducerFactory.mockImplementation(() => createMockProducer(
                jest.fn(() => {
                    attempts++;
                    if (attempts < 2) {
                        return Promise.reject(new Error("connection failed"));
                    }
                    return Promise.resolve();
                })
            ));

            const producer = await initProducer();
            expect(producer.connect).toHaveBeenCalledTimes(2);
            expect(attempts).toBe(2);
        });
    });

    describe("publishEvent", () => {
        it("publishes session.completed.v1 to SESSION_COMPLETED topic", async () => {
            await initProducer();
            const event = {
                event_id: "evt-1",
                event_type: "session.completed.v1",
                event_version: 1,
                user_id: "user-1",
                occurred_at: new Date(),
                payload: { unit_id: "unit-1", session_type: "practice" },
            };

            await publishEvent(event);

            const producer = getProducer();
            expect(producer.send).toHaveBeenCalledWith({
                topic: TOPICS.SESSION_COMPLETED,
                messages: [{ key: "user-1", value: JSON.stringify(event) }],
            });
        });

        it("publishes lesson.completed.v1 to LESSON_COMPLETED topic", async () => {
            await initProducer();
            const event = {
                event_id: "evt-2",
                event_type: "lesson.completed.v1",
                event_version: 1,
                user_id: "user-2",
                occurred_at: new Date(),
                payload: { lesson_id: "lesson-1", category_id: "cat-1" },
            };

            await publishEvent(event);

            const producer = getProducer();
            expect(producer.send).toHaveBeenCalledWith({
                topic: TOPICS.LESSON_COMPLETED,
                messages: [{ key: "user-2", value: JSON.stringify(event) }],
            });
        });

        it("throws for unknown event type", async () => {
            await initProducer();
            const event = {
                event_id: "evt-3",
                event_type: "unknown.event.v1",
                event_version: 1,
                user_id: "user-3",
                occurred_at: new Date(),
                payload: {},
            };

            await expect(publishEvent(event)).rejects.toThrow("Unknown event type: unknown.event.v1");
        });
    });

    describe("shutdownProducer", () => {
        it("disconnects the producer and sets it to null", async () => {
            await initProducer();
            await shutdownProducer();
            // After shutdown, getProducer should throw
            expect(() => getProducer()).toThrow("Gateway Kafka producer not initialized");
        });

        it("is safe to call when producer is not initialized", async () => {
            await expect(shutdownProducer()).resolves.toBeUndefined();
        });
    });
});