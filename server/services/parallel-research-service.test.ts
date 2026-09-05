import { afterEach, describe, expect, it } from "vitest";
import {
  AIKeyManager,
  type AIProviderConfigRepository,
  type PersistedAIProvider,
} from "./ai-key-manager";
import { ParallelResearchService } from "./parallel-research-service";

class MemoryProviderRepository implements AIProviderConfigRepository {
  private records = new Map<string, PersistedAIProvider>();

  async list(): Promise<PersistedAIProvider[]> {
    return [...this.records.values()].map((record) => ({ ...record, models: [...record.models] }));
  }

  async save(provider: PersistedAIProvider): Promise<void> {
    this.records.set(provider.id, { ...provider, models: [...provider.models] });
  }

  async recordUsage(id: string, lastUsed: Date): Promise<void> {
    const record = this.records.get(id);
    if (record) {
      record.lastUsed = lastUsed;
      record.usageCount++;
    }
  }

  async delete(id: string): Promise<boolean> {
    return this.records.delete(id);
  }
}

const savedParallelKey = process.env.PARALLEL_API_KEY;

afterEach(() => {
  if (savedParallelKey === undefined) delete process.env.PARALLEL_API_KEY;
  else process.env.PARALLEL_API_KEY = savedParallelKey;
});

describe("ParallelResearchService provider persistence", () => {
  it("resolves a persisted provider after construction and manager initialization", async () => {
    delete process.env.PARALLEL_API_KEY;
    const repository = new MemoryProviderRepository();
    const writer = new AIKeyManager(repository, "shared-encryption-secret");
    await writer.initialize();
    const writerService = new ParallelResearchService(writer);
    await writerService.setApiKey("persisted-parallel-key");

    const restartedManager = new AIKeyManager(repository, "shared-encryption-secret");
    const restartedService = new ParallelResearchService(restartedManager);
    expect(restartedService.isConfigured()).toBe(false);

    await restartedManager.initialize();
    expect(restartedService.isConfigured()).toBe(true);
  });

  it("reuses one provider across repeated configuration and restart", async () => {
    const repository = new MemoryProviderRepository();
    const firstManager = new AIKeyManager(repository, "shared-encryption-secret");
    await firstManager.initialize();
    const firstService = new ParallelResearchService(firstManager);
    const originalId = await firstService.setApiKey("first-parallel-key");
    expect(await firstService.setApiKey("second-parallel-key")).toBe(originalId);

    const restartedManager = new AIKeyManager(repository, "shared-encryption-secret");
    await restartedManager.initialize();
    const restartedService = new ParallelResearchService(restartedManager);
    expect(await restartedService.setApiKey("current-parallel-key")).toBe(originalId);

    const providers = restartedManager.getProviders().filter((provider) => provider.name === "Parallel AI");
    expect(providers).toHaveLength(1);
    expect(restartedManager.getApiKey(originalId)).toBe("current-parallel-key");
  });
});