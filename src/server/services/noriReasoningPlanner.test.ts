import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkProductAllergens, noriMenuProducts } from "../../app/services/noriMenuEngine";
import type {
  AIProvider,
  AIToolCall,
  NoriSemanticInterpretation,
} from "../types/aiProvider";
import type { NoriConversationState } from "../types/noriChat";
import {
  buildRecommendationToolCalls,
  NoriAgentService,
} from "./noriAgentService";
import {
  addProviderCallsToNoriPlan,
  buildNoriReasoningPlan,
  executeNoriReasoningPlan,
  selfValidateNoriFinalResponse,
  selfValidateNoriRecommendations,
  validateNoriToolResult,
} from "./noriReasoningPlanner";
import { resolveNoriReference } from "./noriReferenceResolver";
import { interpretNoriRequest } from "./noriRequestInterpreter";

function state(overrides: Partial<NoriConversationState> = {}): NoriConversationState {
  return {
    preferredLanguage: "en",
    activeAllergens: [],
    maxBudget: null,
    minProtein: null,
    maxCalories: null,
    dietaryPreferences: [],
    persistentDietaryPreferences: [],
    requestedCategory: null,
    requestedDrink: false,
    requestedSpicy: false,
    requestedKids: false,
    requestedDessert: false,
    selectedProductId: null,
    selectedCustomizations: [],
    currentRecommendation: null,
    selectedCartItemId: null,
    latestAddedCartItemId: null,
    latestSuccessfulMutation: null,
    executedActionIds: [],
    recentlyRecommendedProductIds: [],
    pendingAction: null,
    ...overrides,
  };
}

function planFor(
  message: string,
  currentState = state(),
  routeConfidence = 0.95,
) {
  const interpretation = interpretNoriRequest(message, currentState);
  return {
    interpretation,
    plan: buildNoriReasoningPlan({
      intent: "recommendation",
      routeConfidence,
      interpretation,
      state: currentState,
      deterministicCalls: buildRecommendationToolCalls(message, currentState, interpretation),
    }),
  };
}

test("planner merges simultaneous hard and soft goals before tool execution", () => {
  const currentState = state({
    activeAllergens: ["Milk"],
    excludedIngredients: ["mushrooms"],
  });
  const { interpretation, plan } = planFor(
    "I want something healthy and high in protein under $15 after the gym.",
    currentState,
  );

  assert.equal(plan.goal, "recommendation");
  assert.ok(plan.hardConstraintLabels.includes("max_budget"));
  assert.ok(plan.hardConstraintLabels.includes("allergen:Milk"));
  assert.ok(plan.hardConstraintLabels.includes("exclude:mushrooms"));
  assert.ok(plan.softPriorities.includes("healthy"));
  assert.ok(plan.softPriorities.includes("protein"));
  assert.equal(interpretation.constraints.maxBudget, 15);
  assert.equal(plan.steps[0]?.call.name, "recommendProducts");
  assert.ok(plan.steps.every(step => step.parallelGroup === 0));
  assert.ok(plan.deprioritizedCategories.includes("dessert"));
});

test("planner deduplicates identical calls and appends distinct provider recovery steps", () => {
  const { plan } = planFor("Recommend a high-protein meal.");
  const duplicate = plan.steps[0]!.call;
  const providerCall: AIToolCall = { name: "searchProducts", arguments: { query: "chicken" } };
  const extended = addProviderCallsToNoriPlan(plan, [duplicate, providerCall, providerCall]);

  assert.equal(extended.steps.filter(step => step.call.name === duplicate.name).length, 1);
  assert.equal(extended.steps.filter(step => step.call.name === "searchProducts").length, 1);
  assert.equal(extended.steps[extended.steps.length - 1]?.source, "provider");
});

test("tool execution validates a call without executing it twice and recovers from one failed tool", () => {
  const currentState = state({ maxBudget: 15, minProtein: 30 });
  const { plan } = planFor("Show meals under $15 with at least 30g protein.", currentState);
  let executions = 0;
  const successfulProduct = noriMenuProducts.find(product => product.proteinGrams >= 30 && product.price <= 15)!;
  const result = executeNoriReasoningPlan(plan, {
    execute: call => {
      executions += 1;
      if (call.name === "recommendProducts") throw new Error("simulated primary failure");
      return [successfulProduct];
    },
  });

  assert.equal(executions, plan.steps.length);
  assert.ok(result.failedTools.includes("recommendProducts"));
  assert.ok(result.products.some(product => product.id === successfulProduct.id));
  assert.ok(result.recoveryActions.some(action => action.startsWith("continued_after_tool_failure")));
});

