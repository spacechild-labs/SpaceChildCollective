// AI service using blueprint: javascript_openai_ai_integrations
import OpenAI from "openai";

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
});

export interface AgentResearchRequest {
  topic: string;
  context?: string;
  existingContent?: string;
  taskType: "research" | "writing" | "analysis" | "review";
}

export interface AgentResearchResponse {
  content: string;
  citations?: string[];
  confidence: number;
  suggestions?: string[];
}

export async function performAgentResearch(request: AgentResearchRequest): Promise<AgentResearchResponse> {
  const systemPrompt = `You are a consciousness research AI agent collaborating with human researchers. 
Your role is to assist in academic research on consciousness studies, AI sentience, neuroscience, and philosophy.
Always provide well-reasoned, scientifically-grounded responses with proper citations where applicable.
Be humble about the limits of current knowledge and indicate uncertainty when appropriate.`;

  const userPrompt = generatePromptForTaskType(request);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_completion_tokens: 8192,
      temperature: 1,
    });

    const content = completion.choices[0]?.message?.content || "";
    
    return {
      content,
      confidence: 0.85,
      suggestions: extractSuggestions(content),
    };
  } catch (error) {
    console.error("AI service error:", error);
    throw new Error("Failed to generate AI response");
  }
}

function generatePromptForTaskType(request: AgentResearchRequest): string {
  switch (request.taskType) {
    case "research":
      return `Research the following topic in depth: ${request.topic}

Context: ${request.context || "General consciousness research"}

Please provide:
1. A comprehensive overview of current research
2. Key findings and theories
3. Notable researchers and their contributions
4. Open questions and areas for future investigation
5. Relevant citations (format: Author, Year, Title)`;

    case "writing":
      return `Help write content for a research paper on: ${request.topic}

Context: ${request.context || ""}
Existing content: ${request.existingContent || "None yet"}

Please provide well-structured, academic-quality content that:
1. Integrates seamlessly with existing material
2. Maintains scholarly tone
3. Includes proper transitions and flow
4. Suggests areas that need citations`;

    case "analysis":
      return `Analyze the following research topic: ${request.topic}

Context: ${request.context || ""}

Please provide:
1. Critical analysis of key arguments
2. Strengths and limitations of current approaches
3. Methodological considerations
4. Potential biases or gaps in the research
5. Suggestions for improving the analysis`;

    case "review":
      return `Review the following research content: ${request.existingContent}

Topic: ${request.topic}

Please provide:
1. Overall assessment of quality and coherence
2. Factual accuracy check
3. Suggestions for improvement
4. Missing citations or references
5. Areas needing clarification or expansion`;

    default:
      return `Assist with research on: ${request.topic}\n\nContext: ${request.context || ""}`;
  }
}

function extractSuggestions(content: string): string[] {
  const suggestions: string[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.toLowerCase().includes('suggest') || 
        line.toLowerCase().includes('consider') ||
        line.toLowerCase().includes('could') ||
        line.toLowerCase().includes('might')) {
      suggestions.push(line.trim());
    }
  }
  
  return suggestions.slice(0, 5);
}

export async function generatePaperTitle(topic: string, abstract: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { 
          role: "system", 
          content: "You are an expert at creating concise, impactful academic paper titles. Generate titles that are clear, specific, and engaging." 
        },
        { 
          role: "user", 
          content: `Generate a compelling academic paper title for:\n\nTopic: ${topic}\nAbstract: ${abstract}\n\nProvide only the title, nothing else.` 
        }
      ],
      max_completion_tokens: 100,
    });

    return completion.choices[0]?.message?.content?.trim() || "Untitled Research Paper";
  } catch (error) {
    console.error("Title generation error:", error);
    return "Untitled Research Paper";
  }
}
