import type { AIFoodItem } from "../../app/data/aiMenu";
import {
  checkProductAllergens,
  noriMenuProducts,
} from "../../app/services/noriMenuEngine";
import type { AIToolCall, AIToolName } from "../types/aiProvider";
import type {
  NoriConversationState,
  NoriChatResponse,
  NoriIntent,
  NoriPlannerConfidenceBand,
  NoriPlannerDiagnostics,
  NoriRankingPriority,
} from "../types/noriChat";
import { validateNoriCandidate } from "./noriConstraintValidator";
import type { NoriReferenceResolution } from "./noriReferenceResolver";
import type { NoriRequestInterpretation } from "./noriRequestInterpreter";
import {
  executeNoriTool,
  validateNoriToolCall,
} from "./noriToolLayer";

const VALID_CATEGORIES = new Set(noriMenuProducts.map(product => product.category));

const NUTRITION_FIELDS = [
  "calories", "proteinGrams", "carbohydratesGrams", "totalFatGrams",
  "saturatedFatGrams", "sugarsGrams", "addedSugarsGrams", "fiberGrams",
  "sodiumMilligrams", "cholesterolMilligrams",
] as const;

export type NoriPlanToolStep = {
  stepId: string;
  call: AIToolCall;
  order: number;
  parallelGroup: number;
  source: "deterministic" | "provider";
  purpose: "candidate_retrieval" | "hard_constraint_filter" | "semantic_recovery";
};

export type NoriReasoningPlan = {
  planId: string;
  goal: NoriIntent;
  constraintFingerprint: string;
  hardConstraintLabels: string[];
  softPriorities: NoriRankingPriority[];
  deprioritizedCategories: string[];
  referenceProductIds: string[];
  referenceAmbiguous: boolean;
  steps: NoriPlanToolStep[];
  reuseCandidateIds: string[];
  confidence: {
    score: number;
    band: NoriPlannerConfidenceBand;
  };
};

export type NoriToolResultRejection = {
  itemId: string | null;
  reasons: string[];
};

export type NoriValidatedToolResult = {
  products: AIFoodItem[];
  rejected: NoriToolResultRejection[];
};

export type NoriPlanExecution = {
  productSets: AIFoodItem[][];
  products: AIFoodItem[];
  failedTools: AIToolName[];
  rejectedResults: NoriToolResultRejection[];
  recoveryActions: string[];
  reusedPreviousResults: boolean;
};

export type NoriRecommendationAssessment = {
  productId: string;
  score: number;
  band: NoriPlannerConfidenceBand;
  matchedSignals: NoriRankingPriority[];
};

export type NoriSelfValidationResult = {
  products: AIFoodItem[];
  status: "passed" | "repaired" | "failed";
  issues: string[];
  recoveryActions: string[];
  assessments: NoriRecommendationAssessment[];
};

export type NoriFinalValidationResult = {
  response: NoriChatResponse;
  status: "passed" | "repaired" | "failed";
  issues: string[];
  recoveryActions: string[];
};

export function buildNoriReasoningPlan(input: {
  intent: NoriIntent;
  routeConfidence: number;
  interpretation: NoriRequestInterpretation;
  state: NoriConversationState;
  deterministicCalls: AIToolCall[];
  reference?: NoriReferenceResolution;
}): NoriReasoningPlan {
  const hardConstraintLabels = hardConstraints(input.interpretation);
  const softPriorities = [...input.interpretation.constraints.priorities];
  const fingerprint = constraintFingerprint(input.intent, input.interpretation);
  const previous = input.state.plannerSnapshot;
  const reuseCandidateIds = previous?.constraintFingerprint === fingerprint
    && previous.goal === input.intent
    ? previous.candidateProductIds.filter(isKnownProductId)
    : [];
  const optimizedCalls = optimizeToolCalls(input.deterministicCalls);
  const steps = reuseCandidateIds.length
    ? []
    : optimizedCalls.map((call, index) => toolStep(call, index, "deterministic"));
  const referenceProductIds = (input.reference?.resolvedIds ?? []).filter(isKnownProductId);
  const confidenceScore = planConfidence({
    routeConfidence: input.routeConfidence,
    hasConstraints: hardConstraintLabels.length > 0 || softPriorities.length > 0,
    clarificationNeeded: input.interpretation.clarificationNeeded,
    referenceAmbiguous: Boolean(input.reference?.ambiguous),
    hasInvalidReferences: (input.reference?.resolvedIds.length ?? 0) !== referenceProductIds.length,
  });

  return {
    planId: `plan-${stableHash(fingerprint)}`,
    goal: input.intent,
    constraintFingerprint: fingerprint,
    hardConstraintLabels,
    softPriorities,
    deprioritizedCategories: secondaryCategoriesToDeprioritize(input.interpretation),
    referenceProductIds,
    referenceAmbiguous: Boolean(input.reference?.ambiguous),
    steps,
    reuseCandidateIds,
    confidence: {
      score: confidenceScore,
      band: confidenceBand(confidenceScore),
    },
  };
}

