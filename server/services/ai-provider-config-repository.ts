import { eq, sql } from "drizzle-orm";
import { aiProviderConfigs } from "@shared/schema";
import { db } from "../db";
import type { PersistedAIProvider, AIProviderConfigRepository } from "./ai-key-manager";

/**
 * Drizzle persistence adapter. Its record type intentionally has no plaintext
 * API-key field, making accidental key persistence harder.
 */
export class DrizzleAIProviderConfigRepository implements AIProviderConfigRepository {
  async list(): Promise<PersistedAIProvider[]> {
    return db.select().from(aiProviderConfigs);
  }

  async save(provider: PersistedAIProvider): Promise<void> {
    await db.insert(aiProviderConfigs)
      .values(provider)
      .onConflictDoUpdate({
        target: aiProviderConfigs.id,
        set: {
          name: provider.name,
          encryptedApiKey: provider.encryptedApiKey,
          baseUrl: provider.baseUrl,
          models: provider.models,
          isActive: provider.isActive,
          rateLimit: provider.rateLimit,
          lastUsed: provider.lastUsed,
          usageCount: provider.usageCount,
        },
      });
  }

  async recordUsage(id: string, lastUsed: Date): Promise<void> {
    await db.update(aiProviderConfigs)
      .set({
        lastUsed,
        usageCount: sql`${aiProviderConfigs.usageCount} + 1`,
      })
      .where(eq(aiProviderConfigs.id, id));
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await db.delete(aiProviderConfigs).where(eq(aiProviderConfigs.id, id)).returning({ id: aiProviderConfigs.id });
    return deleted.length > 0;
  }
}