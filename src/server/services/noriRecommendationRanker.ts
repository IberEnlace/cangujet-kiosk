import type { AIFoodItem } from "../../app/data/aiMenu";
import type { NoriCartItem, NoriConversationState, NoriRankingPriority } from "../types/noriChat";
import type { NoriRequestInterpretation } from "./noriRequestInterpreter";

export type NoriRankedCandidate = {
  product: AIFoodItem;
  score: number;
  reasons: NoriRankingPriority[];
};

export function rankNoriCandidates(
  products: AIFoodItem[],
  interpretation: NoriRequestInterpretation,
  state: NoriConversationState,
  cart: NoriCartItem[] = [],
): AIFoodItem[] {
  return scoreNoriCandidates(products, interpretation, state, cart).map(candidate => candidate.product);
}

export function scoreNoriCandidates(
  products: AIFoodItem[],
  interpretation: NoriRequestInterpretation,
  state: NoriConversationState,
  cart: NoriCartItem[] = [],
): NoriRankedCandidate[] {
  const unique = [...new Map(products.map(product => [product.id, product])).values()];
  const priorities = interpretation.constraints.priorities.length
    ? interpretation.constraints.priorities
    : state.rankingPriorities ?? [];
  const cartIds = new Set(cart.map(item => item.productId));
  const rejectedIds = new Set(state.temporaryRejectedProductIds ?? []);
  const companionIds = new Set(cart.flatMap(item =>
    unique.find(product => product.id === item.productId)?.recommendedWith ?? []));
  const maximums = {
    price: Math.max(...unique.map(product => product.price), 1),
    calories: Math.max(...unique.map(product => product.cal), 1),
    protein: Math.max(...unique.map(product => product.proteinGrams), 1),
    proteinPerPrice: Math.max(...unique.map(product => product.proteinGrams / Math.max(product.price, 0.01)), 1),
    fiber: Math.max(...unique.map(product => product.nutrition.fiberGrams), 1),
    recommendation: Math.max(...unique.map(product => product.recommendationScore), 1),
  };

  return unique.filter(product => !rejectedIds.has(product.id)).map(product => {
    let score = product.recommendationScore * 0.12;
    const reasons: NoriRankingPriority[] = [];
    priorities.forEach((priority, index) => {
      const weight = Math.max(18, 52 - index * 8);
      const contribution = priorityScore(product, priority, maximums) * weight;
      if (contribution > 0) reasons.push(priority);
      score += contribution;
    });
    if (priorities.includes("protein") && priorities.includes("price")) {
      const proteinPerPrice = product.proteinGrams / Math.max(product.price, 0.01);
      score += proteinPerPrice / maximums.proteinPerPrice * 56;
    }

    const secondary = isSecondary(product);
    const explicitlySecondary = interpretation.constraints.wantsDrink
      || interpretation.constraints.wantsDessert
      || priorities.includes("refreshing");
    if (secondary && !explicitlySecondary) score -= 45;
    if (product.category === "kids_meal" && !interpretation.constraints.kids) score -= 32;
    if (cartIds.has(product.id)) score -= 20;
    if (companionIds.has(product.id)) score += 24;
    if (state.recentlyRecommendedProductIds.includes(product.id)) score -= interpretation.isContinuation ? 1.5 : 3;
    if (interpretation.constraints.preferredFlavors.some(flavor => matchesFlavor(product, flavor))) score += 28;

    return { product, score, reasons };
  }).sort((first, second) =>
    second.score - first.score
    || second.product.recommendationScore - first.product.recommendationScore
    || first.product.price - second.product.price
    || first.product.id.localeCompare(second.product.id));
}

export function healthyNoriScore(product: AIFoodItem) {
  const nutrition = product.nutrition;
  const categoryBonus = ["salad", "healthy_bowl"].includes(product.category)
    ? 18
    : product.dietaryTags.some(tag => /healthy|high.fiber|lower.saturated.fat/.test(normalize(tag)))
      ? 10
      : 0;
  return categoryBonus + product.proteinGrams * 1.2 + nutrition.fiberGrams * 3
    - product.cal * 0.035 - nutrition.totalFatGrams * 0.7 - nutrition.saturatedFatGrams
    - nutrition.sugarsGrams * 0.6 - nutrition.sodiumMilligrams * 0.006;
}

export function fitnessNoriScore(product: AIFoodItem) {
  return product.proteinGrams * 3 + product.nutrition.fiberGrams * 1.5 - product.cal * 0.025
    - product.nutrition.sugarsGrams * 0.8 - product.nutrition.saturatedFatGrams;
}

export function matchesFlavor(product: AIFoodItem, flavor: string) {
  const text = normalize([
    product.name,
    product.description,
    ...product.ingredients,
    ...product.keywords,
    ...product.vectorTags,
  ].join(" "));
  if (flavor === "fruit") return /\b(fruit|berry|berries|mango|apple|banana|lemon)\b/.test(text);
  if (flavor === "chocolate") return /\b(chocolate|cocoa|mocha)\b/.test(text);
  return text.includes(normalize(flavor));
}

function priorityScore(
  product: AIFoodItem,
  priority: NoriRankingPriority,
  maximums: { price: number; calories: number; protein: number; proteinPerPrice: number; fiber: number; recommendation: number },
) {
  switch (priority) {
    case "protein":
      return product.proteinGrams / maximums.protein;
    case "price":
      return 1 - product.price / maximums.price;
    case "healthy":
      return clamp((healthyNoriScore(product) + 30) / 80);
    case "light":
      return clamp(
        (1 - product.cal / maximums.calories) * 0.62
        + (1 - product.nutrition.totalFatGrams / 50) * 0.18
        + (["salad", "healthy_bowl"].includes(product.category) ? 0.2 : 0),
      );
    case "filling":
      return clamp(
        product.proteinGrams / maximums.protein * 0.45
        + product.nutrition.fiberGrams / maximums.fiber * 0.25
        + product.cal / maximums.calories * 0.3,
      );
    case "refreshing":
      return refreshingScore(product);
    case "popular":
      return product.recommendationScore / maximums.recommendation;
    case "quick":
      // Preparation-time data is intentionally not inferred. The response layer
      // explains that limitation instead of presenting an invented speed ranking.
      return 0;
  }
}

function refreshingScore(product: AIFoodItem) {
  const text = normalize([product.description, ...product.ingredients, ...product.keywords].join(" "));
  return clamp(
    (product.category === "cold_drink" ? 0.7 : 0)
    + (["salad", "healthy_bowl"].includes(product.category) ? 0.25 : 0)
    + (/\b(lemon|mint|cucumber|berry|mango|fruit|ice|iced)\b/.test(text) ? 0.25 : 0),
  );
}

function isSecondary(product: AIFoodItem) {
  return ["hot_drink", "cold_drink", "dessert", "side"].includes(product.category);
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function normalize(value: string) {
  return value.toLocaleLowerCase("en-US").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}
