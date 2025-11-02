import crypto from 'crypto';

/**
 * AI Provider Configuration
 */
interface AIProvider {
  name: string;
  apiKey: string;
  baseUrl?: string;
  models: string[];
  isActive: boolean;
  createdAt: Date;
  lastUsed: Date;
  usageCount: number;
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

/**
 * Usage Statistics
 */
interface UsageStats {
  providerName: string;
  tokensUsed: number;
  requestsCount: number;
  cost: number;
  lastUsed: Date;
}

/**
 * AI Key Manager Service
 * Manages user-provided AI keys with security and usage tracking
 */
export class AIKeyManager {
  private providers = new Map<string, AIProvider>();
  private usageStats = new Map<string, UsageStats>();
  private encryptionKey: string;

  constructor() {
    // Initialize encryption key from environment or generate one
    this.encryptionKey = process.env.ENCRYPTION_KEY || this.generateEncryptionKey();
  }

  /**
   * Add AI provider with encrypted API key
   */
  async addProvider(providerData: Omit<AIProvider, 'createdAt' | 'lastUsed' | 'usageCount'>): Promise<string> {
    const providerId = this.generateId();
    
    const provider: AIProvider = {
      ...providerData,
      id: providerId,
      apiKey: this.encryptApiKey(providerData.apiKey),
      createdAt: new Date(),
      lastUsed: new Date(),
      usageCount: 0
    };

    this.providers.set(providerId, provider);
    
    console.log(`🔑 Added AI provider: ${provider.name} (${providerId})`);
    
    return providerId;
  }

  /**
   * Get decrypted API key for provider
   */
  getApiKey(providerId: string): string | null {
    const provider = this.providers.get(providerId);
    if (!provider || !provider.isActive) {
      return null;
    }

    // Update usage
    provider.lastUsed = new Date();
    provider.usageCount++;

    return this.decryptApiKey(provider.apiKey);
  }

  /**
   * Get all providers (without API keys)
   */
  getProviders(): Array<Omit<AIProvider, 'apiKey'>> {
    return Array.from(this.providers.values()).map(p => ({
      ...p,
      apiKey: '[ENCRYPTED]'
    }));
  }

  /**
   * Get active providers for specific model
   */
  getProvidersForModel(model: string): AIProvider[] {
    return Array.from(this.providers.values())
      .filter(p => p.isActive && p.models.includes(model));
  }

  /**
   * Update provider
   */
  async updateProvider(providerId: string, updates: Partial<AIProvider>): Promise<boolean> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return false;
    }

    if (updates.apiKey) {
      updates.apiKey = this.encryptApiKey(updates.apiKey);
    }

    Object.assign(provider, updates);
    
    console.log(`🔧 Updated AI provider: ${provider.name} (${providerId})`);
    