export function addProviderCallsToNoriPlan(
  plan: NoriReasoningPlan,
  calls: AIToolCall[],
): NoriReasoningPlan {
  if (!calls.length || plan.reuseCandidateIds.length) return plan;
  const existing = new Set(plan.steps.map(step => callKey(step.call)));
  const providerCalls = optimizeToolCalls(calls).filter(call => !existing.has(callKey(call)));
  return {
    ...plan,
    steps: [
      ...plan.steps,
      ...providerCalls.map((call, index) => ({
        ...toolStep(call, plan.steps.length + index, "provider"),
        purpose: "semantic_recovery" as const,
      })),
    ],
  };
}

export function executeNoriReasoningPlan(
  plan: NoriReasoningPlan,
  options: {
    execute?: (call: AIToolCall) => unknown;
    cachedProducts?: AIFoodItem[];
  } = {},
): NoriPlanExecution {
  const knownIds = new Set(noriMenuProducts.map(product => product.id));
  if (plan.reuseCandidateIds.length) {
    const cached = (options.cachedProducts ?? noriMenuProducts)
      .filter(product => plan.reuseCandidateIds.includes(product.id));
    const validated = validateNoriToolResult(cached, knownIds);
    return {
      productSets: validated.products.length ? [validated.products] : [],
      products: validated.products,
      failedTools: [],
      rejectedResults: validated.rejected,
      recoveryActions: ["reused_previous_candidate_set"],
      reusedPreviousResults: true,
    };
  }

  const executor = options.execute ?? executeNoriTool;
  const productSets: AIFoodItem[][] = [];
  const failedTools: AIToolName[] = [];
  const rejectedResults: NoriToolResultRejection[] = [];
  const recoveryActions: string[] = [];

  for (const step of [...plan.steps].sort((first, second) =>
    first.order - second.order || first.stepId.localeCompare(second.stepId))) {
    try {
      const call = validateNoriToolCall(step.call);
      const validated = validateNoriToolResult(executor(call), knownIds);
      rejectedResults.push(...validated.rejected);
      if (validated.products.length) productSets.push(validated.products);
      if (validated.rejected.length) recoveryActions.push(`rejected_invalid_results:${call.name}`);
    } catch {
      failedTools.push(step.call.name);
      recoveryActions.push(`continued_after_tool_failure:${step.call.name}`);
    }
  }

  return {
    productSets,
    products: uniqueProducts(productSets.flat()),
    failedTools,
    rejectedResults,
    recoveryActions,
    reusedPreviousResults: false,
  };
}

export function validateNoriToolResult(
  result: unknown,
  knownProductIds = new Set(noriMenuProducts.map(product => product.id)),
): NoriValidatedToolResult {
  const candidates = extractProductCandidates(result);
  const products: AIFoodItem[] = [];
  const rejected: NoriToolResultRejection[] = [];
  for (const candidate of candidates) {
    const reasons = validateProductShape(candidate, knownProductIds);
    const itemId = record(candidate) && typeof candidate.id === "string" ? candidate.id : null;
    if (reasons.length) {
      rejected.push({ itemId, reasons });
      continue;
    }
    products.push(candidate as AIFoodItem);
  }
  return { products: uniqueProducts(products), rejected };
}

