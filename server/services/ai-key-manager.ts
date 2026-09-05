import crypto from 'crypto';

/**
 * AI Provider Configuration
 */
interface AIProvider {
  id: string;
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
    // Initialize encryption key from environment, or generate an ephemeral one.
    const envKey = process.env.ENCRYPTION_KEY;
    if (!envKey) {
      console.warn(
        "[ai-key-manager] ENCRYPTION_KEY not set — using an ephemeral key; encrypted provider keys will not survive a restart. Set ENCRYPTION_KEY for persistence.",
      );
    }
    this.encryptionKey = envKey || this.generateEncryptionKey();
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
        models: [
          // GPT-4 Series (Most Capable)
          'gpt-4-turbo-preview',
          'gpt-4-1106-preview',
          'gpt-4-0125-preview',
          'gpt-4-vision-preview',
          'gpt-4',
          'gpt-4-32k',
          
          // GPT-3.5 Series (Fast & Cost-Effective)
          'gpt-3.5-turbo-0125',
          'gpt-3.5-turbo-1106',
          'gpt-3.5-turbo-16k',
          'gpt-3.5-turbo',
          
          // Embedding Models
          'text-embedding-ada-002',
          'text-embedding-3-small',
          'text-embedding-3-large',
          
          // Legacy Models
          'text-davinci-003',
          'text-davinci-002',
          'text-curie-001',
          'text-babbage-001',
          'text-ada-001'
        ],
        rateLimit: {
          requestsPerMinute: 3500,
          tokensPerMinute: 90000
        },
        instructions: 'Get your API key from https://platform.openai.com/api-keys'
      },
      {
        name: 'Anthropic',
        baseUrl: 'https://api.anthropic.com',
        models: [
          // Claude 3 Series (Latest)
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307',
          
          // Claude 2 Series
          'claude-2-1',
          'claude-2-0',
          'claude-2',
          
          // Claude Instant Series
          'claude-instant-1-2',
          'claude-instant-1-1',
          'claude-instant-1'
        ],
        rateLimit: {
          requestsPerMinute: 1000,
          tokensPerMinute: 40000
        },
        instructions: 'Get your API key from https://console.anthropic.com/'
      },
      {
        name: 'Google',
        baseUrl: 'https://generativelanguage.googleapis.com/v1',
        models: [
          // Gemini Series
          'gemini-1.5-pro-latest',
          'gemini-1.5-flash-latest',
          'gemini-1.5-pro',
          'gemini-1.5-flash',
          'gemini-pro-vision',
          'gemini-pro',
          
          // Legacy Models
          'text-bison-001',
          'chat-bison-001',
          'embedding-gecko-001'
        ],
        rateLimit: {
          requestsPerMinute: 60,
          tokensPerMinute: 32000
        },
        instructions: 'Get your API key from https://makersuite.google.com/app/apikey'
      },
      {
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        models: [
          // OpenAI Models via OpenRouter
          'openai/gpt-4-turbo-preview',
          'openai/gpt-4-vision-preview',
          'openai/gpt-4-1106-preview',
          'openai/gpt-4-0125-preview',
          'openai/gpt-4',
          'openai/gpt-3.5-turbo-0125',
          'openai/gpt-3.5-turbo-1106',
          'openai/gpt-3.5-turbo-16k',
          'openai/gpt-3.5-turbo',
          'openai/text-davinci-003',
          'openai/text-davinci-002',
          'openai/text-curie-001',
          'openai/text-babbage-001',
          'openai/text-ada-001',
          
          // Anthropic Models via OpenRouter
          'anthropic/claude-3-opus',
          'anthropic/claude-3-sonnet',
          'anthropic/claude-3-haiku',
          'anthropic/claude-2-1',
          'anthropic/claude-2',
          'anthropic/claude-instant-1-2',
          'anthropic/claude-instant-1',
          
          // Google Models via OpenRouter
          'google/gemini-pro',
          'google/gemini-pro-vision',
          'google/gemini-1.5-pro',
          'google/gemini-1.5-flash',
          'google/palm-2-chat-bison',
          'google/palm-2-codechat-bison',
          'google/palm-2-text-bison',
          
          // Meta Models via OpenRouter
          'meta-llama/llama-3-70b-instruct',
          'meta-llama/llama-3-8b-instruct',
          'meta-llama/llama-2-70b-chat',
          'meta-llama/llama-2-13b-chat',
          'meta-llama/llama-2-7b-chat',
          'meta-llama/codellama-70b-instruct',
          'meta-llama/codellama-34b-instruct',
          'meta-llama/codellama-13b-instruct',
          'meta-llama/codellama-7b-instruct',
          
          // Mistral Models via OpenRouter
          'mistralai/mistral-large',
          'mistralai/mistral-medium',
          'mistralai/mistral-small',
          'mistralai/mixtral-8x7b',
          'mistralai/mixtral-8x22b',
          'mistralai/mistral-7b-instruct',
          'mistralai/mistral-7b',
          
          // Cohere Models via OpenRouter
          'cohere/command-r-plus',
          'cohere/command-r',
          'cohere/command',
          'cohere/command-nightly',
          'cohere/command-light',
          'cohere/command-light-nightly',
          
          // AI21 Labs Models via OpenRouter
          'ai21/jamba-instruct',
          'ai21/jurassic-2-ultra',
          'ai21/jurassic-2-mid',
          'ai21/jurassic-2-contemporary',
          
          // Perplexity Models via OpenRouter
          'perplexity/pplx-70b-online',
          'perplexity/pplx-7b-online',
          'perplexity/pplx-7b-chat',
          
          // DeepSeek Models via OpenRouter
          'deepseek/deepseek-chat',
          'deepseek/deepseek-coder',
          
          // Qwen Models via OpenRouter
          'qwen/qwen-2-72b-instruct',
          'qwen/qwen-1.5-72b-chat',
          'qwen/qwen-1.5-14b-chat',
          'qwen/qwen-1.5-7b-chat',
          
          // Yi Models via OpenRouter
          '01-ai/yi-34b-chat',
          '01-ai/yi-34b',
          '01-ai/yi-6b-chat',
          
          // Mixtral Models via OpenRouter
          'mistralai/mixtral-8x22b-instruct',
          'mistralai/mixtral-8x7b-instruct',
          
          // Other Notable Models
          'nousresearch/nous-hermes-2-mistral-7b-dpo',
          'teknium/openhermes-2.5-mistral-7b',
          'phind/phind-codellama-34b-v2',
          'wizardlm/wizardlm-70b',
          'recursal/rwkv-5-world-3b',
          'sophosynergy/xwin-ml-7b-v0.2'
        ],
        rateLimit: {
          requestsPerMinute: 100,
          tokensPerMinute: 100000
        },
        instructions: 'Get your API key from https://openrouter.ai/keys'
      },
      {
        name: 'Cohere',
        baseUrl: 'https://api.cohere.ai/v1',
        models: [
          'command-r-plus',
          'command-r',
          'command',
          'command-nightly',
          'command-light',
          'command-light-nightly',
          'embed-english-v3.0',
          'embed-multilingual-v3.0',
          'embed-english-light-v3.0',
          'embed-multilingual-light-v3.0'
        ],
        rateLimit: {
          requestsPerMinute: 1000,
          tokensPerMinute: 40000
        },
        instructions: 'Get your API key from https://dashboard.cohere.com/api-keys'
      },
      {
        name: 'Mistral AI',
        baseUrl: 'https://api.mistral.ai/v1',
        models: [
          'mistral-large-latest',
          'mistral-medium-latest',
          'mistral-small-latest',
          'mixtral-8x7b-2410',
          'mixtral-8x22b-2410',
          'mistral-7b-instruct-v0.2',
          'mistral-embed',
          'open-mistral-7b',
          'open-mixtral-8x7b',
          'open-mixtral-8x22b'
        ],
        rateLimit: {
          requestsPerMinute: 1000,
          tokensPerMinute: 50000
        },
        instructions: 'Get your API key from https://console.mistral.ai/user/api-keys'
      },
      {
        name: 'Groq',
        baseUrl: 'https://api.groq.com/openai/v1',
        models: [
          'llama3-70b-8192',
          'llama3-8b-8192',
          'llama2-70b-4096',
          'mixtral-8x7b-32768',
          'gemma-7b-it',
          'llama-guard-3-8b',
          'llama3-groq-70b-8192-tool-use-preview',
          'llama3-groq-8b-8192-tool-use-preview'
        ],
        rateLimit: {
          requestsPerMinute: 30,
          tokensPerMinute: 14400
        },
        instructions: 'Get your API key from https://console.groq.com/keys'
      },
      {
        name: 'Together AI',
        baseUrl: 'https://api.together.xyz/v1',
        models: [
          // Meta Models
          'meta-llama/Llama-3-70b-chat-hf',
          'meta-llama/Llama-3-8b-chat-hf',
          'meta-llama/Llama-2-70b-chat-hf',
          'meta-llama/Llama-2-13b-chat-hf',
          'meta-llama/Llama-2-7b-chat-hf',
          'meta-llama/CodeLlama-70b-Instruct-hf',
          'meta-llama/CodeLlama-34b-Instruct-hf',
          'meta-llama/CodeLlama-13b-Instruct-hf',
          'meta-llama/CodeLlama-7b-Instruct-hf',
          
          // Mistral Models
          'mistralai/Mixtral-8x7B-v0.1',
          'mistralai/Mixtral-8x22B-v0.1',
          'mistralai/Mistral-7B-Instruct-v0.2',
          
          // Google Models
          'google/gemma-7b-it',
          'google/gemma-2b-it',
          
          // Qwen Models
          'Qwen/Qwen1.5-72B-Chat',
          'Qwen/Qwen1.5-14B-Chat',
          'Qwen/Qwen1.5-7B-Chat',
          'Qwen/Qwen1.5-1.8B-Chat',
          
          // Yi Models
          '01-ai/Yi-34B-Chat',
          '01-ai/Yi-6B-Chat',
          
          // Other Models
          'togethercomputer/RedPajama-INCITE-7B-Chat',
          'togethercomputer/RedPajama-INCITE-7B-Instruct',
          'databricks/dbrx-instruct',
          'NousResearch/Nous-Hermes-2-Mixtral-7B-DPO',
          'WizardLM/WizardLM-70B-V1.0',
          'cognitivecomputations/dolphin-2.5-mixtral-8x7b'
        ],
        rateLimit: {
          requestsPerMinute: 600,
          tokensPerMinute: 600000
        },
        instructions: 'Get your API key from https://api.together.xyz/settings/api-keys'
      },
      {
        name: 'Replicate',
        baseUrl: 'https://api.replicate.com/v1',
        models: [
          'meta/meta-llama-3-70b-instruct',
          'meta/meta-llama-3-8b-instruct',
          'mistralai/mixtral-8x7b-instruct-v0.1',
          'mistralai/mistral-7b-instruct-v0.2',
          'stability-ai/stable-diffusion-3',
          'stability-ai/sdxl-turbo',
          'openai/whisper-large-v3',
          'meta/musicgen-large'
        ],
        rateLimit: {
          requestsPerMinute: 120,
          tokensPerMinute: 100000
        },
        instructions: 'Get your API key from https://replicate.com/account/api-tokens'
      },
      {
        name: 'Parallel AI',
        baseUrl: 'https://api.parallel.ai',
        models: [
          // Chat API Models (OpenAI-compatible)
          'speed',  // Low latency web research model
          
          // Task API Processors (Deep Research)
          'base',   // Enrichment processor
          'pro',    // Deep research standard
          'pro-fast', // Deep research fast (2-5x faster)
          'ultra',  // Most comprehensive research
          'ultra-fast', // Fastest comprehensive research
          
          // Research Modes
          'parallel-search',   // Search API
          'parallel-extract',  // Extract API
          'parallel-chat',     // Chat API  
          'parallel-deep-research' // Task API Deep Research
        ],
        rateLimit: {
          requestsPerMinute: 300, // Chat API default rate limit
          tokensPerMinute: 100000
        },
        instructions: 'Get your API key from https://platform.parallel.ai/ - Parallel AI provides web research tools including Search, Extract, Chat, and Deep Research APIs'
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

  /** Derive a stable 32-byte AES key from the configured secret. */
  private getKey(): Buffer {
    return crypto.createHash('sha256').update(this.encryptionKey).digest();
  }

  private encryptApiKey(apiKey: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Authenticated format: iv:authTag:ciphertext (hex).
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decryptApiKey(encryptedApiKey: string): string {
    const [ivHex, tagHex, dataHex] = encryptedApiKey.split(':');
    if (!ivHex || !tagHex || !dataHex) {
      throw new Error('Malformed encrypted API key');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.getKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return decrypted.toString('utf8');
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
