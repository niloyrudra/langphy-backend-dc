/**
 * Centralised startup env validation. Called once at boot from index.ts.
 *
 * Profile service requires JWT_KEY (to verify tokens issued by auth),
 * KAFKA_BROKER (event consumption), and Postgres connectivity.
 * Refuses to start with undefined config instead of failing at runtime.
 */

export interface ValidatedEnv {
    jwtKey: string;
    kafkaBroker: string;
    serviceName: string;
    port: number;
    postgresConfigured: boolean;
}

const HEX_64 = /^[0-9a-f]{64}$/i;

export class EnvValidationError extends Error {
    constructor(public readonly issues: string[]) {
        super(`Environment validation failed:\n - ${issues.join("\n - ")}`);
        Object.setPrototypeOf(this, EnvValidationError.prototype);
    }
}

export function validateEnv(env: NodeJS.ProcessEnv = process.env): ValidatedEnv {
    const issues: string[] = [];

    const jwtKey = env.JWT_KEY?.trim();
    if (!jwtKey) {
        issues.push("JWT_KEY is not set");
    } else if (!HEX_64.test(jwtKey)) {
        issues.push("JWT_KEY must be exactly 64 hex characters (32 bytes). Generate with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"");
    }

    const kafkaBroker = env.KAFKA_BROKER?.trim();
    if (!kafkaBroker) {
        issues.push("KAFKA_BROKER is not set");
    }

    const postgresConfigured =
        !!env.POSTGRES_DATABASE_URL ||
        !!(env.PG_HOST && env.PG_USER && env.PG_DB);
    if (!postgresConfigured) {
        issues.push("Postgres is not configured: set POSTGRES_DATABASE_URL or all of PG_HOST + PG_USER + PG_DB");
    }

    if (issues.length > 0) {
        throw new EnvValidationError(issues);
    }

    return {
        jwtKey: jwtKey!,
        kafkaBroker: kafkaBroker!,
        serviceName: env.SERVICE_NAME || "profile-service",
        port: parseInt(env.PORT || "3004", 10),
        postgresConfigured,
    };
}
