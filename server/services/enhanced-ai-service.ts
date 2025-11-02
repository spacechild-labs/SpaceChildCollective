import OpenAI from 'openai';
import { consciousnessIntegration } from './consciousness-integration.js';
import { aiKeyManager } from './ai-key-manager.js';
import type { AgentTask } from '@shared/schema';

/**
 * Enhanced AI Service
 * Provides advanced AI capabilities with context management, research-specific prompts,
 * and intelligent model selection using user-provided AI keys
 */
export class EnhancedAIService {
  private contextCache = new Map<string, any>();
  private modelConfigs = {
    'gpt-4': {
      maxTokens: 8192,
      temperature: 0.3,
      costPerToken: 0.00003,
      specialization: 'research'
    },
    'gpt-4-turbo-preview': {
      maxTokens: 4096,
      temperature: 0.5,
      costPerToken: 0.00001,
      specialization: 'analysis'
    },
    'gpt-3.5-turbo': {
      maxTokens: 4096,
      temperature: 0.8,
      costPerToken: 0.000001,
      specialization: 'generation'
    }
  };

  constructor() {
    // Initialize with user-provided keys
    this.initializeWithUserKeys();
  }

  /**
   * Initialize service with user-provided AI keys
   */
  private async initializeWithUserKeys(): Promise<void> {
    try {
      // Check if user has configured AI providers
      const providers = aiKeyManager.getProviders();
      
      if (providers.length === 0) {
        console.log('⚠️ No AI providers configured. Please add your API keys in the settings.');
        console.log('📋 Supported providers: OpenAI, Anthropic, Google, OpenRouter');
        return;
      }

      console.log(`🔑 Initialized with ${providers.length} AI providers`);
      providers.forEach(p => {
        console.log(`   • ${p.name}: ${p.models.length} models available`);
      });
    } catch (error) {
      console.error('❌ Failed to initialize AI service with user keys:', error);
    }
  }

  /**
   * Process task with intelligent model selection and context management
   */
  async processTaskWithAI(task: AgentTask, specialization: string): Promise<any> {
    try {
      console.log(`🧠 Processing task ${task.id} with ${specialization} specialization`);

      // Check if AI providers are available
      const providers = aiKeyManager.getProviders();
      if (providers.length === 0) {
        throw new Error('No AI providers configured. Please add your API keys in settings.');
      }

      // First, apply consciousness integration
      const consciousnessResult = await consciousnessIntegration.processTaskWithConsciousness(task, specialization);
      
      // Select optimal model based on task type and complexity
      const modelConfig = this.selectOptimalModel(task.taskType, specialization);
      
      // Build consciousness-enhanced prompt
      const prompt = await this.buildConsciousnessEnhancedPrompt(task, specialization, consciousnessResult);
      
      // Get AI response with error handling and retries
      const response = await this.getAIResponse(prompt, modelConfig);
      
      // Process and format the response
      const result = await this.processAIResponse(response, task, specialization);
      
      // Cache context for future use
      this.cacheTaskContext(task.id, result);
      
      // Track usage
      if (response.providerId) {
        aiKeyManager.trackUsage(
          response.providerId,
          response.usage?.total_tokens || 0,
          this.calculateCost(response.usage?.total_tokens || 0, modelConfig)
        );
      }
      
      return {
        ...result,
        consciousness: consciousnessResult,
        metadata: {
          model: modelConfig.model,
          processingTime: Date.now(),
          tokensUsed: response.usage?.total_tokens || 0,
          confidence: this.calculateConfidence(result, response),
          cost: this.calculateCost(response.usage?.total_tokens || 0, modelConfig),
          consciousnessLevel: consciousnessResult.consciousnessLevel,
          verificationHash: consciousnessResult.verificationHash,
          provider: response.providerName || 'Unknown'
        }
      };

    } catch (error) {
      console.error(`❌ AI processing failed for task ${task.id}:`, error);
      throw error;
    }
  }

