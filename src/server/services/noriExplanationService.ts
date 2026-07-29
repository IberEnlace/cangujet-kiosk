import type { AIFoodItem } from "../../app/data/aiMenu";
import { formatNumber } from "../../shared/languages";
import type { NoriLanguage } from "../types/noriChat";
import type { NoriRequestInterpretation } from "./noriRequestInterpreter";

export function buildNoriRecommendationExplanation(
  product: AIFoodItem,
  interpretation: NoriRequestInterpretation,
  language: NoriLanguage,
) {
  const constraints = interpretation.constraints;
  const turkish = language === "tr";
  const reasons: string[] = [];
  const add = (reason: string) => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (constraints.maxBudget !== null) {
    add(turkish
      ? `$${money(product.price, language)} fiyatıyla bütçenizin içinde kalıyor`
      : `it stays within your budget at $${money(product.price, language)}`);
  } else if (constraints.priorities.includes("price")) {
    add(turkish
      ? `fiyatı $${money(product.price, language)}`
      : `it is priced at $${money(product.price, language)}`);
  }
  if (constraints.minProtein !== null || constraints.priorities.includes("protein")) {
    add(turkish
      ? `${number(product.proteinGrams, language)} g protein sağlıyor`
      : `it provides ${number(product.proteinGrams, language)}g of protein`);
  }
  if (constraints.maxCalories !== null || constraints.priorities.includes("light")) {
    add(turkish
      ? `${number(product.cal, language)} kalori içeriyor`
      : `it has ${number(product.cal, language)} calories`);
  }
  if (constraints.priorities.includes("healthy")) {
    add(constraints.priorities.includes("protein")
      ? turkish
        ? `belgelenmiş besin değerleri ${number(product.cal, language)} kalori ve ${number(product.nutrition.fiberGrams, language)} g lif içeriyor`
        : `its documented nutrition includes ${number(product.cal, language)} calories and ${number(product.nutrition.fiberGrams, language)}g fiber`
      : turkish
        ? `belgelenmiş besin değerleri ${number(product.proteinGrams, language)} g protein ve ${number(product.nutrition.fiberGrams, language)} g lif içeriyor`
        : `its documented nutrition includes ${number(product.proteinGrams, language)}g protein and ${number(product.nutrition.fiberGrams, language)}g fiber`);
  }
  if (constraints.priorities.includes("filling")) {
    add(turkish
      ? `${number(product.proteinGrams, language)} g protein ile ${number(product.nutrition.fiberGrams, language)} g lifi birleştiriyor`
      : `it combines ${number(product.proteinGrams, language)}g protein with ${number(product.nutrition.fiberGrams, language)}g fiber`);
  }
  if (constraints.dietaryTags.includes("vegan")) {
    add(turkish ? "menüde vegan olarak belgelenmiş" : "it is documented as vegan");
  } else if (constraints.dietaryTags.includes("vegetarian")) {
    add(turkish ? "menüde vejetaryen olarak belgelenmiş" : "it is documented as vegetarian");
  }
  if (constraints.kids) {
    add(turkish ? "çocuk menüsü kategorisinde" : "it is listed in the kids-meal category");
  }
  if (constraints.spicy) {
    add(turkish
      ? `belgelenmiş acılık seviyesi ${number(product.spiceLevel, language)}`
      : `its documented spice level is ${number(product.spiceLevel, language)}`);
  }

  if (!reasons.length) {
    add(turkish
      ? `$${money(product.price, language)} fiyatlı ve şu anda mevcut`
      : `it is currently available at $${money(product.price, language)}`);
  }
  return joinReasons(reasons.slice(0, 3), turkish);
}

function joinReasons(reasons: string[], turkish: boolean) {
  if (reasons.length < 2) return reasons[0] ?? "";
  if (reasons.length === 2) return reasons.join(turkish ? " ve " : " and ");
  return turkish
    ? `${reasons.slice(0, -1).join(", ")} ve ${reasons[reasons.length - 1]}`
    : `${reasons.slice(0, -1).join(", ")}, and ${reasons[reasons.length - 1]}`;
}

function number(value: number, language: NoriLanguage) {
  return formatNumber(value, language);
}

function money(value: number, language: NoriLanguage) {
  return new Intl.NumberFormat(language === "tr" ? "tr-TR" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
