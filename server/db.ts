// Database connection setup — supports both Neon (production/Replit) and local PostgreSQL
import * as baseSchema from "@shared/schema";
import * as ledgerSchema from "@shared/ledger-schema";

const schema = { ...baseSchema, ...ledgerSchema };

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isLocalDev = process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');

let pool: any;
let db: any;

if (isLocalDev) {
  // Local development: use standard pg driver (no WebSocket needed)
  const pg = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  pool = new pg.default.Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle(pool, { schema });
} else {
  // Production (Neon/Replit): use serverless driver with WebSocket
  const { Pool, neonConfig } = await import('@neondatabase/serverless');
  const { drizzle } = await import('drizzle-orm/neon-serverless');
  const ws = await import('ws');
  neonConfig.webSocketConstructor = ws.default;
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  db = drizzle({ client: pool, schema });
}

export { pool, db };