    return true;
  }

  /**
   * Remove provider
   */
  removeProvider(providerId: string): boolean {
    const removed = this.providers.delete(providerId);
    
    if (removed) {
      console.log(`🗑️ Removed AI provider: ${providerId}`);
    }
    
    return removed;
  }

  /**
   * Track usage statistics
   */
  trackUsage(providerId: string, tokensUsed: number, cost: number): void {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    const stats = this.usageStats.get(providerId) || {
      providerName: provider.name,
      tokensUsed: 0,
      requestsCount: 0,
      cost: 0,
      lastUsed: new Date()
    };

    stats.tokensUsed += tokensUsed;
    stats.requestsCount += 1;
    stats.cost += cost;
    stats.lastUsed = new Date();

    this.usageStats.set(providerId, stats);
  }

  /**
   * Get usage statistics
   */
  getUsageStats(providerId?: string): UsageStats[] {
    if (providerId) {
      const stats = this.usageStats.get(providerId);
      return stats ? [stats] : [];
    }

    return Array.from(this.usageStats.values());
  }

  /**
   * Get best provider for model based on cost and availability
   */
  getBestProvider(model: string): AIProvider | null {
    const providers = this.getProvidersForModel(model);
    
    if (providers.length === 0) {
      return null;
    }

    // Select provider with lowest recent cost and good availability
    return providers.sort((a, b) => {
      const aStats = this.usageStats.get(a.id);
      const bStats = this.usageStats.get(b.id);
      
      const aCostPerToken = aStats ? aStats.cost / Math.max(aStats.tokensUsed, 1) : Infinity;
      const bCostPerToken = bStats ? bStats.cost / Math.max(bStats.tokensUsed, 1) : Infinity;
      
      return aCostPerToken - bCostPerToken;
    })[0];
  }

  /**
   * Validate API key with provider
   */
  async validateApiKey(providerName: string, apiKey: string): Promise<boolean> {
    try {
      // Simple validation based on provider
      switch (providerName.toLowerCase()) {
        case 'openai':
          return this.validateOpenAIKey(apiKey);
        case 'anthropic':
          return this.validateAnthropicKey(apiKey);
        case 'google':
          return this.validateGoogleKey(apiKey);
        default:
          return apiKey.length > 10; // Basic validation
      }
    } catch (error) {
      console.error(`❌ API key validation failed for ${providerName}:`, error);
      return false;
    }
  }

  /**
   * Get suggested configurations for popular providers
   */
  getSuggestedConfigurations(): Array<{
    name: string;
    baseUrl?: string;
    models: string[];
    rateLimit?: { requestsPerMinute: number; tokensPerMinute: number };
    instructions: string;
  }> {
    return [
      {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        models: ['gpt-4', 'gpt-4-turbo-preview', 'gpt-3.5-turbo'],
        rateLimit: {
          requestsPerMinute: 3500,
          tokensPerMinute: 90000
        },
        instructions: 'Get your API key from https://platform.openai.com/api-keys'
      },
      {
        name: 'Anthropic',
        baseUrl: 'https://api.anthropic.com',
        models: ['claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'],
        rateLimit: {
          requestsPerMinute: 1000,
          tokensPerMinute: 40000
        },
        instructions: 'Get your API key from https://console.anthropic.com/'
      },
      {
        name: 'Google',
        baseUrl: 'https://generativelanguage.googleapis.com/v1',
        models: ['gemini-pro', 'gemini-pro-vision'],
        rateLimit: {
          requestsPerMinute: 60,
          tokensPerMinute: 32000
        },
        instructions: 'Get your API key from https://makersuite.google.com/app/apikey'
      },
      {
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        models: ['openai/gpt-4', 'anthropic/claude-3-opus', 'google/gemini-pro'],
        rateLimit: {
          requestsPerMinute: 100,
          tokensPerMinute: 100000
        },
        instructions: 'Get your API key from https://openrouter.ai/keys'
      }
    ];
  }

  /**
   * Export/Import configuration (for backup)
   */
  exportConfiguration(): string {
    const config = {
      providers: Array.from(this.providers.entries()).map(([id, provider]) => [
        id,
        {
          ...provider,
          apiKey: '[ENCRYPTED]' // Don't export actual keys
        }
      ]),
      usageStats: Array.from(this.usageStats.entries()),
      exportedAt: new Date().toISOString()
    };

    return JSON.stringify(config, null, 2);
  }

  /**
   * Check rate limits
   */
  checkRateLimit(providerId: string): { allowed: boolean; reason?: string } {
    const provider = this.providers.get(providerId);
    if (!provider || !provider.rateLimit) {
      return { allowed: true };
    }

    const stats = this.usageStats.get(providerId);
    if (!stats) {
      return { allowed: true };
    }

    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Simple rate limiting check (would need more sophisticated tracking in production)
    if (stats.requestsCount > provider.rateLimit.requestsPerMinute) {
      return { allowed: false, reason: 'Request rate limit exceeded' };
    }

    return { allowed: true };
  }

  // Private methods

  private generateId(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  private generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  private encryptApiKey(apiKey: string): string {
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  private decryptApiKey(encryptedApiKey: string): string {
    const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
    let decrypted = decipher.update(encryptedApiKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  private validateOpenAIKey(apiKey: string): boolean {
    return apiKey.startsWith('sk-') && apiKey.length > 40;
  }

  private validateAnthropicKey(apiKey: string): boolean {
    return apiKey.startsWith('sk-ant-') && apiKey.length > 40;
  }

  private validateGoogleKey(apiKey: string): boolean {
    return apiKey.length > 30 && /^[a-zA-Z0-9_-]+$/.test(apiKey);
  }

  /**
   * Cleanup old usage statistics
   */
  cleanup(maxAge = 2592000000): void { // 30 days default
    const cutoff = Date.now() - maxAge;
    
    for (const [providerId, stats] of this.usageStats.entries()) {
      if (stats.lastUsed.getTime() < cutoff) {
        this.usageStats.delete(providerId);
      }
    }
    
    console.log('🧹 AI key manager cleanup completed');
  }
}

// Export singleton instance
export const aiKeyManager = new AIKeyManager();
