import type { AIProvider } from "../types/aiProvider";
import type { NoriChatRequest, NoriChatResponse } from "../types/noriChat";
import { MockAIProvider } from "./providers/MockAIProvider";
import { OpenAIProvider } from "./providers/OpenAIProvider";
import { GeminiProvider } from "./providers/GeminiProvider";
import { NoriAgentService } from "./noriAgentService";

export class NoriAIService {
  private readonly fallbackProvider = new MockAIProvider();
  private readonly agent: NoriAgentService;

  constructor(private readonly provider: AIProvider = createProvider()) {
    this.agent = new NoriAgentService(this.provider);
  }

  async chat(request: NoriChatRequest): Promise<NoriChatResponse> {
    try {
      return await this.agent.process(request);
    } catch {
      if (process.env.NODE_ENV !== "production") console.warn("Nori provider failed; using the local fallback.");
      return new NoriAgentService(this.fallbackProvider).process(request);
    }
  }
}

function createProvider(): AIProvider {
  const providerName = (process.env.NORI_AI_PROVIDER ?? "mock").toLowerCase();
  if (providerName === "openai") {
    try { return new OpenAIProvider(); }
    catch {
      if (process.env.NODE_ENV !== "production") console.warn("OpenAI provider could not be initialized; using the local fallback.");
      return new MockAIProvider();
    }
  }
  if (providerName === "gemini") {
    try { return new GeminiProvider(); }
    catch {
      if (process.env.NODE_ENV !== "production") console.warn("Gemini provider could not be initialized; using the local fallback.");
      return new MockAIProvider();
    }
  }
  if (providerName !== "mock" && process.env.NODE_ENV !== "production") console.warn("Unknown Nori provider; using the local fallback.");
  return new MockAIProvider();
}

export const noriAIService = new NoriAIService();