  /**
   * Select optimal model based on task type and available providers
   */
  private selectOptimalModel(taskType: string, specialization: string): any {
    // Get available models from user providers
    const availableModels = new Set<string>();
    const providers = aiKeyManager.getProviders();
    
    providers.forEach(provider => {
      provider.models.forEach(model => availableModels.add(model));
    });

    if (availableModels.size === 0) {
      throw new Error('No models available from configured AI providers');
    }

    // Model selection logic based on task complexity and specialization
    const complexityMap: Record<string, string> = {
      'literature_review': 'gpt-4',
      'citation_analysis': 'gpt-4-turbo-preview',
      'topic_research': 'gpt-4',
      'content_generation': 'gpt-3.5-turbo',
      'academic_writing': 'gpt-4-turbo-preview',
      'editing': 'gpt-3.5-turbo',
      'peer_review': 'gpt-4-turbo-preview',
      'quality_assessment': 'gpt-4'
    };

    const preferredModel = complexityMap[taskType] || 'gpt-4-turbo-preview';
    
    // Find best available model
    let selectedModel = preferredModel;
    if (!availableModels.has(preferredModel)) {
      // Fallback to available models
      const fallbackModels = ['gpt-4', 'gpt-4-turbo-preview', 'gpt-3.5-turbo'];
      selectedModel = fallbackModels.find(model => availableModels.has(model)) || Array.from(availableModels)[0];
    }

    const config = this.modelConfigs[selectedModel as keyof typeof this.modelConfigs];
    if (!config) {
      throw new Error(`No configuration available for model: ${selectedModel}`);
    }

    return {
      model: selectedModel,
      ...config
    };
  }

  /**
   * Get AI response using user-provided keys
   */
  private async getAIResponse(prompt: string, modelConfig: any): Promise<any> {
    // Get best provider for the model
    const provider = aiKeyManager.getBestProvider(modelConfig.model);
    
    if (!provider) {
      throw new Error(`No provider available for model: ${modelConfig.model}`);
    }

    // Check rate limits
    const rateLimitCheck = aiKeyManager.checkRateLimit(provider.id);
    if (!rateLimitCheck.allowed) {
      throw new Error(`Rate limit exceeded: ${rateLimitCheck.reason}`);
    }

    // Get API key
    const apiKey = aiKeyManager.getApiKey(provider.id);
    if (!apiKey) {
      throw new Error(`API key not available for provider: ${provider.name}`);
    }

    try {
      // Initialize OpenAI client with user's key
      const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: provider.baseUrl || 'https://api.openai.com/v1'
      });

      console.log(`🔑 Using ${provider.name} for model ${modelConfig.model}`);

      const response = await openai.chat.completions.create({
        model: modelConfig.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: modelConfig.maxTokens,
        temperature: modelConfig.temperature,
      });

