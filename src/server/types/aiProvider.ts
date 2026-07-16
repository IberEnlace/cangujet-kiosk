import type { NoriChatRequest, NoriChatResponse } from "./noriChat";

export type AIToolName =
  | "searchProducts"
  | "recommendProducts"
  | "findByBudget"
  | "findHighProtein"
  | "findHealthyMeals"
  | "findVeganMeals"
  | "findVegetarianMeals"
  | "findKidsMeals"
  | "findSpicyMeals"
  | "checkAllergens"
  | "checkProductAllergens";

export type AIToolCall = {
  name: AIToolName;
  arguments: Record<string, unknown>;
};

export type AIProviderContext = {
  request: NoriChatRequest;
  systemPrompt: string;
};

export interface AIProvider {
  buildPrompt(request: NoriChatRequest): string;
  callTools(context: AIProviderContext): Promise<AIToolCall[]>;
  generateResponse(context: AIProviderContext): Promise<NoriChatResponse>;
}
