// Test-side only: never import this from server code that the build bundles.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as baseSchema from "@shared/schema";
import * as ledgerSchema from "@shared/ledger-schema";

export async function makePgliteDb() {
  const schema = { ...baseSchema, ...ledgerSchema };
  const client = new PGlite();
  const statements = await generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema));
  for (const s of statements) await client.exec(s);
  const db = drizzle(client, { schema });
  return { db, client };
}