export function selfValidateNoriRecommendations(input: {
  selected: AIFoodItem[];
  rankedCandidates: AIFoodItem[];
  interpretation: NoriRequestInterpretation;
  plan: NoriReasoningPlan;
  limit?: number;
}): NoriSelfValidationResult {
  const limit = input.limit ?? 3;
  const knownIds = new Set(noriMenuProducts.map(product => product.id));
  const issues: string[] = [];
  const recoveryActions: string[] = [];
  const validSelected = input.selected.filter(product => {
    const shapeReasons = validateProductShape(product, knownIds);
    const constraintReasons = shapeReasons.length
      ? []
      : validateNoriCandidate(product, input.interpretation.constraints);
    if (shapeReasons.length || constraintReasons.length) {
      issues.push(...shapeReasons, ...constraintReasons);
      return false;
    }
    return true;
  });

  const replacements = input.rankedCandidates.filter(product =>
    !validSelected.some(selected => selected.id === product.id)
    && validateProductShape(product, knownIds).length === 0
    && validateNoriCandidate(product, input.interpretation.constraints).length === 0);
  const targetCount = Math.min(limit, input.selected.length);
  const products = [...validSelected, ...replacements].slice(0, targetCount);
  if (validSelected.length < targetCount && products.length === targetCount) {
    recoveryActions.push("replaced_invalid_recommendation");
  }
  if (validSelected.length !== input.selected.length) {
    recoveryActions.push("removed_constraint_violating_recommendation");
  }
  const status = issues.length
    ? products.length ? "repaired" : "failed"
    : "passed";
  const assessments = products.map(product =>
    assessRecommendation(product, input.interpretation, input.plan));
  return {
    products,
    status,
    issues: [...new Set(issues)],
    recoveryActions: [...new Set(recoveryActions)],
    assessments,
  };
}

export function plannerDiagnostics(
  plan: NoriReasoningPlan,
  execution?: NoriPlanExecution,
  validation?: NoriSelfValidationResult,
): NoriPlannerDiagnostics {
  return {
    planId: plan.planId,
    detectedIntent: plan.goal,
    constraints: {
      hard: plan.hardConstraintLabels,
      soft: plan.softPriorities,
    },
    reasoningPlan: {
      goal: plan.goal,
      rankingSignals: plan.softPriorities,
      deprioritizedCategories: plan.deprioritizedCategories,
      referenceProductIds: plan.referenceProductIds,
      reusedPreviousResults: execution?.reusedPreviousResults ?? plan.reuseCandidateIds.length > 0,
    },
    executionSteps: plan.steps.map(step => ({
      tool: step.call.name,
      order: step.order,
      parallelGroup: step.parallelGroup,
      source: step.source,
    })),
    validationStatus: validation?.status ?? "pending",
    confidence: plan.confidence,
    recommendationConfidence: validation?.assessments ?? [],
    recoveryActions: [
      ...(execution?.recoveryActions ?? []),
      ...(validation?.recoveryActions ?? []),
    ],
  };
}