test("tool-result validation rejects unavailable, malformed, negative, invalid-category, and broken-reference products", () => {
  const valid = noriMenuProducts[0]!;
  const result = validateNoriToolResult([
    valid,
    { ...valid, price: -1 },
    { ...valid, id: "missing-menu-reference" },
    { ...valid, category: "spaceship_food" },
    { ...valid, available: false },
    { ...valid, nutrition: undefined },
  ]);

  assert.deepEqual(result.products.map(product => product.id), [valid.id]);
  const reasons = result.rejected.flatMap(item => item.reasons);
  assert.ok(reasons.includes("invalid_price"));
  assert.ok(reasons.includes("broken_product_reference"));
  assert.ok(reasons.includes("invalid_category"));
  assert.ok(reasons.includes("unavailable"));
  assert.ok(reasons.includes("missing_nutrition"));
});

test("self validation repairs budget, availability, and allergy violations before response generation", () => {
  const currentState = state({ maxBudget: 5, activeAllergens: ["Milk"] });
  const { interpretation, plan } = planFor("Recommend something under $5.", currentState);
  const invalid = noriMenuProducts.find(product =>
    product.price > 5 || checkProductAllergens(product, ["Milk"]).contains.length > 0)!;
  const replacement = noriMenuProducts.find(product =>
    product.price <= 5
    && product.available
    && product.inStock
    && checkProductAllergens(product, ["Milk"]).contains.length === 0)!;
  const validation = selfValidateNoriRecommendations({
    selected: [invalid],
    rankedCandidates: [invalid, replacement],
    interpretation,
    plan,
  });

  assert.equal(validation.status, "repaired");
  assert.deepEqual(validation.products.map(product => product.id), [replacement.id]);
  assert.ok(validation.recoveryActions.includes("removed_constraint_violating_recommendation"));
  assert.ok(validation.recoveryActions.includes("replaced_invalid_recommendation"));
});

test("final validation blocks an unsafe confirmed add action without hiding allergen product details", () => {
  const product = noriMenuProducts.find(item =>
    checkProductAllergens(item, ["Milk"]).contains.length > 0)!;
  const currentState = state({ activeAllergens: ["Milk"], selectedProductId: product.id });
  const unsafeAction = {
    type: "add_to_cart" as const,
    actionId: "unsafe-add",
    productId: product.id,
    quantity: 1,
    customizations: [],
    unitPrice: product.price,
    label: `Add ${product.name}`,
  };
  const blocked = selfValidateNoriFinalResponse({
    intent: "add_to_cart",
    reply: "Added.",
    recommendedProducts: [],
    actions: [unsafeAction],
    warnings: [],
    conversationState: currentState,
  });
  const details = selfValidateNoriFinalResponse({
    intent: "allergen_check",
    reply: `${product.name} contains Milk.`,
    recommendedProducts: [product],
    actions: [],
    warnings: [],
    conversationState: currentState,
  });

  assert.equal(blocked.status, "failed");
  assert.deepEqual(blocked.response.actions, []);
  assert.match(blocked.response.reply, /did not change the cart/i);
  assert.deepEqual(details.response.recommendedProducts.map(item => item.id), [product.id]);
});

test("an unchanged plan reuses validated candidates and avoids repeated tool calls", () => {
  const first = planFor("Recommend a healthy high-protein meal.");
  const reusableIds = noriMenuProducts.slice(0, 6).map(product => product.id);
  const nextState = state({
    plannerSnapshot: {
      planId: first.plan.planId,
      createdAt: Date.now(),
      constraintFingerprint: first.plan.constraintFingerprint,
      goal: first.plan.goal,
      candidateProductIds: reusableIds,
      selectedProductIds: reusableIds.slice(0, 3),
    },
  });
  const repeated = planFor("Recommend a healthy high-protein meal.", nextState);
  let calls = 0;
  const execution = executeNoriReasoningPlan(repeated.plan, {
    execute: () => {
      calls += 1;
      return [];
    },
  });

  assert.equal(repeated.plan.steps.length, 0);
  assert.equal(calls, 0);
  assert.equal(execution.reusedPreviousResults, true);
  assert.deepEqual(execution.products.map(product => product.id), reusableIds);
});

test("planner confidence distinguishes actionable, uncertain, and low-confidence plans", () => {
  const high = planFor("Recommend something high in protein under $15.", state(), 0.98).plan;
  const medium = planFor("Recommend something.", state(), 0.6).plan;
  const low = planFor("Something.", state(), 0.2).plan;

  assert.equal(high.confidence.band, "high");
  assert.equal(medium.confidence.band, "medium");
  assert.equal(low.confidence.band, "low");
});

