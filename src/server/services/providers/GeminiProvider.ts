import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  type FunctionDeclaration,
} from "@google/genai";
import type { AIProvider, AIProviderContext, AIToolCall } from "../../types/aiProvider";
import type { NoriChatRequest, NoriChatResponse } from "../../types/noriChat";
import { allowedNoriTools, executeNoriTool, isAllowedNoriTool } from "../noriToolLayer";
import { buildProviderResponse } from "./providerResponseUtils";
import { getNoriLanguageInstruction } from "../../../shared/languages";
import { NORI_SEMANTIC_JSON_SCHEMA } from "../noriSemanticInterpretation";

const FUNCTION_DECLARATIONS: FunctionDeclaration[] = [
  declaration("searchProducts", "Search menu products using the query.", { query: stringSchema() }, ["query"]),
  declaration("recommendProducts", "Recommend products using structured filters.", {
    query: stringSchema(), maxPrice: numberSchema(), minProtein: numberSchema(), maxCalories: numberSchema(),
    dietaryTags: stringArraySchema(), category: stringSchema(), keyword: stringSchema(), allergens: stringArraySchema(),
    spicy: booleanSchema(), kids: booleanSchema(), limit: { type: "integer", minimum: 1, maximum: 8 },
  }),
  declaration("findByBudget", "Find products at or below the maximum price.", { maxPrice: numberSchema() }, ["maxPrice"]),
  declaration("findHighProtein", "Find products meeting a minimum protein amount.", { minProtein: numberSchema() }),
  declaration("findHealthyMeals", "Find healthy products under a calorie maximum.", { maxCalories: numberSchema() }),
  declaration("findVeganMeals", "Find vegan products.", {}),
  declaration("findVegetarianMeals", "Find vegetarian products.", {}),
  declaration("findKidsMeals", "Find kids products.", {}),
  declaration("findSpicyMeals", "Find spicy products.", {}),
  declaration("checkAllergens", "Check all menu products against allergens.", { allergens: stringArraySchema() }, ["allergens"]),
  declaration("checkProductAllergens", "Check one product against allergens.", {
    productId: stringSchema(), allergens: stringArraySchema(),
  }, ["productId", "allergens"]),
];

function declaration(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): FunctionDeclaration {
  return {
    name,
    description,
    parametersJsonSchema: { type: "object", properties, required, additionalProperties: false },
  };
}
function stringSchema() { return { type: "string" }; }
function numberSchema() { return { type: "number", minimum: 0 }; }
function booleanSchema() { return { type: "boolean" }; }
function stringArraySchema() { return { type: "array", items: { type: "string" } }; }

export class GeminiProvider implements AIProvider {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly timeoutMs: number;
  private toolCalls: AIToolCall[] = [];

  constructor(apiKey = process.env.GEMINI_API_KEY) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is required when NORI_AI_PROVIDER=gemini.");
    this.client = new GoogleGenAI({ apiKey });
    this.model = process.env.NORI_GEMINI_MODEL ?? "gemini-3.5-flash";
    this.timeoutMs = Number(process.env.NORI_AI_TIMEOUT_MS ?? 15_000);
  }

  buildPrompt(request: NoriChatRequest): string {
    return [
      "Select the minimum approved Nori menu tools required for the request.",
      "Do not answer with product facts. Do not create or modify product data.",
      "All products, prices, nutrition, allergens, availability, stock, cart state, and order status come from server tools only.",
      getNoriLanguageInstruction(request.language),
      `Active allergens: ${JSON.stringify(request.activeAllergens)}`,
      `Cart product IDs and quantities: ${JSON.stringify(request.cart)}`,
      `Session constraints: ${JSON.stringify(request.conversationState ? {
        maxBudget: request.conversationState.maxBudget,
        minProtein: request.conversationState.minProtein,
        maxCalories: request.conversationState.maxCalories,
        activeAllergens: request.conversationState.activeAllergens,
        dietaryPreferences: request.conversationState.dietaryPreferences,
        excludedIngredients: request.conversationState.excludedIngredients,
        rankingPriorities: request.conversationState.rankingPriorities,
      } : {})}`,
    ].join("\n");
  }

  async interpret(context: AIProviderContext): Promise<unknown> {
    const response = await withTimeout(this.client.models.generateContent({
      model: this.model,
      contents: `${context.systemPrompt}\n\nCustomer message:\n${context.request.message}`,
      config: {
        responseMimeType: "application/json",
        responseJsonSchema: NORI_SEMANTIC_JSON_SCHEMA,
      },
    }), this.timeoutMs);
    if (!response.text) throw new Error("Gemini returned no semantic interpretation.");
    try {
      return JSON.parse(response.text) as unknown;
    } catch {
      throw new Error("Gemini returned invalid semantic JSON.");
    }
  }

  async callTools(context: AIProviderContext): Promise<AIToolCall[]> {
    const response = await withTimeout(this.client.models.generateContent({
      model: this.model,
      contents: `${context.systemPrompt}\n\nCustomer message:\n${context.request.message}`,
      config: {
        tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }],
        toolConfig: {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: [...allowedNoriTools],
          },
        },
      },
    }), this.timeoutMs);
    const functionCalls = response.functionCalls ?? [];
    if (functionCalls.length === 0) throw new Error("Gemini returned no Nori function call.");
    this.toolCalls = functionCalls.map(functionCall => {
      if (!functionCall.name || !isAllowedNoriTool(functionCall.name)) throw new Error("Gemini requested an unsupported tool.");
      const args = functionCall.args;
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Gemini tool arguments must be an object.");
      const toolCall: AIToolCall = { name: functionCall.name, arguments: args };

      executeNoriTool(toolCall);
      return toolCall;
    });
    return this.toolCalls;
  }

  async generateResponse(context: AIProviderContext): Promise<NoriChatResponse> {
    if (this.toolCalls.length === 0) throw new Error("Gemini tool calls were not prepared.");
    return buildProviderResponse(this.toolCalls, context.request);
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("NORI_AI_TIMEOUT_MS must be a positive number.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Gemini request timed out after ${timeoutMs}ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