export function selfValidateNoriFinalResponse(
  response: NoriChatResponse,
): NoriFinalValidationResult {
  const knownIds = new Set(noriMenuProducts.map(product => product.id));
  const validatedProducts = validateNoriToolResult(response.recommendedProducts, knownIds);
  const recommendationIntent = ["recommendation", "menu_search", "healthy_recommendation", "bundle_recommendation"]
    .includes(response.intent);
  const safeProducts = validatedProducts.products.filter(product => {
    if (!recommendationIntent) return true;
    const contains = checkProductAllergens(product, response.conversationState.activeAllergens).contains;
    if (!contains.length) return true;
    validatedProducts.rejected.push({ itemId: product.id, reasons: ["direct_allergen"] });
    return false;
  });
  const canonicalProducts = safeProducts.flatMap(product =>
    noriMenuProducts.find(item => item.id === product.id) ?? []);
  const issues = validatedProducts.rejected.flatMap(item => item.reasons);
  const recoveryActions: string[] = [];
  const actions = response.actions.filter(action => {
    if (action.type === "add_to_cart") {
      const product = noriMenuProducts.find(item => item.id === action.productId);
      const invalidPrice = action.unitPrice !== undefined && !finiteNonNegative(action.unitPrice);
      const containsAllergen = product
        ? checkProductAllergens(product, response.conversationState.activeAllergens).contains.length > 0
        : false;
      if (!product || !product.available || !product.inStock || invalidPrice || containsAllergen) {
        issues.push(!product ? "broken_action_reference"
          : containsAllergen ? "unsafe_allergen_action"
            : invalidPrice ? "invalid_action_price"
              : "unavailable_action_product");
        return false;
      }
    }
    if (action.type === "REVIEW_ALLERGENS"
      && action.productIds.some(productId => !knownIds.has(productId))) {
      issues.push("broken_action_reference");
      return false;
    }
    if (action.type === "APPLY_CUSTOMIZATION" && !knownIds.has(action.productId)) {
      issues.push("broken_action_reference");
      return false;
    }
    return true;
  });

  if (canonicalProducts.length !== response.recommendedProducts.length) {
    recoveryActions.push("removed_invalid_final_recommendation");
  }
  if (actions.length !== response.actions.length) {
    recoveryActions.push("blocked_invalid_final_action");
  }
  const status = issues.length
    ? canonicalProducts.length || actions.length || (!response.recommendedProducts.length && !response.actions.length)
      ? "repaired"
      : "failed"
    : "passed";
  let reply = response.reply;
  if (actions.length !== response.actions.length) {
    reply = response.conversationState.preferredLanguage === "tr"
      ? "Bu işlemi etkin güvenlik veya ürün koşullarıyla doğrulayamadığım için sepeti değiştirmedim."
      : "I could not validate that action against the active safety and product conditions, so I did not change the cart.";
  } else if (response.recommendedProducts.length && !canonicalProducts.length) {
    reply = response.conversationState.preferredLanguage === "tr"
      ? "Önerileri etkin ürün ve güvenlik koşullarıyla doğrulayamadım. Başka bir seçenek aramamı ister misiniz?"
      : "I could not validate those recommendations against the active product and safety conditions. Would you like me to look for another option?";
  }

  const planner = response.conversationState.understandingDiagnostics?.planner;
  if (planner && status !== "passed") {
    planner.validationStatus = status;
    planner.recoveryActions = [...new Set([...planner.recoveryActions, ...recoveryActions])];
  }
  return {
    response: {
      ...response,
      reply,
      recommendedProducts: canonicalProducts,
      actions,
    },
    status,
    issues: [...new Set(issues)],
    recoveryActions,
  };
}

function hardConstraints(interpretation: NoriRequestInterpretation) {
  const constraints = interpretation.constraints;
  const labels: string[] = [];
  if (constraints.maxBudget !== null) labels.push("max_budget");
  if (constraints.minProtein !== null) labels.push("min_protein");
  if (constraints.maxCalories !== null) labels.push("max_calories");
  if (constraints.maxFat !== null) labels.push("max_fat");
  if (constraints.maxSugars !== null) labels.push("max_sugars");
  if (constraints.minFiber !== null) labels.push("min_fiber");
  if (constraints.maxSodium !== null) labels.push("max_sodium");
  if (constraints.maxCarbohydrates !== null) labels.push("max_carbohydrates");
  if (constraints.dietaryTags.length) labels.push(...constraints.dietaryTags.map(tag => `diet:${tag}`));
  if (constraints.allergens.length) labels.push(...constraints.allergens.map(allergen => `allergen:${allergen}`));
  if (constraints.excludedIngredients.length) labels.push(...constraints.excludedIngredients.map(value => `exclude:${value}`));
  if (constraints.categories.length) labels.push(...constraints.categories.map(category => `category:${category}`));
  if (constraints.kids) labels.push("kids_only");
  if (constraints.spicy) labels.push("spicy_only");
  return labels;
}

function constraintFingerprint(intent: NoriIntent, interpretation: NoriRequestInterpretation) {
  const constraints = interpretation.constraints;
  return JSON.stringify({
    intent,
    maxBudget: constraints.maxBudget,
    minProtein: constraints.minProtein,
    maxCalories: constraints.maxCalories,
    maxFat: constraints.maxFat,
    maxSugars: constraints.maxSugars,
    minFiber: constraints.minFiber,
    maxSodium: constraints.maxSodium,
    maxCarbohydrates: constraints.maxCarbohydrates,
    categories: [...constraints.categories].sort(),
    dietaryTags: [...constraints.dietaryTags].sort(),
    allergens: [...constraints.allergens].sort(),
    excludedIngredients: [...constraints.excludedIngredients].sort(),
    preferredIngredients: [...constraints.preferredIngredients].sort(),
    preferredFlavors: [...constraints.preferredFlavors].sort(),
    priorities: constraints.priorities,
    kids: constraints.kids,
    spicy: constraints.spicy,
    wantsDrink: constraints.wantsDrink,
    wantsDessert: constraints.wantsDessert,
    partySize: constraints.partySize,
    afterTax: constraints.afterTax,
  });
}