test("medium semantic confidence asks one focused clarification and retains the original task", async () => {
  const semantic: NoriSemanticInterpretation = {
    primaryIntent: "recommendation",
    secondaryIntents: [],
    confidence: 0.68,
    needsClarification: false,
    clarificationReason: null,
    constraints: {
      maxBudget: null,
      pricePreference: null,
      minProtein: null,
      maxCalories: null,
      portionPreference: null,
      dietaryPreferences: [],
      allergens: [],
      excludedIngredients: [],
      preferredIngredients: [],
      spicePreference: null,
      temperaturePreference: null,
      category: null,
      mealType: null,
      speedPreference: null,
      healthPreference: null,
      satietyPreference: null,
    },
    references: {
      selectedOrdinal: null,
      refersToPreviousRecommendations: false,
      refersToCurrentCart: false,
      refersToLastProduct: false,
    },
  };
  let planningCalls = 0;
  const provider: AIProvider = {
    buildPrompt: () => "",
    interpret: async () => semantic,
    callTools: async () => {
      planningCalls += 1;
      return [];
    },
    generateResponse: async () => {
      throw new Error("not used");
    },
  };
  const result = await new NoriAgentService(provider).process({
    message: "Please make a sensible choice for me.",
    language: "en",
    cart: [],
    activeAllergens: [],
  });

  assert.equal(result.conversationState.understandingDiagnostics?.planner?.confidence.band, "medium");
  assert.equal((result.reply.match(/\?/g) ?? []).length, 1);
  assert.equal(result.recommendedProducts.length, 0);
  assert.equal(result.conversationState.clarificationState?.relatedIntent, "recommendation");
  assert.equal(planningCalls, 0);
});

test("latest planner candidates take precedence for ordinal reference resolution", () => {
  const currentState = state({
    preferredLanguage: "tr",
    recentRecommendationContext: {
      contextId: "old",
      createdAt: 1,
      queryType: "recommendation",
      productIds: [noriMenuProducts[0]!.id, noriMenuProducts[1]!.id],
    },
    plannerSnapshot: {
      planId: "new",
      createdAt: 2,
      constraintFingerprint: "new",
      goal: "recommendation",
      candidateProductIds: [noriMenuProducts[2]!.id, noriMenuProducts[3]!.id],
      selectedProductIds: [noriMenuProducts[2]!.id, noriMenuProducts[3]!.id],
    },
  });
  const reference = resolveNoriReference("İkincisini göster", currentState);
  assert.deepEqual(reference.resolvedIds, [noriMenuProducts[3]!.id]);
});

test("English and Turkish responses include evidence-backed explanations and private planner diagnostics", async () => {
  const cases = [
    { language: "en" as const, message: "I want something healthy and high in protein under $15 after the gym.", explanation: /because/i },
    { language: "tr" as const, message: "Spordan sonra 15 dolar altında sağlıklı ve proteinli bir şey istiyorum.", explanation: /çünkü/i },
  ];

  for (const scenario of cases) {
    const result = await new NoriAgentService().process({
      message: scenario.message,
      language: scenario.language,
      cart: [],
      activeAllergens: [],
    });
    const diagnostics = result.conversationState.understandingDiagnostics?.planner;
    assert.ok(result.recommendedProducts.length > 0);
    assert.match(result.reply, scenario.explanation);
    assert.equal(diagnostics?.validationStatus, "passed");
    assert.equal(diagnostics?.confidence.band, "high");
    assert.equal(diagnostics?.recommendationConfidence.length, result.recommendedProducts.length);
    assert.ok(diagnostics?.executionSteps.length);
    assert.ok(!JSON.stringify(diagnostics).includes(scenario.message));
    for (const product of result.recommendedProducts) {
      assert.match(result.reply, new RegExp(product.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
});

test("intelligent companion suggestions respect the remaining customer budget", async () => {
  const agent = new NoriAgentService();
  const product = noriMenuProducts.find(item => item.id === "burger-beef-classic")!;
  const selected = await agent.process({
    message: `Tell me about ${product.name}.`,
    language: "en",
    cart: [],
    activeAllergens: [],
  });
  selected.conversationState.maxBudget = product.price + 0.25;
  const pending = await agent.process({
    message: "Add it to my cart.",
    language: "en",
    cart: [],
    activeAllergens: [],
    conversationState: selected.conversationState,
  });
  const confirmed = await agent.process({
    message: "Yes.",
    language: "en",
    cart: [],
    activeAllergens: [],
    conversationState: pending.conversationState,
  });

  assert.doesNotMatch(confirmed.reply, /natural match/i);
  assert.deepEqual(confirmed.actions.map(action => action.type), ["add_to_cart"]);
});

test("voice mode still delegates its transcript to the shared planned conversation pipeline", () => {
  const voiceSource = readFileSync("src/app/hooks/useNoriVoiceSession.ts", "utf8");
  const conversationSource = readFileSync("src/app/context/NoriConversationContext.tsx", "utf8");

  assert.match(voiceSource, /const reply = await sendMessage\(value\)/);
  assert.match(conversationSource, /postNoriChat\(/);
  assert.match(conversationSource, /conversationState: conversationState\.current/);
});
