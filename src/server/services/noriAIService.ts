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
    } catch (error) {
      console.log("[NORI] Planning source: MockAIProvider (service fallback)");
      console.error("Nori AI provider failed; using the local mock provider.", error);
      return new NoriAgentService(this.fallbackProvider).process(request);
    }
  }
}

function createProvider(): AIProvider {
  console.log("[NORI] Selected provider:", process.env.NORI_AI_PROVIDER);
  const providerName = (process.env.NORI_AI_PROVIDER ?? "mock").toLowerCase();
  if (providerName === "openai") {
    console.log("[NORI] Planning source configured: OpenAIProvider");
    try { return new OpenAIProvider(); }
    catch (error) {
      console.error("OpenAI provider could not be initialized; using mock provider.", error);
      return new MockAIProvider();
    }
  }
  if (providerName === "gemini") {
    console.log("[NORI] Planning source configured: GeminiProvider");
    try { return new GeminiProvider(); }
    catch (error) {
      console.error("Gemini provider could not be initialized; using mock provider.", error);
      return new MockAIProvider();
    }
  }
  if (providerName !== "mock") console.warn(`Unknown NORI_AI_PROVIDER "${providerName}"; using mock provider.`);
  console.log("[NORI] Planning source configured: MockAIProvider");
  return new MockAIProvider();
}

export const noriAIService = new NoriAIService();
