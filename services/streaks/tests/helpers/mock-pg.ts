import type { PoolClient } from "pg";
import { jest } from "@jest/globals";

/**
 * Mock pgPool for unit tests. Lets each test specify what `query()` or
 * `connect()` should return without spinning up a real Postgres.
 *
 * Usage:
 *   const pool = mockPool();
 *   jest.mock("../../src/db/index.js", () => ({ pgPool: pool }));
 *
 *   // or for connection-based code:
 *   const client = mockClient();
 *   pool.connect.mockResolvedValue(client);
 *   client.query.mockResolvedValueOnce(...);
 *
 * `mockPgPool.query` is jest.fn() so it has the full .mockResolvedValue
 * / .mockResolvedValueOnce / .mock.calls API.
 */

export type MockPool = {
    query: jest.Mock<(sql: string, params?: unknown[]) => Promise<unknown>>;
    connect: jest.Mock<() => Promise<unknown>>;
    on: jest.Mock<(event: string, cb: (...a: any[]) => void) => unknown>;
    end: jest.Mock<() => Promise<void>>;
};

export type MockClient = {
    query: jest.Mock<(sql: string, params?: unknown[]) => Promise<unknown>>;
    release: jest.Mock<() => void>;
};

export function mockPool(overrides: Partial<MockPool> = {}): MockPool {
    const query = jest.fn() as MockPool["query"];
    const connect = jest.fn() as MockPool["connect"];
    const on = jest.fn() as MockPool["on"];
    const end = jest.fn() as MockPool["end"];

    query.mockResolvedValue({ rows: [], rowCount: 0 });
    end.mockResolvedValue(undefined);

    return {
        query,
        connect,
        on,
        end,
        ...overrides,
    };
}

export function mockClient(overrides: Partial<MockClient> = {}): MockClient {
    const query = jest.fn() as MockClient["query"];
    const release = jest.fn() as MockClient["release"];

    query.mockResolvedValue({ rows: [], rowCount: 0 });

    return {
        query,
        release,
        ...overrides,
    };
}

/**
 * Assert that a mock was called with a SQL string containing `needle`.
 * Useful for asserting the exact form of the query without coupling to
 * whitespace.
 */
export function assertSqlContains(
    mock: { mock: { calls: ReadonlyArray<ReadonlyArray<unknown>> } },
    needle: string,
): void {
    const calls = mock.mock.calls as Array<[string, ...unknown[]]>;
    const found = calls.some(
        ([sql]) => typeof sql === "string" && sql.includes(needle),
    );
    if (!found) {
        const tried = calls.map(([sql]) => sql).join("\n  ");
        throw new Error(
            `Expected SQL containing "${needle}" but calls were:\n  ${tried}`,
        );
    }
}

/** Helper: make a `PoolClient`-shaped object (not actually typed as PoolClient). */
export function asPoolClient(c: MockClient): PoolClient {
    return c as unknown as PoolClient;
}