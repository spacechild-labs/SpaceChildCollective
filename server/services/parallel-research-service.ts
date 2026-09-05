import { aiKeyManager, type AIKeyManager } from './ai-key-manager';

interface ParallelSearchResult {
  url: string;
  title: string;
  publish_date: string | null;
  excerpts: string[];
}

interface ParallelSearchResponse {
  search_id: string;
  results: ParallelSearchResult[];
  warnings: string[] | null;
  usage: Array<{ name: string; count: number }>;
}

interface ParallelExtractResult {
  url: string;
  title: string;
  publish_date: string | null;
  excerpts: string[] | null;
  full_content: string | null;
}

interface ParallelExtractResponse {
  extract_id: string;
  results: ParallelExtractResult[];
  errors: string[];
  warnings: string[] | null;
  usage: Array<{ name: string; count: number }>;
}

interface ParallelChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ParallelChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface ParallelDeepResearchBasis {
  field: string;
  reasoning: string;
  citations: Array<{
    url: string;
    excerpts: string[];
    title?: string;
  }>;
  confidence: 'high' | 'medium' | 'low';
}

interface ParallelDeepResearchResponse {
  run_id: string;
  status: 'running' | 'completed' | 'failed';
  output?: {
    content: any;
    basis: ParallelDeepResearchBasis[];
  };
  created_at: string;
  completed_at?: string;
  processor: string;
  warnings: string[] | null;
  error: string | null;
}

interface SearchOptions {
  objective: string;
  searchQueries?: string[];
  maxResults?: number;
  maxCharsPerResult?: number;
}

interface ExtractOptions {
  urls: string[];
  objective?: string;
  excerpts?: boolean;
  fullContent?: boolean;
}

interface ChatOptions {
  messages: ParallelChatMessage[];
  stream?: boolean;
  responseFormat?: {
    type: 'json_schema';
    json_schema: {
      name: string;
      schema: object;
    };
  };
}

interface DeepResearchOptions {
  input: string;
  processor?: 'base' | 'pro' | 'pro-fast' | 'ultra' | 'ultra-fast';
  outputType?: 'auto' | 'text';
  taskSpec?: {
    output_schema?: {
      type: 'json' | 'text';
      json_schema?: object;
      description?: string;
    };
  };
}

export class ParallelResearchService {
  private baseUrl = 'https://api.parallel.ai';
  private providerId: string | null = null;

  constructor(private readonly keyManager: AIKeyManager = aiKeyManager) {
    // Provider records are loaded asynchronously by AIKeyManager. Resolving in
    // the constructor would permanently miss records that have not loaded yet.
  }

  async initialize(): Promise<void> {
    this.resolveProvider();
  }

  private resolveProvider(): void {
    const parallelProviders = this.keyManager.getProviders()
      .filter((provider) => provider.name === 'Parallel AI')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
    this.providerId = parallelProviders[0]?.id ?? null;
  }

  private getApiKey(): string {
    this.resolveProvider();
    if (this.providerId) {
      const key = this.keyManager.getApiKey(this.providerId);
      if (key) return key;
    }
    
    const envKey = process.env.PARALLEL_API_KEY;
    if (envKey) return envKey;
    
    throw new Error('Parallel AI API key not configured. Please add your API key.');
  }

