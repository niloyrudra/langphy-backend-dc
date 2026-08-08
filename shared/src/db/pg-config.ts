/**
 * Single source of truth for "how do we connect to Postgres".
 *
 * - Prefers POSTGRES_DATABASE_URL (Neon, Supabase, Railway, any managed provider).
 *   Automatically injects ?application_name=<service> if not already set, so the
 *   connection shows up labelled in the provider's dashboard.
 * - Falls back to the legacy PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_DB env vars
 *   so older services that haven't migrated still work.
 *
 * Returns a single connectionString + the application_name used, both of which
 * are passed to `new Pool({ connectionString, application_name, ... })`.
 *
 * NOTE: SSL is NOT enabled here. Callers must add `ssl: { rejectUnauthorized: true }`
 * themselves when constructing the Pool, since SSL is mandatory for Neon and harmless
 * elsewhere — but adding it conditionally would be a footgun.
 */
export interface PgConfig {
    connectionString: string;
    application_name: string;
}

export interface ParsePgConfigOptions {
    serviceName: string;
    /** When true, missing POSTGRES_DATABASE_URL is an error. Default: false. */
    requireUrl?: boolean;
    /** Optional explicit fallback. If omitted, reads PG_HOST/PORT/USER/PASSWORD/DB. */
    fallback?: {
        host?: string;
        port?: string;
        user?: string;
        password?: string;
        database?: string;
    };
}

export class PgConfigError extends Error {
    constructor(message: string) {
        super(message);
        Object.setPrototypeOf(this, PgConfigError.prototype);
    }
}

export function parsePgConfig(opts: ParsePgConfigOptions): PgConfig {
    const serviceName = opts.serviceName || process.env.SERVICE_NAME || "langphy-service";

    // 1) Prefer POSTGRES_DATABASE_URL (Neon, Supabase, etc.)
    const url = process.env.POSTGRES_DATABASE_URL;
    if (url && url.trim().length > 0) {
        let parsed: URL;
        try {
            parsed = new URL(url);
        } catch {
            throw new PgConfigError(
                `POSTGRES_DATABASE_URL is present but malformed: ${url.slice(0, 40)}…`
            );
        }
        if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
            throw new PgConfigError(
                `POSTGRES_DATABASE_URL must use postgres:// or postgresql:// scheme, got "${parsed.protocol}"`
            );
        }
        if (!parsed.searchParams.has("application_name")) {
            parsed.searchParams.set("application_name", serviceName);
        }
        return {
            connectionString: parsed.toString(),
            application_name: parsed.searchParams.get("application_name") ?? serviceName,
        };
    }

    if (opts.requireUrl) {
        throw new PgConfigError(
            "POSTGRES_DATABASE_URL is required but not set"
        );
    }

    // 2) Fall back to PG_HOST/PG_PORT/PG_USER/PG_PASSWORD/PG_DB
    const f = opts.fallback ?? {};
    const host = f.host ?? process.env.PG_HOST;
    const port = f.port ?? process.env.PG_PORT ?? "5432";
    const user = f.user ?? process.env.PG_USER;
    const password = f.password ?? process.env.PG_PASSWORD;
    const database = f.database ?? process.env.PG_DB;

    if (!host || !user || !database) {
        throw new PgConfigError(
            "Missing Postgres connection config: set POSTGRES_DATABASE_URL " +
            "or all of PG_HOST, PG_USER, PG_DB (PG_PASSWORD optional for trust auth)."
        );
    }

    const u = new URL(`postgresql://${host}:${port}/${database}`);
    if (user) u.username = user;
    if (password) u.password = password;
    u.searchParams.set("application_name", serviceName);

    return {
        connectionString: u.toString(),
        application_name: serviceName,
    };
}