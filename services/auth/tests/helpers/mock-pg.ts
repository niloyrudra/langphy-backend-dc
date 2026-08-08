import type { PoolClient } from "pg";
import jest from "jest-mock";
// import type { jest } from "@jest/globals";

/**
 * Mock pgPool for unit tests. Lets each test specify what `query()` or
 * `connect()` should return without spinning up a real Postgres.
 *
 * Usage:
 *   const pool = mockPool({ query: jest.fn().mockResolvedValue({ rows: [...], rowCount: 1 }) });
 *   jest.mock("../../src/db/index.js", () => ({ pgPool: pool, getPool: () => pool }));
 *
 *   // or for connection-based code:
 *   const client = mockClient();
 *   pool.connect.mockResolvedValue(client);
 *   client.query.mockResolvedValueOnce(...);
 */

export type MockPool = {
    query: jest.Mock;
    connect: jest.Mock;
    on: jest.Mock;
    end: jest.Mock;
};

export type MockClient = {
    query: jest.Mock;
    release: jest.Mock;
};

export function mockPool(overrides: Partial<MockPool> = {}): MockPool {
    return {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        connect: jest.fn(),
        on: jest.fn(),
        end: jest.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}

export function mockClient(overrides: Partial<MockClient> = {}): MockClient {
    return {
        query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
        release: jest.fn(),
        ...overrides,
    };
}

/**
 * Assert that a mock was called with a SQL string containing `needle`.
 * Useful for asserting the exact form of the query without coupling to
 * whitespace.
 */
export function assertSqlContains(mock: jest.Mock, needle: string): void {
    const calls = mock.mock.calls as Array<[string, ...unknown[]]>;
    const found = calls.some(([sql]) => typeof sql === "string" && sql.includes(needle));
    if (!found) {
        const tried = calls.map(([sql]) => sql).join("\n  ");
        throw new Error(
            `Expected SQL containing "${needle}" but calls were:\n  ${tried}`
        );
    }
}

/** Helper: make a `PoolClient`-shaped object (not actually typed as PoolClient). */
export function asPoolClient(c: MockClient): PoolClient {
    return c as unknown as PoolClient;
}