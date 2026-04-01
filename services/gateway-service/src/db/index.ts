import { Pool } from "pg";

export const pgPool = new Pool({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT),
  database: process.env.PG_DB,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: false,
});

pgPool.on('connect', () => {
  console.log('✅ Connected to Event PostgreSQL');
});