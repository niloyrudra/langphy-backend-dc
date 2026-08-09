import { mockPool, mockClient, asPoolClient } from "../../helpers/mock-pg.js";
import { beforeEach, describe, it, expect, jest } from "@jest/globals";

// Initialize mocks BEFORE any imports of the module under test. In the CJS
// output produced by ts-jest (useESM: false), `require` calls execute in
// source order, so the jest.mock factories below only run when the module
// under test is imported — at which point these consts are initialized.
const mockPgPool = mockPool();

// Capture eachMessage callback so tests can drive events through it.
const registeredHandlers: Array<(payload: any) => Promise<void>> = [];
const mockConsumer = {
    subscribe: jest.fn(),
    connect: jest.fn(),
    run: jest.fn(({ eachMessage }: any) => {
        registeredHandlers.push(eachMessage);
        return Promise.resolve();
    }),
    stop: jest.fn(() => Promise.resolve()),
    disconnect: jest.fn(() => Promise.resolve()),
};

jest.mock("../../../src/db/index.js", () => ({
    pgPool: mockPgPool,
}));

jest.mock("../../../src/kafka/kafka.client.js", () => ({
    kafka: {
        consumer: jest.fn(() => mockConsumer),
    },
}));

// Mock @langphy/shared to avoid loading ESM dist in Jest.
jest.mock("@langphy/shared", () => ({
    connectWithRetry: jest.fn(() => Promise.resolve()),
    TOPICS: {
        USER_REGISTERED: "user.registered.v1",
        USER_DELETED: "user.deleted.v1",
    },
    UserRegisteredEventSchema: {
        parse: (raw: any) => ({
            ...raw,
            occurred_at: new Date(raw.occurred_at),
        }),
    },
    UserDeletedEventSchema: {
        parse: (raw: any) => ({
            ...raw,
            occurred_at: new Date(raw.occurred_at),
        }),
    },
}));

import {
    startProfileConsumers,
    stopProfileConsumers,
} from "../../../src/kafka/consumer.js";
import { TOPICS } from "@langphy/shared";