  async search(options: SearchOptions): Promise<ParallelSearchResponse> {
    const apiKey = this.getApiKey();
    
    const body = {
      objective: options.objective,
      search_queries: options.searchQueries || [options.objective],
      max_results: options.maxResults || 10,
      excerpts: {
        max_chars_per_result: options.maxCharsPerResult || 10000
      }
    };

    const response = await fetch(`${this.baseUrl}/v1beta/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'parallel-beta': 'search-extract-2025-10-10'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Parallel Search API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as ParallelSearchResponse;
    
    if (this.providerId) {
      this.keyManager.trackUsage(this.providerId, 1000, 0.01);
    }
    
    console.log(`🔍 Parallel Search completed: ${result.results.length} results`);
    return result;
  }

  async extract(options: ExtractOptions): Promise<ParallelExtractResponse> {
    const apiKey = this.getApiKey();
    
    const body = {
      urls: options.urls,
      objective: options.objective,
      excerpts: options.excerpts ?? true,
      full_content: options.fullContent ?? false
    };

    const response = await fetch(`${this.baseUrl}/v1beta/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'parallel-beta': 'search-extract-2025-10-10'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Parallel Extract API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as ParallelExtractResponse;
    
    if (this.providerId) {
      this.keyManager.trackUsage(this.providerId, options.urls.length * 500, 0.005 * options.urls.length);
    }
    
    console.log(`📄 Parallel Extract completed: ${result.results.length} pages extracted`);
    return result;
  }

  async chat(options: ChatOptions): Promise<ParallelChatResponse> {
    const apiKey = this.getApiKey();
    
    const body: any = {
      model: 'speed',
      messages: options.messages,
      stream: options.stream ?? false
    };

    if (options.responseFormat) {
      body.response_format = options.responseFormat;
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Parallel Chat API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as ParallelChatResponse;
    
    if (this.providerId && result.usage) {
      this.keyManager.trackUsage(this.providerId, result.usage.total_tokens, 0.001 * result.usage.total_tokens / 1000);
    }
    
    console.log(`💬 Parallel Chat completed`);
    return result;
  }

  async startDeepResearch(options: DeepResearchOptions): Promise<{ runId: string }> {
    const apiKey = this.getApiKey();
    
    const body: any = {
      input: options.input,
      processor: options.processor || 'ultra'
    };

    if (options.taskSpec) {
      body.task_spec = options.taskSpec;
    } else if (options.outputType === 'text') {
      body.task_spec = {
        output_schema: { type: 'text' }
      };
    }

    const response = await fetch(`${this.baseUrl}/v1/tasks/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Parallel Deep Research API error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    
    console.log(`🔬 Parallel Deep Research started: ${result.run_id}`);
    return { runId: result.run_id };
  }

  async getDeepResearchResult(runId: string): Promise<ParallelDeepResearchResponse> {
    const apiKey = this.getApiKey();
    
    const response = await fetch(`${this.baseUrl}/v1/tasks/runs/${runId}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Parallel Deep Research result API error: ${response.status} - ${error}`);
    }

    const result = await response.json() as ParallelDeepResearchResponse;
    
    if (result.status === 'completed' && this.providerId) {
      this.keyManager.trackUsage(this.providerId, 50000, 5.0);
    }
    
    return result;
  }

  async waitForDeepResearch(runId: string, maxWaitMs: number = 2700000): Promise<ParallelDeepResearchResponse> {
    const startTime = Date.now();
    const pollInterval = 10000;
    
    while (Date.now() - startTime < maxWaitMs) {
      const result = await this.getDeepResearchResult(runId);
      
      if (result.status === 'completed' || result.status === 'failed') {
        console.log(`🔬 Parallel Deep Research ${result.status}: ${runId}`);
        return result;
      }
      
      console.log(`⏳ Deep Research still running: ${runId}`);
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error(`Deep Research timed out after ${maxWaitMs}ms`);
  }

  async conductResearch(query: string, options?: {
    mode?: 'quick' | 'standard' | 'deep';
    structured?: boolean;
  }): Promise<{
    answer: string;
    citations: Array<{ url: string; title?: string; excerpt?: string }>;
    confidence: 'high' | 'medium' | 'low';
    researchMethod: string;
  }> {
    const mode = options?.mode || 'standard';
    
    try {
      if (mode === 'quick') {
        const chatResult = await this.chat({
          messages: [
            { role: 'user', content: query }
          ],
          responseFormat: options?.structured ? {
            type: 'json_schema',
            json_schema: {
              name: 'research_response',
              schema: {
                type: 'object',
                properties: {
                  reasoning: { type: 'string', description: 'Step by step reasoning' },
                  answer: { type: 'string', description: 'Direct answer to the question' },
                  citations: { 
                    type: 'array', 
                    items: { type: 'string' },
                    description: 'Sources cited'
                  }
                }
              }
            }
          } : undefined
        });

        const content = chatResult.choices[0]?.message?.content || '';
        
        return {
          answer: content,
          citations: [],
          confidence: 'medium',
          researchMethod: 'parallel-chat'
        };
      }
      
      if (mode === 'standard') {
        const searchResult = await this.search({
          objective: query,
          maxResults: 10
        });
        
        const citations = searchResult.results.map(r => ({
          url: r.url,
          title: r.title,
          excerpt: r.excerpts?.[0]?.substring(0, 500)
        }));
        
        // Build context with total length limit of 15000 chars to stay well under the 20000 char API limit
        const MAX_CONTEXT_LENGTH = 15000;
        const MAX_CHARS_PER_RESULT = 1200;
        
        let contextParts: string[] = [];
        let totalLength = 0;
        
        for (const r of searchResult.results) {
          // Guard against undefined excerpts
          const rawExcerpts = r.excerpts && Array.isArray(r.excerpts) ? r.excerpts.join('\n') : '';
          const excerptContent = rawExcerpts.substring(0, MAX_CHARS_PER_RESULT);
          const part = `Source: ${r.title || 'Unknown'}\nURL: ${r.url}\nContent: ${excerptContent}`;
          
          if (totalLength + part.length > MAX_CONTEXT_LENGTH) {
            break;
          }
          
          contextParts.push(part);
          totalLength += part.length;
        }
        
        // Final safety clamp on total context
        let context = contextParts.join('\n\n');
        if (context.length > MAX_CONTEXT_LENGTH) {
          context = context.substring(0, MAX_CONTEXT_LENGTH);
        }
        
        const synthesisResult = await this.chat({
          messages: [
            { 
              role: 'system', 
              content: 'You are a research assistant. Synthesize the provided search results to answer the user\'s question. Cite sources.' 
            },
            { 
              role: 'user', 
              content: `Question: ${query}\n\nSearch Results:\n${context}` 
            }
          ]
        });
        
        return {
          answer: synthesisResult.choices[0]?.message?.content || '',
          citations,
          confidence: searchResult.results.length > 5 ? 'high' : 'medium',
          researchMethod: 'parallel-search+chat'
        };
      }
      
      if (mode === 'deep') {
        const { runId } = await this.startDeepResearch({
          input: query,
          processor: 'ultra',
          outputType: 'text'
        });
        
        const result = await this.waitForDeepResearch(runId);
        
        if (result.status === 'failed') {
          throw new Error(`Deep research failed: ${result.error}`);
        }
        
        const citations = result.output?.basis?.flatMap(b => 
          b.citations.map(c => ({
            url: c.url,
            title: c.title,
            excerpt: c.excerpts?.[0]
          }))
        ) || [];
        
        return {
          answer: typeof result.output?.content === 'string' 
            ? result.output.content 
            : JSON.stringify(result.output?.content, null, 2),
          citations,
          confidence: 'high',
          researchMethod: 'parallel-deep-research'
        };
      }
      
      throw new Error(`Unknown research mode: ${mode}`);
    } catch (error) {
      console.error('❌ Parallel research error:', error);
      throw error;
    }
  }

  async extractFromUrls(urls: string[], objective?: string): Promise<{
    content: string;
    sources: Array<{ url: string; title: string; date?: string }>;
  }> {
    const result = await this.extract({
      urls,
      objective,
      excerpts: true,
      fullContent: false
    });
    
    const content = result.results
      .map(r => `## ${r.title}\n${r.excerpts?.join('\n\n') || ''}`)
      .join('\n\n---\n\n');
    
    const sources = result.results.map(r => ({
      url: r.url,
      title: r.title,
      date: r.publish_date || undefined
    }));
    
    return { content, sources };
  }

  async setApiKey(apiKey: string): Promise<string> {
    this.resolveProvider();
    const providerConfig = {
      name: 'Parallel AI',
      apiKey,
      baseUrl: this.baseUrl,
      models: [
        'speed',
        'base', 'pro', 'pro-fast', 'ultra', 'ultra-fast',
        'parallel-search', 'parallel-extract', 'parallel-chat', 'parallel-deep-research'
      ],
      isActive: true,
      rateLimit: {
        requestsPerMinute: 300,
        tokensPerMinute: 100000
      }
    };
    if (this.providerId) {
      await this.keyManager.updateProvider(this.providerId, providerConfig);
      console.log('✅ Parallel AI provider configured');
      return this.providerId;
    }

    const providerId = await this.keyManager.addProvider({ ...providerConfig, id: '' });
    
    this.providerId = providerId;
    console.log('✅ Parallel AI provider configured');
    return providerId;
  }

  isConfigured(): boolean {
    this.resolveProvider();
    if (this.providerId) {
      const key = this.keyManager.getApiKey(this.providerId);
      if (key) return true;
    }
    return !!process.env.PARALLEL_API_KEY;
  }

  getCapabilities(): string[] {
    return [
      'web-search',
      'url-extraction', 
      'web-chat',
      'deep-research',
      'structured-output',
      'citations',
      'real-time-data'
    ];
  }
}

export const parallelResearchService = new ParallelResearchService();
