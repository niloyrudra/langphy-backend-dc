import type { PoolClient } from "pg";
import { jest } from "@jest/globals";

/**
 * Mock pgPool for unit tests. Lets each test specify what `query()` or
 * `connect()` should return without spinning up a real Postgres.
 *
 * Uses Jest 29 built-in mocks — same pattern as auth service but with
 * explicit type assertions to satisfy ts-jest strict mode.
 */

// Simple helper: create a mock fn that returns a resolved value
const mfn = <T>(fn: (v: T) => any = () => {}) => {
    return jest.fn(fn) as unknown as jest.Mock & {
        mockResolvedValue: (v: T) => void;
        mockRejectedValue: (v: any) => void;
        mockResolvedValueOnce: (v: T) => void;
        mockRejectedValueOnce: (v: any) => void;
    };
};

export type MockPool = {
    query: jest.Mock & { mockResolvedValue: (v: any) => void; mockRejectedValue: (v: any) => void; mockResolvedValueOnce: (v: any) => void; mockRejectedValueOnce: (v: any) => void };
    connect: jest.Mock;
    on: jest.Mock;
    end: jest.Mock & { mockResolvedValue: (v: any) => void };
};

export type MockClient = {
    query: jest.Mock & { mockResolvedValue: (v: any) => void; mockRejectedValue: (v: any) => void; mockResolvedValueOnce: (v: any) => void; mockRejectedValueOnce: (v: any) => void };
    release: jest.Mock;
};

export function mockPool(overrides: Partial<MockPool> = {}): MockPool {
    const query = mfn<any>();
    const connect = mfn<any>();
    const on = mfn<any>();
    const end = mfn<any>();

    // Set up default implementations
    query.mockResolvedValue({ rows: [], rowCount: 0 });
    end.mockResolvedValue(undefined);

    const pool: MockPool = {
        query: query as any,
        connect: connect as any,
        on: on as any,
        end: end as any,
        ...overrides,
    };
    return pool;
}

export function mockClient(overrides: Partial<MockClient> = {}): MockClient {
    const query = mfn<any>();
    const release = mfn<any>();

    query.mockResolvedValue({ rows: [], rowCount: 0 });

    const client: MockClient = {
        query: query as any,
        release: release as any,
        ...overrides,
    };
    return client;
}

/**
 * Assert that a mock was called with a SQL string containing `needle`
 * (whitespace-normalized). Useful for asserting the exact form of the query
 * without coupling to indentation or line breaks.
 */
export function assertSqlContains(mock: jest.Mock, needle: string): void {
    const calls = mock.mock.calls as Array<[string, ...unknown[]]>;
    const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
    const n = normalize(needle);
    const found = calls.some(([sql]) => typeof sql === "string" && normalize(sql).includes(n));
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