function optimizeToolCalls(calls: AIToolCall[]) {
  return [...new Map(calls.map(call => [callKey(call), call])).values()];
}

function toolStep(
  call: AIToolCall,
  order: number,
  source: "deterministic" | "provider",
): NoriPlanToolStep {
  return {
    stepId: `${source}-${order}-${call.name}`,
    call,
    order,
    parallelGroup: 0,
    source,
    purpose: call.name === "recommendProducts" || call.name === "searchProducts"
      ? "candidate_retrieval"
      : "hard_constraint_filter",
  };
}

function validateProductShape(value: unknown, knownProductIds: Set<string>) {
  const reasons: string[] = [];
  if (!record(value)) return ["malformed_product"];
  if (typeof value.id !== "string" || !value.id.trim() || !knownProductIds.has(value.id)) reasons.push("broken_product_reference");
  if (typeof value.name !== "string" || !value.name.trim()) reasons.push("missing_product_name");
  if (!finiteNonNegative(value.price)) reasons.push("invalid_price");
  if (value.available !== true || value.inStock !== true) reasons.push("unavailable");
  if (typeof value.category !== "string" || !VALID_CATEGORIES.has(value.category)) reasons.push("invalid_category");
  if (!finiteNonNegative(value.cal) || !finiteNonNegative(value.proteinGrams)) reasons.push("missing_nutrition");
  const nutrition = record(value.nutrition) ? value.nutrition : null;
  if (!nutrition
    || NUTRITION_FIELDS.some(field => !finiteNonNegative(nutrition[field]))) {
    reasons.push("missing_nutrition");
  }
  return [...new Set(reasons)];
}

function extractProductCandidates(result: unknown): unknown[] {
  const values = Array.isArray(result) ? result : [result];
  return values.flatMap(value => {
    if (record(value) && "product" in value) return [value.product];
    if (record(value) && "id" in value) return [value];
    return [];
  });
}

function assessRecommendation(
  product: AIFoodItem,
  interpretation: NoriRequestInterpretation,
  plan: NoriReasoningPlan,
): NoriRecommendationAssessment {
  const matchedSignals = interpretation.constraints.priorities.filter(priority =>
    priority !== "quick");
  const softCoverage = plan.softPriorities.length
    ? matchedSignals.length / plan.softPriorities.length
    : 1;
  const score = clamp(
    plan.confidence.score * 0.72
    + softCoverage * 0.18
    + clamp(product.recommendationScore / 100) * 0.1,
  );
  return {
    productId: product.id,
    score,
    band: confidenceBand(score),
    matchedSignals,
  };
}

function secondaryCategoriesToDeprioritize(interpretation: NoriRequestInterpretation) {
  const constraints = interpretation.constraints;
  if (constraints.wantsDessert || constraints.wantsDrink) return [];
  if (constraints.priorities.some(priority => ["protein", "healthy", "light", "filling"].includes(priority))) {
    return ["dessert", "hot_drink", "cold_drink", "side"];
  }
  return [];
}

function planConfidence(input: {
  routeConfidence: number;
  hasConstraints: boolean;
  clarificationNeeded: boolean;
  referenceAmbiguous: boolean;
  hasInvalidReferences: boolean;
}) {
  let score = clamp(input.routeConfidence) * 0.82 + (input.hasConstraints ? 0.12 : 0.06);
  if (input.clarificationNeeded) score -= 0.22;
  if (input.referenceAmbiguous) score -= 0.3;
  if (input.hasInvalidReferences) score -= 0.2;
  return clamp(score);
}

function confidenceBand(score: number): NoriPlannerConfidenceBand {
  if (score >= 0.72) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function isKnownProductId(productId: string) {
  return noriMenuProducts.some(product => product.id === productId);
}

function uniqueProducts(products: AIFoodItem[]) {
  return [...new Map(products.map(product => [product.id, product])).values()];
}

function callKey(call: AIToolCall) {
  return `${call.name}:${stableObject(call.arguments)}`;
}

function stableObject(value: Record<string, unknown>) {
  return JSON.stringify(Object.keys(value).sort().reduce<Record<string, unknown>>((result, key) => {
    if (value[key] !== undefined) result[key] = value[key];
    return result;
  }, {}));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
