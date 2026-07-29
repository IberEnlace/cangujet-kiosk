import type { NoriChatRequest, NoriChatResponse, NoriIntent } from "./noriChat";

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

export type NoriSemanticInterpretation = {
  primaryIntent: NoriIntent;
  secondaryIntents: NoriIntent[];
  confidence: number;
  needsClarification: boolean;
  clarificationReason: string | null;
  constraints: {
    maxBudget: number | null;
    pricePreference: "affordable" | "cheaper" | null;
    minProtein: number | null;
    maxCalories: number | null;
    portionPreference: "light" | "filling" | "large" | null;
    dietaryPreferences: string[];
    allergens: string[];
    excludedIngredients: string[];
    preferredIngredients: string[];
    spicePreference: "spicy" | "mild" | null;
    temperaturePreference: "hot" | "cold" | null;
    category: string | null;
    mealType: string | null;
    speedPreference: "quick" | null;
    healthPreference: "healthy" | "light" | null;
    satietyPreference: "filling" | null;
  };
  references: {
    selectedOrdinal: number | null;
    refersToPreviousRecommendations: boolean;
    refersToCurrentCart: boolean;
    refersToLastProduct: boolean;
  };
};

export interface AIProvider {
  buildPrompt(request: NoriChatRequest): string;
  interpret?(context: AIProviderContext): Promise<unknown>;
  callTools(context: AIProviderContext): Promise<AIToolCall[]>;
  generateResponse(context: AIProviderContext): Promise<NoriChatResponse>;
}
