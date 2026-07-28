import OpenAI from "openai";
import type { AIProvider, AIProviderContext, AIToolCall } from "../../types/aiProvider";
import type { NoriChatRequest, NoriChatResponse } from "../../types/noriChat";
import { isAllowedNoriTool, validateNoriToolCall } from "../noriToolLayer";
import { buildProviderResponse } from "./providerResponseUtils";
import { getNoriLanguageInstruction } from "../../../shared/languages";

const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  tool("searchProducts", "Search the Morrow menu using product names, descriptions, categories, tags, keywords, and vector tags.", {
    query: { type: "string" },
  }, ["query"]),
  tool("recommendProducts", "Recommend menu products using structured customer filters.", {
    query: { type: "string" }, maxPrice: { type: "number" }, minProtein: { type: "number" },
    maxCalories: { type: "number" }, dietaryTags: { type: "array", items: { type: "string" } },
    category: { type: "string" }, keyword: { type: "string" }, allergens: { type: "array", items: { type: "string" } },
    spicy: { type: "boolean" }, kids: { type: "boolean" }, limit: { type: "integer", minimum: 1, maximum: 8 },
  }),
  tool("findByBudget", "Find products at or below a maximum price.", { maxPrice: { type: "number", minimum: 0 } }, ["maxPrice"]),
  tool("findHighProtein", "Find products meeting a minimum protein amount in grams.", { minProtein: { type: "number", minimum: 0 } }),
  tool("findHealthyMeals", "Find healthy products under a calorie maximum.", { maxCalories: { type: "number", minimum: 0 } }),
  tool("findVeganMeals", "Find vegan menu products.", {}),
  tool("findVegetarianMeals", "Find vegetarian menu products.", {}),
  tool("findKidsMeals", "Find kids menu products.", {}),
  tool("findSpicyMeals", "Find spicy menu products.", {}),
  tool("checkAllergens", "Check all menu products against active allergens.", { allergens: { type: "array", items: { type: "string" } } }, ["allergens"]),
  tool("checkProductAllergens", "Check one menu product against active allergens.", {
    productId: { type: "string" }, allergens: { type: "array", items: { type: "string" } },
  }, ["productId", "allergens"]),
];

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
): OpenAI.Chat.Completions.ChatCompletionTool {
  return {
    type: "function",
    function: {
      name,
      description,
      strict: true,
      parameters: { type: "object", properties, required, additionalProperties: false },
    },
  };
}

export class OpenAIProvider implements AIProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private toolCalls: AIToolCall[] = [];

  constructor(apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required when NORI_AI_PROVIDER=openai.");
    this.client = new OpenAI({ apiKey, timeout: Number(process.env.NORI_AI_TIMEOUT_MS ?? 15_000), maxRetries: 1 });
    this.model = process.env.NORI_OPENAI_MODEL ?? "gpt-5-mini";
  }

  buildPrompt(request: NoriChatRequest): string {
    return [
      "Select the minimum set of approved tools needed to answer the customer.",
      "You are only a routing layer. Do not answer with menu facts.",
      "Never infer product data, cart state, order status, prices, nutrition, allergens, or availability.",
      getNoriLanguageInstruction(request.language),
      `Active allergens: ${JSON.stringify(request.activeAllergens)}`,
      `Cart product IDs and quantities: ${JSON.stringify(request.cart)}`,
    ].join("\n");
  }

  async callTools(context: AIProviderContext): Promise<AIToolCall[]> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: context.systemPrompt },
        { role: "user", content: context.request.message },
      ],
      tools: TOOL_DEFINITIONS,
      tool_choice: "required",
      parallel_tool_calls: false,
    });
    const rawCalls = completion.choices[0]?.message.tool_calls ?? [];
    if (rawCalls.length === 0) throw new Error("OpenAI returned no Nori tool call.");
    this.toolCalls = rawCalls.map(rawCall => {
      if (rawCall.type !== "function" || !isAllowedNoriTool(rawCall.function.name)) throw new Error("OpenAI requested an unsupported tool.");
      let args: unknown;
      try { args = JSON.parse(rawCall.function.arguments); } catch { throw new Error("OpenAI returned invalid tool arguments."); }
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("OpenAI tool arguments must be an object.");
      return validateNoriToolCall({ name: rawCall.function.name, arguments: args as Record<string, unknown> });
    });
    return this.toolCalls;
  }

  async generateResponse(context: AIProviderContext): Promise<NoriChatResponse> {
    if (this.toolCalls.length === 0) throw new Error("OpenAI tool calls were not prepared.");
    return buildProviderResponse(this.toolCalls, context.request);
  }
}