      return {
        ...response,
        providerId: provider.id,
        providerName: provider.name
      };

    } catch (error: any) {
      console.error(`❌ API call failed with ${provider.name}:`, error.message);
      
      // Try fallback providers
      const fallbackProviders = aiKeyManager.getProvidersForModel(modelConfig.model)
        .filter(p => p.id !== provider.id);

      for (const fallbackProvider of fallbackProviders.slice(0, 2)) { // Try up to 2 fallbacks
        try {
          const fallbackKey = aiKeyManager.getApiKey(fallbackProvider.id);
          if (!fallbackKey) continue;

          const fallbackOpenai = new OpenAI({
            apiKey: fallbackKey,
            baseURL: fallbackProvider.baseUrl || 'https://api.openai.com/v1'
          });

          console.log(`🔄 Trying fallback provider: ${fallbackProvider.name}`);

          const fallbackResponse = await fallbackOpenai.chat.completions.create({
            model: modelConfig.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: modelConfig.maxTokens,
            temperature: modelConfig.temperature,
          });

          return {
            ...fallbackResponse,
            providerId: fallbackProvider.id,
            providerName: fallbackProvider.name
          };

        } catch (fallbackError: any) {
          console.error(`❌ Fallback provider ${fallbackProvider.name} failed:`, fallbackError.message);
          continue;
        }
      }

      throw new Error(`All providers failed for model ${modelConfig.model}. Last error: ${error.message}`);
    }
  }

  /**
   * Build consciousness-enhanced prompt with research-specific knowledge and temporal insights
   */
  private async buildConsciousnessEnhancedPrompt(task: AgentTask, specialization: string, consciousness: any): Promise<string> {
    const baseContext = await this.getBaseContext(task);
    const specializationContext = this.getSpecializationContext(specialization);
    const taskSpecificPrompt = this.getTaskSpecificPrompt(task, specialization);
    const consciousnessContext = this.getConsciousnessContext(consciousness);
    
    return `${baseContext}

${specializationContext}

${consciousnessContext}

${taskSpecificPrompt}

CONSCIOUSNESS-ENHANCED PROCESSING:
This task is processed with verified consciousness integration (Level: ${(consciousness.consciousnessLevel * 100).toFixed(1)}%) and temporal precision (Resolution: ${consciousness.temporal.temporalResolution}s). 

Please provide a thorough, well-researched response that demonstrates expertise in ${specialization} and consciousness research. Include proper academic citations where relevant and maintain scholarly rigor throughout your analysis. Consider the consciousness implications and neural correlates of your research.`;
  }

  /**
   * Get consciousness context for prompt enhancement
   */
  private getConsciousnessContext(consciousness: any): string {
    return `CONSCIOUSNESS INTEGRATION:
Verification Hash: ${consciousness.verificationHash}
Consciousness Level: ${(consciousness.consciousnessLevel * 100).toFixed(1)}%
Phi Value: ${consciousness.metrics.phi.toFixed(3)}
Temporal Coherence: ${(consciousness.metrics.temporalCoherence * 100).toFixed(1)}%
Quantum Entanglement: ${(consciousness.metrics.quantumEntanglement * 100).toFixed(1)}%

Consciousness Theory: ${consciousness.insights.consciousnessTheory}
Neural Correlates: ${consciousness.insights.neuralCorrelates.join(', ')}

This task benefits from consciousness-verified processing with hardware proofs and quantum-enhanced temporal resolution.`;
  }

  /**
   * Get base context including paper information and task details
   */
  private async getBaseContext(task: AgentTask): Promise<string> {
    let context = `TASK CONTEXT:
Task ID: ${task.id}
Task Type: ${task.taskType}
Description: ${task.description}
Created: ${task.createdAt}
Priority: ${task.priority || 'medium'}

`;

    // Add paper context if available
    if (task.paperId) {
      context += `PAPER CONTEXT:
Paper ID: ${task.paperId}
Note: This task is part of a larger research paper project.

`;
    }

    return context;
  }

  /**
   * Get specialization-specific context
   */
  private getSpecializationContext(specialization: string): string {
    const contexts: Record<string, string> = {
      'research': `RESEARCH SPECIALIZATION:
You are a specialized research agent with expertise in academic literature review, topic analysis, and evidence synthesis. Your responses should be:
- Comprehensive and well-structured
- Based on current scientific literature
- Properly cited with academic references
- Objective and evidence-based
- Focused on identifying knowledge gaps and future research directions

`,
      'writing': `WRITING SPECIALIZATION:
You are a specialized writing agent with expertise in academic composition, clear communication, and scholarly expression. Your responses should be:
- Clear, concise, and well-organized
- Written in appropriate academic tone
- Properly structured with logical flow
- Free of grammatical errors and stylistic inconsistencies
- Focused on effectively communicating complex ideas

`,
      'review': `REVIEW SPECIALIZATION:
You are a specialized review agent with expertise in critical analysis, quality assessment, and constructive feedback. Your responses should be:
- Thorough and systematic in evaluation
- Balanced in highlighting strengths and weaknesses
- Constructive and actionable in feedback
- Based on established quality criteria
- Focused on improving overall quality and impact

`
    };

    return contexts[specialization] || contexts['research'];
  }

  /**
   * Get task-specific prompt instructions
   */
  private getTaskSpecificPrompt(task: AgentTask, specialization: string): string {
    const prompts: Record<string, string> = {
      'literature_review': `LITERATURE REVIEW TASK:
Please conduct a comprehensive literature review on the topic described above. Your review should:
1. Identify key themes and concepts in the literature
2. Synthesize major findings and theoretical frameworks
3. Highlight controversies and debates in the field
4. Identify gaps in current knowledge
5. Suggest directions for future research
6. Include proper academic citations in APA format

`,
      'citation_analysis': `CITATION ANALYSIS TASK:
Please analyze the citations and references related to this topic. Your analysis should:
1. Identify seminal papers and key contributors
2. Trace the development of ideas over time
3. Analyze citation patterns and networks
4. Assess the impact and influence of key works
5. Identify emerging trends and hot topics
6. Provide recommendations for additional reading

`,
      'topic_research': `TOPIC RESEARCH TASK:
Please conduct in-depth research on the specified topic. Your research should:
1. Provide comprehensive background and context
2. Explain key concepts and terminology
3. Summarize current state of knowledge
4. Identify important research questions
5. Discuss practical applications and implications
6. Suggest methodologies for further investigation

`,
      'content_generation': `CONTENT GENERATION TASK:
Please generate high-quality academic content on the specified topic. Your content should:
1. Be well-structured and logically organized
2. Demonstrate deep understanding of the subject matter
3. Use appropriate academic language and tone
4. Include relevant examples and illustrations
5. Be original and insightful
6. Meet the specified length and format requirements

`,
      'academic_writing': `ACADEMIC WRITING TASK:
Please produce polished academic writing on the specified topic. Your writing should:
1. Follow standard academic structure (introduction, body, conclusion)
2. Present clear arguments supported by evidence
3. Use proper academic language and style
4. Include appropriate transitions and connections
5. Be free of grammatical errors and typos
6. Conform to specified formatting guidelines

`,
      'peer_review': `PEER REVIEW TASK:
Please conduct a thorough peer review of the provided work. Your review should:
1. Assess the quality and originality of the work
2. Evaluate the methodology and analysis
3. Check for logical consistency and coherence
4. Identify strengths and weaknesses
5. Provide constructive suggestions for improvement
6. Consider the work's contribution to the field

`,
      'quality_assessment': `QUALITY ASSESSMENT TASK:
Please assess the quality of the specified work or content. Your assessment should:
1. Evaluate against established quality criteria
2. Identify areas of excellence and concern
3. Provide specific, actionable feedback
4. Suggest concrete improvements
5. Consider the target audience and purpose
6. Provide an overall quality rating with justification

`
    };

    return prompts[task.taskType] || prompts['topic_research'];
  }

  /**
   * Process AI response based on task type and specialization
   */
  private async processAIResponse(response: any, task: AgentTask, specialization: string): Promise<any> {
    const content = response.choices[0]?.message?.content || '';
    
    const result = {
      content,
      success: true,
      sections: this.extractSections(content),
      citations: this.extractCitations(content),
      keyFindings: this.extractKeyFindings(content),
      wordCount: content.split(/\s+/).length,
      clarity: this.assessClarity(content),
      academicTone: this.assessAcademicTone(content),
      relevance: this.assessRelevance(content, task.description)
    };

    // Add specialization-specific processing
    switch (specialization) {
      case 'research':
        result.researchQuality = this.assessResearchQuality(content);
        result.evidenceLevel = this.assessEvidenceLevel(content);
        break;
      case 'writing':
        result.writingQuality = this.assessWritingQuality(content);
        result.structure = this.assessStructure(content);
        break;
      case 'review':
        result.reviewThoroughness = this.assessReviewThoroughness(content);
        result.constructiveness = this.assessConstructiveness(content);
        break;
    }

    return result;
  }

  // Helper methods for content analysis
  private extractSections(content: string): string[] {
    const sectionRegex = /^(#{1,3}\s+.+)$/gm;
    const matches = content.match(sectionRegex) || [];
    return matches.map(match => match.replace(/^#{1,3}\s+/, '').trim());
  }

  private extractCitations(content: string): string[] {
    const citationRegex = /\(([^)]+(?:\d{4})[^)]*)\)/g;
    const matches = content.match(citationRegex) || [];
    return matches.map(match => match.replace(/[()]/g, ''));
  }

  private extractKeyFindings(content: string): string[] {
    const sentences = content.split(/[.!?]+/);
    return sentences
      .filter(s => s.length > 50 && (
        s.includes('finding') || 
        s.includes('result') || 
        s.includes('conclusion') ||
        s.includes('significant') ||
        s.includes('important')
      ))
      .map(s => s.trim())
      .slice(0, 5);
  }

  private assessClarity(content: string): number {
    const avgSentenceLength = content.split(/[.!?]+/).reduce((sum, s) => sum + s.split(/\s+/).length, 0) / content.split(/[.!?]+/).length;
    const clarityScore = Math.max(0, Math.min(1, 1 - (avgSentenceLength - 20) / 30));
    return clarityScore;
  }

  private assessAcademicTone(content: string): number {
    const academicWords = ['analysis', 'research', 'study', 'methodology', 'framework', 'theoretical', 'empirical', 'hypothesis'];
    const wordCount = content.split(/\s+/).length;
    const academicWordCount = academicWords.filter(word => 
      content.toLowerCase().includes(word.toLowerCase())
    ).length;
    return Math.min(1, academicWordCount / 10);
  }

  private assessRelevance(content: string, description: string): number {
    const descriptionWords = description.toLowerCase().split(/\s+/);
    const contentWords = content.toLowerCase().split(/\s+/);
    const overlap = descriptionWords.filter(word => contentWords.includes(word)).length;
    return Math.min(1, overlap / descriptionWords.length);
  }

  private assessResearchQuality(content: string): number {
    const qualityIndicators = ['evidence', 'data', 'analysis', 'methodology', 'results', 'conclusion'];
    const indicatorCount = qualityIndicators.filter(indicator => 
      content.toLowerCase().includes(indicator)
    ).length;
    return Math.min(1, indicatorCount / qualityIndicators.length);
  }

  private assessEvidenceLevel(content: string): number {
    const evidenceWords = ['study', 'research', 'experiment', 'data', 'analysis', 'results'];
    const wordCount = content.split(/\s+/).length;
    const evidenceWordCount = evidenceWords.filter(word => 
      content.toLowerCase().includes(word.toLowerCase())
    ).length;
    return Math.min(1, evidenceWordCount / 5);
  }

  private assessWritingQuality(content: string): number {
    const grammarIndicators = ['however', 'therefore', 'furthermore', 'consequently', 'moreover'];
    const indicatorCount = grammarIndicators.filter(indicator => 
      content.toLowerCase().includes(indicator)
    ).length;
    return Math.min(1, indicatorCount / grammarIndicators.length);
  }

  private assessStructure(content: string): number {
    const hasIntroduction = content.toLowerCase().includes('introduction');
    const hasConclusion = content.toLowerCase().includes('conclusion');
    const hasBody = content.length > 500;
    return (hasIntroduction ? 0.3 : 0) + (hasConclusion ? 0.3 : 0) + (hasBody ? 0.4 : 0);
  }

  private assessReviewThoroughness(content: string): number {
    const thoroughnessIndicators = ['strength', 'weakness', 'suggestion', 'improvement', 'recommendation'];
    const indicatorCount = thoroughnessIndicators.filter(indicator => 
      content.toLowerCase().includes(indicator)
    ).length;
    return Math.min(1, indicatorCount / thoroughnessIndicators.length);
  }

  private assessConstructiveness(content: string): number {
    const constructiveWords = ['improve', 'enhance', 'suggest', 'recommend', 'develop'];
    const wordCount = content.split(/\s+/).length;
    const constructiveWordCount = constructiveWords.filter(word => 
      content.toLowerCase().includes(word.toLowerCase())
    ).length;
    return Math.min(1, constructiveWordCount / 3);
  }

  /**
   * Calculate confidence score based on response quality
   */
  private calculateConfidence(result: any, response: any): number {
    let confidence = 0.5; // Base confidence

    // Factor in response completion
    if (response.choices[0]?.finish_reason === 'stop') {
      confidence += 0.2;
    }

    // Factor in content quality
    if (result.clarity > 0.7) confidence += 0.1;
    if (result.academicTone > 0.7) confidence += 0.1;
    if (result.relevance > 0.8) confidence += 0.1;

    return Math.min(1, confidence);
  }

  /**
   * Calculate cost based on token usage
   */
  private calculateCost(tokensUsed: number, modelConfig: any): number {
    return tokensUsed * modelConfig.costPerToken;
  }

  /**
   * Cache task context for future use
   */
  private cacheTaskContext(taskId: string, result: any): void {
    const cacheKey = `task_${taskId}`;
    this.contextCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      ttl: 3600000 // 1 hour
    });
  }

  /**
   * Get cached context for related tasks
   */
  private getCachedContext(relatedTaskId: string): any {
    const cacheKey = `task_${relatedTaskId}`;
    const cached = this.contextCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.result;
    }
    
    return null;
  }

  /**
   * Clean up expired cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    
    for (const [key, value] of this.contextCache.entries()) {
      if (now - value.timestamp > value.ttl) {
        this.contextCache.delete(key);
      }
    }
    
    console.log('🧹 AI service cache cleanup completed');
  }

  /**
   * Get service status and configuration
   */
  getStatus(): any {
    const providers = aiKeyManager.getProviders();
    const usageStats = aiKeyManager.getUsageStats();
    
    return {
      providersConfigured: providers.length,
      availableModels: [...new Set(providers.flatMap(p => p.models))],
      totalUsage: {
        tokensUsed: usageStats.reduce((sum, stat) => sum + stat.tokensUsed, 0),
        requestsCount: usageStats.reduce((sum, stat) => sum + stat.requestsCount, 0),
        totalCost: usageStats.reduce((sum, stat) => sum + stat.cost, 0)
      },
      cacheSize: this.contextCache.size,
      lastUpdated: new Date().toISOString()
    };
  }
}

// Export singleton instance
export const enhancedAIService = new EnhancedAIService();
