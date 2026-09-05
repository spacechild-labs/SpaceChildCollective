import { describe, expect, it } from "vitest";
import {
  AIKeyManager,
  type AIProviderConfigRepository,
  type PersistedAIProvider,
} from "./ai-key-manager";

class MemoryProviderRepository implements AIProviderConfigRepository {
  private records = new Map<string, PersistedAIProvider>();

  async list(): Promise<PersistedAIProvider[]> {
    return [...this.records.values()].map((record) => ({ ...record, models: [...record.models] }));
  }

  async save(provider: PersistedAIProvider): Promise<void> {
    // Mirrors a database boundary and makes inspecting persisted data safe.
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

  values(): PersistedAIProvider[] {
    return [...this.records.values()];
  }
}

const provider = {
  name: "Custom provider",
  apiKey: "a-test-key-that-is-long-enough",
  models: ["test-model"],
  isActive: true,
};

describe("AIKeyManager persistence", () => {
  it("loads and decrypts a provider added by a fresh manager with the same key", async () => {
    const repository = new MemoryProviderRepository();
    const first = new AIKeyManager(repository, "shared-encryption-secret");
    await first.initialize();
    const id = await first.addProvider(provider);

    expect(repository.values()[0].encryptedApiKey).not.toContain(provider.apiKey);

    const restarted = new AIKeyManager(repository, "shared-encryption-secret");
    await restarted.initialize();
    expect(restarted.getApiKey(id)).toBe(provider.apiKey);
  });

  it("skips (does not brick boot on) a provider stored under a different encryption key", async () => {
    const repository = new MemoryProviderRepository();
    const first = new AIKeyManager(repository, "original-secret");
    await first.initialize();
    await first.addProvider(provider);

    const restarted = new AIKeyManager(repository, "different-secret");
    await expect(restarted.initialize()).resolves.toBeUndefined();
    expect(restarted.getProviders()).toEqual([]);
    expect(restarted.undecryptable.map((p) => p.name)).toEqual([provider.name]);
  });

  it("persists provider deletion", async () => {
    const repository = new MemoryProviderRepository();
    const first = new AIKeyManager(repository, "shared-encryption-secret");
    await first.initialize();
    const id = await first.addProvider(provider);
    await first.removeProvider(id);

    const restarted = new AIKeyManager(repository, "shared-encryption-secret");
    await restarted.initialize();
    expect(restarted.getProviders()).toEqual([]);
  });

  it("keeps the saved key when a metadata update submits an empty key", async () => {
    const repository = new MemoryProviderRepository();
    const first = new AIKeyManager(repository, "shared-encryption-secret");
    await first.initialize();
    const id = await first.addProvider(provider);

    await first.updateProvider(id, { apiKey: "", baseUrl: "https://example.com/v1" });

    const restarted = new AIKeyManager(repository, "shared-encryption-secret");
    await restarted.initialize();
    expect(restarted.getApiKey(id)).toBe(provider.apiKey);
    expect(restarted.getProviders()[0].baseUrl).toBe("https://example.com/v1");
  });

  it("does not let a delayed usage write overwrite a rotated encrypted key", async () => {
    let releaseUsage!: () => void;
    const usageStarted = new Promise<void>((resolve) => {
      releaseUsage = resolve;
    });
    class DelayedUsageRepository extends MemoryProviderRepository {
      override async recordUsage(id: string, lastUsed: Date): Promise<void> {
        await usageStarted;
        await super.recordUsage(id, lastUsed);
      }
    }

    const repository = new DelayedUsageRepository();
    const manager = new AIKeyManager(repository, "shared-encryption-secret");
    await manager.initialize();
    const id = await manager.addProvider(provider);
    const ciphertextBeforeRotation = repository.values()[0].encryptedApiKey;

    expect(manager.getApiKey(id)).toBe(provider.apiKey);
    await manager.updateProvider(id, { apiKey: "rotated-api-key" });
    const ciphertextAfterRotation = repository.values()[0].encryptedApiKey;
    expect(ciphertextAfterRotation).not.toBe(ciphertextBeforeRotation);

    releaseUsage();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(repository.values()[0].encryptedApiKey).toBe(ciphertextAfterRotation);
  });
});