describe("Kafka Consumer (profile)", () => {
    let client: ReturnType<typeof mockClient>;

    beforeEach(() => {
        client = mockClient();
        (mockPgPool.query as any).mockReset();
        (mockPgPool.connect as any).mockReset();
        registeredHandlers.length = 0;
        Object.values(mockConsumer).forEach((v: any) => v.mockClear?.());
        mockPgPool.connect.mockResolvedValue(asPoolClient(client) as never);
    });

    const profileDeletedEvent = {
        event_id: "00000000-0000-4000-8000-000000000001",
        event_type: "user.deleted.v1" as const,
        event_version: 1 as const,
        occurred_at: "2025-01-01T00:00:00Z",
        user_id: "00000000-0000-4000-8000-0000000000aa",
        payload: { reason: "user_requested", deleted_by: "user" as const },
    };

    const profileRegisteredEvent = {
        event_id: "00000000-0000-4000-8000-000000000002",
        event_type: "user.registered.v1" as const,
        event_version: 1 as const,
        occurred_at: "2025-01-02T00:00:00Z",
        user_id: "00000000-0000-4000-8000-0000000000bb",
        payload: { email: "new@user.com", provider: "email" as const },
    };

    const sqlCalls = (): string[] =>
        (client.query as jest.Mock).mock.calls.map((c) => c[0] as string);

    describe("startProfileConsumers", () => {
        it("subscribes to USER_REGISTERED and USER_DELETED and runs", async () => {
            await startProfileConsumers();
            expect(mockConsumer.subscribe).toHaveBeenCalledWith({
                topic: TOPICS.USER_REGISTERED,
            });
            expect(mockConsumer.subscribe).toHaveBeenCalledWith({
                topic: TOPICS.USER_DELETED,
            });
            expect(mockConsumer.run).toHaveBeenCalled();
            expect(registeredHandlers).toHaveLength(1);
        });
    });

    describe("stopProfileConsumers", () => {
        it("stops and disconnects the consumer", async () => {
            await startProfileConsumers();
            await stopProfileConsumers();
            expect(mockConsumer.stop).toHaveBeenCalledTimes(1);
            expect(mockConsumer.disconnect).toHaveBeenCalledTimes(1);
        });

        it("tolerates disconnect errors and still completes", async () => {
            await startProfileConsumers();
            (mockConsumer.disconnect as jest.Mock).mockRejectedValueOnce(
                new Error("already gone") as never
            );
            await expect(stopProfileConsumers()).resolves.toBeUndefined();
        });
    });

    describe("message handling — USER_DELETED", () => {
        it("commits early when the event is already in the inbox (skip)", async () => {
            await startProfileConsumers();
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // BEGIN
            client.query.mockResolvedValueOnce({ rows: [{ event_id: profileDeletedEvent.event_id }], rowCount: 1 }); // inbox check
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

            const handler = registeredHandlers.at(-1)!;
            await handler({
                topic: TOPICS.USER_DELETED,
                message: { value: Buffer.from(JSON.stringify(profileDeletedEvent)) },
            });

            const sql = sqlCalls();
            expect(sql[0]).toMatch(/BEGIN/i);
            expect(sql).toContain("COMMIT");
            expect(sql).not.toContain("ROLLBACK");
            // When event already in inbox, we skip the business logic and
            // go straight to COMMIT — only mailbox + transaction queries appear.
            expect(sql.filter((s) => s.includes("INSERT INTO deleted_users"))).toHaveLength(0);
            expect(sql.filter((s) => s.includes("DELETE FROM lp_profiles"))).toHaveLength(0);
            expect(client.release).toHaveBeenCalledTimes(1);
        });

        it("deletes profile, tombstones user, marks processed, commits", async () => {
            await startProfileConsumers();
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // inbox check
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT deleted_users
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // DELETE lp_profiles
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT event_inbox
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

            const handler = registeredHandlers.at(-1)!;
            await handler({
                topic: TOPICS.USER_DELETED,
                message: { value: Buffer.from(JSON.stringify(profileDeletedEvent)) },
            });

            const sql = sqlCalls();
            expect(sql).toContain("BEGIN");
            expect(sql.some((s) => s.includes("INSERT INTO deleted_users"))).toBe(true);
            expect(sql.some((s) => s.includes("DELETE FROM lp_profiles"))).toBe(true);
            expect(sql.some((s) => s.includes("INSERT INTO event_inbox"))).toBe(true);
            expect(sql).toContain("COMMIT");
            expect(sql).not.toContain("ROLLBACK");
            expect(client.release).toHaveBeenCalledTimes(1);
        });

        it("rolls back and rethrows on DB failure so Kafka retries", async () => {
            await startProfileConsumers();
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // inbox check
            client.query.mockRejectedValueOnce(new Error("disk failure")); // INSERT deleted_users
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

            const handler = registeredHandlers.at(-1)!;
            await expect(
                handler({
                    topic: TOPICS.USER_DELETED,
                    message: { value: Buffer.from(JSON.stringify(profileDeletedEvent)) },
                })
            ).rejects.toThrow("disk failure");

            const sql = sqlCalls();
            expect(sql).toContain("ROLLBACK");
            expect(sql).not.toContain("COMMIT");
            expect(client.release).toHaveBeenCalledTimes(1);
        });

        it("releases the client even when ROLLBACK itself fails", async () => {
            await startProfileConsumers();
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // inbox check
            client.query.mockRejectedValueOnce(new Error("disk failure")); // INSERT
            client.query.mockRejectedValueOnce(new Error("cannot rollback")); // ROLLBACK

            const handler = registeredHandlers.at(-1)!;
            await expect(
                handler({
                    topic: TOPICS.USER_DELETED,
                    message: { value: Buffer.from(JSON.stringify(profileDeletedEvent)) },
                })
            ).rejects.toThrow("disk failure");

            expect(client.release).toHaveBeenCalledTimes(1);
        });
    });

    describe("message handling — USER_REGISTERED", () => {
        it("creates the profile idempotently and marks the event processed", async () => {
            await startProfileConsumers();
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // inbox check
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT lp_profiles ON CONFLICT DO NOTHING
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT event_inbox
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

            const handler = registeredHandlers.at(-1)!;
            await handler({
                topic: TOPICS.USER_REGISTERED,
                message: { value: Buffer.from(JSON.stringify(profileRegisteredEvent)) },
            });

            const sql = sqlCalls();
            expect(sql).toContain("BEGIN");
            expect(sql.some((s) => s.includes("INSERT INTO lp_profiles"))).toBe(true);
            expect(sql.some((s) => s.includes("ON CONFLICT (user_id) DO NOTHING"))).toBe(true);
            expect(sql.some((s) => s.includes("INSERT INTO event_inbox"))).toBe(true);
            expect(sql).toContain("COMMIT");
            expect(sql).not.toContain("ROLLBACK");
            expect(client.release).toHaveBeenCalledTimes(1);
        });

        it("rolls back and rethrows when profile creation fails", async () => {
            await startProfileConsumers();
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // inbox check
            client.query.mockRejectedValueOnce(new Error("unique constraint")); // INSERT lp_profiles
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

            const handler = registeredHandlers.at(-1)!;
            await expect(
                handler({
                    topic: TOPICS.USER_REGISTERED,
                    message: { value: Buffer.from(JSON.stringify(profileRegisteredEvent)) },
                })
            ).rejects.toThrow("unique constraint");

            const sql = sqlCalls();
            expect(sql).toContain("ROLLBACK");
            expect(sql).not.toContain("COMMIT");
            expect(client.release).toHaveBeenCalledTimes(1);
        });
    });
});

