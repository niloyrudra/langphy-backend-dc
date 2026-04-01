import { Pool } from "pg";

export const pgPool = new Pool({
    host: process.env.PG_HOST,
    port: Number(process.env.PG_PORT),
    database: process.env.PG_DB,
    user: process.env.PG_USER,
    password: process.env.PG_PASSWORD,
    ssl: false,
});

pgPool.on( 'connect', () => console.log( "✅ Connect to Streaks PostgreSQl" ));

// export async function connectDB() {
//     // Force at least one connection at startup
//     await pgPool.query("select 1");
//     console.log("✅ Connected to Streaks PostgreSQL");
// }

// export async function disconnectDB() {
//     console.log("🛑 Closing PostgreSQL pool");
//     await pgPool.end();
//     console.log("✅ PostgreSQL pool closed");
// }