// Test-side only: never import this from server code that the build bundles.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import * as baseSchema from "@shared/schema";
import * as ledgerSchema from "@shared/ledger-schema";

const schema = { ...baseSchema, ...ledgerSchema };
// The DDL is the same for every database in a file, so generate it once.
let ddl: Promise<string[]> | undefined;

export async function makePgliteDb() {
  const client = new PGlite();
  const statements = await (ddl ??= generateMigration(generateDrizzleJson({}), generateDrizzleJson(schema)));
  for (const s of statements) await client.exec(s);
  const db = drizzle(client, { schema });
  return { db, client };
}
