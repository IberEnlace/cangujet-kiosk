import type { AIFoodItem } from "../../app/data/aiMenu";
import type { AllergenCheck } from "../../app/services/noriMenuEngine";
import type {
  NoriLanguage,
  NoriSelectedCustomization,
  NoriWarning,
} from "../types/noriChat";
import type { NoriRequestInterpretation } from "./noriRequestInterpreter";
import type { calculateCustomizedProduct } from "./noriCustomizationService";

type CustomizedCalculation = ReturnType<typeof calculateCustomizedProduct>;

export type CheckoutResponseLine = {
  product: AIFoodItem;
  quantity: number;
  customizationNames: string[];
  unitPrice: number;
  lineTotal: number;
  warnings: NoriWarning[];
};

export function buildRecommendationResponse(input: {
  products: AIFoodItem[];
  interpretation: NoriRequestInterpretation;
  language: NoriLanguage;
  companion?: AIFoodItem;
  warnings?: NoriWarning[];
  noMatchReason?: string;
}) {
  const { interpretation, language, companion, warnings = [] } = input;
  const products = input.products.slice(0, 3);
  const arabic = isArabic(language);
  if (!products.length && !arabic) {
    const { minProtein, maxBudget, categories } = interpretation.constraints;
    const reply = minProtein !== null && categories.includes("hot_drink")
      ? `No documented hot drink provides at least ${minProtein}g of protein. Would you like a meal instead, or would you like to remove the protein requirement?`
      : minProtein !== null && maxBudget !== null
      ? `No documented item matches both at least ${minProtein}g of protein and a $${maxBudget} budget. Would you like to raise the budget or lower the protein target?`
      : minProtein !== null
        ? `No documented item matches at least ${minProtein}g of protein. Would you like to lower the protein target or choose another priority?`
        : maxBudget !== null
          ? `No documented item matches all of those conditions within a $${maxBudget} budget. Would you like to raise the budget or change another condition?`
          : "No documented item matches all of those conditions. Which condition would you like to change?";
    return logResponse("recommendation", "no_match", [], language, reply);
  }
  if (!products.length) {
    const reason = input.noMatchReason
      ? arabic
        ? ` لأن أقرب الخيارات كانت: ${input.noMatchReason}`
        : ` because the closest options were ${input.noMatchReason}`
      : "";
    return logResponse(
      "recommendation",
      "no_match",
      [],
      language,
      arabic
        ? `لم أجد خيارًا موثقًا يطابق كل الشروط${reason}. يمكنني تخفيف شرط واحد بأمان.`
        : `I could not find a documented option matching every requirement${reason}. I can safely relax one condition.`,
    );
  }

  const [best, ...alternatives] = products;
  const template = recommendationTemplate(interpretation);
  const opening = arabic
    ? arabicOpening(best, template, interpretation)
    : englishOpening(best, template, interpretation);
  const reasons = reasonParts(best, interpretation, arabic, template).slice(0, 3);
  const explanation = reasons.length
    ? `${/[.!?؟]$/.test(opening) ? " " : ". "}${capitalizeSentence(reasons.join(arabic ? "، و" : ", and "))}.`
    : /[.!?؟]$/.test(opening) ? "" : ".";
  const alternativeText = alternatives.length
    ? arabic
      ? ` ومن البدائل ${alternatives.map(product => `${product.name} بسعر $${money(product.price)}`).join(" أو ")}.`
      : ` Other good matches are ${alternatives.map(product => `${product.name} at $${money(product.price)}`).join(" or ")}.`
    : "";
  const companionText = companion
    ? arabic
      ? ` ويمكن إضافة ${companion.name} بسعر $${money(companion.price)} ليصبح المجموع $${money(best.price + companion.price)}.`
      : ` Add ${companion.name} for $${money(companion.price)}, bringing the pair to $${money(best.price + companion.price)}.`
    : "";
  const warningText = warnings.length
    ? ` ${formatWarning(warnings[0], language)}`
    : "";

  return logResponse(
    "recommendation",
    template,
    products,
    language,
    `${opening}${explanation}${alternativeText}${companionText}${warningText}`,
  );
}

export function buildClarificationResponse(question: string, language: NoriLanguage) {
  const normalized = question.toLowerCase();
  let reply = question;
  if (isArabic(language)) {
    reply = normalized.includes("hot drink")
      ? "هل تفضّل مشروبًا ساخنًا أم باردًا؟"
      : normalized.includes("beef")
        ? "هل تفضّل وجبة لحم بقري، دجاج، أم خيارًا نباتيًا؟"
        : "هل يمكنك توضيح الخيار الذي تفضّله؟";
  }
  return logResponse("recommendation", "clarification", [], language, reply);
}

export function buildAllergyResponse(
  product: AIFoodItem,
  check: AllergenCheck,
  language: NoriLanguage,
) {
  const severe = isArabic(language)
    ? " للحساسية الشديدة، يرجى التأكد من موظفي المطعم."
    : " For a severe allergy, please confirm with restaurant staff.";
  let template = "allergy_clear";
  let reply: string;

  if (check.contains.length) {
    template = "allergy_contains";
    reply = isArabic(language)
      ? `${product.name} يحتوي مباشرةً على ${join(check.contains)}.${severe}`
      : `${product.name} directly contains ${join(check.contains)}.${severe}`;
  } else if (check.mayContain.length) {
    template = "allergy_may_contain";
    reply = isArabic(language)
      ? `${product.name} لا يذكرها كمكوّن مباشر، لكنه قد يحتوي على ${join(check.mayContain)}.${severe}`
      : `${product.name} does not list it as a direct ingredient, but may contain ${join(check.mayContain)}.${severe}`;
  } else if (check.crossContact.length) {
    template = "allergy_cross_contact";
    reply = isArabic(language)
      ? `${product.name} لا يذكرها كمكوّن مباشر، لكن يوجد تلامس متبادل موثق مع ${join(check.crossContact)} بسبب المعدات المشتركة.${severe}`
      : `${product.name} does not list it as a direct ingredient, but shared-equipment cross-contact with ${join(check.crossContact)} is documented.${severe}`;
  } else {
    reply = isArabic(language)
      ? `${product.name} لا يحتوي على تطابق موثق مع الحساسية المحددة، لكن لا يمكن ضمان الأمان الكامل.${severe}`
      : `${product.name} has no documented match for the selected allergens, but complete safety cannot be guaranteed.${severe}`;
  }

  return logResponse("allergen_check", template, [product], language, reply);
}

export function buildCustomizationResponse(
  product: AIFoodItem,
  customization: NoriSelectedCustomization,
  calculation: CustomizedCalculation,
  language: NoriLanguage,
) {
  const arabic = isArabic(language);
  const priceText = customization.priceAdjustment === 0
    ? arabic ? "يبقى السعر كما هو" : "the price stays the same"
    : arabic
      ? `يتغير السعر بمقدار ${signedMoney(customization.priceAdjustment)} ليصبح $${money(calculation.adjustedPrice)}`
      : `the price changes by ${signedMoney(customization.priceAdjustment)} to $${money(calculation.adjustedPrice)}`;
  const nutritionChanges = [
    calculation.adjustedNutrition.calories !== product.cal ? `calories change from ${product.cal} to ${calculation.adjustedNutrition.calories}` : "",
    calculation.adjustedNutrition.proteinGrams !== product.proteinGrams ? `protein changes from ${product.proteinGrams}g to ${calculation.adjustedNutrition.proteinGrams}g` : "",
  ].filter(Boolean);
  const nutritionText = nutritionChanges.length ? `, ${nutritionChanges.join(", and ")}` : "";
  const allergenText = customization.allergensRemoved.length
    ? arabic
      ? `، وتُزال ${join(customization.allergensRemoved)} من الوصفة الموثقة`
      : `, and ${join(customization.allergensRemoved)} are removed from the documented recipe`
    : customization.allergensAdded.length
      ? arabic
        ? `، وتُضاف ${join(customization.allergensAdded)} إلى مسببات الحساسية الموثقة`
        : `, and ${join(customization.allergensAdded)} are added to the documented allergens`
      : "";
  const reply = arabic
    ? `نعم. خيار ${customization.optionName} موثق لـ ${product.name}. ${priceText}، ${nutritionText}${allergenText}. يبقى خطر التلامس المتبادل قائمًا.`
    : `Yes. ${customization.optionName} is documented for ${product.name}; ${priceText}${nutritionText}${allergenText}. Cross-contact risk still remains.`;

  return logResponse(
    "customization_question",
    customization.nutritionAdjustment.calories === 0 ? "customization_same_nutrition" : "customization_adjusted",
    [product],
    language,
    reply,
  );
}

export function buildCartConfirmationResponse(input: {
  product: AIFoodItem;
  quantity: number;
  customizations: NoriSelectedCustomization[];
  adjustedUnitPrice: number;
  adjustedNutrition?: {
    calories: number;
    proteinGrams: number;
  };
  language: NoriLanguage;
}) {
  const customizationText = input.customizations.length
    ? ` ${isArabic(input.language) ? "مع" : "with"} ${input.customizations.map(item => item.optionName).join(", ")}`
    : "";
  const total = input.adjustedUnitPrice * input.quantity;
  const nutritionText = input.adjustedNutrition
    ? isArabic(input.language)
      ? ` (${input.adjustedNutrition.calories} سعرة، ${input.adjustedNutrition.proteinGrams}غ بروتين)`
      : ` (${input.adjustedNutrition.calories} calories, ${input.adjustedNutrition.proteinGrams}g protein)`
    : "";
  const safetyText = input.customizations.length
    ? isArabic(input.language)
      ? " وتبقى تحذيرات التلامس المتبادل قائمة."
      : " Cross-contact warnings still apply."
    : "";
  const reply = isArabic(input.language)
    ? `يرجى التأكيد: إضافة ${input.quantity} من ${input.product.name}${customizationText} بسعر إجمالي $${money(total)}${nutritionText}.${safetyText}`
    : `Please confirm: add ${input.quantity} ${input.product.name}${customizationText} for $${money(total)}${nutritionText}.${safetyText}`;
  return logResponse("add_to_cart", "cart_confirmation", [input.product], input.language, reply);
}

export function buildCartExecutionResponse(
  productNames: string[],
  success: boolean,
  language: NoriLanguage,
) {
  const reply = success
    ? isArabic(language)
      ? `تمت إضافة ${productNames.join(" و")} إلى سلتك.`
      : `${productNames.join(" and ")} ${productNames.length === 1 ? "was" : "were"} added to your cart.`
    : isArabic(language)
      ? "تعذرت إضافة العناصر إلى سلتك. يرجى المحاولة مرة أخرى."
      : "I could not add the item to your cart. Please try again.";
  return logResponse("add_to_cart", success ? "cart_success" : "cart_failure", [], language, reply);
}

export function buildCheckoutResponse(input: {
  lines: CheckoutResponseLine[];
  subtotal: number;
  tax: number;
  total: number;
  language: NoriLanguage;
  confirmation: boolean;
}) {
  const lineText = input.lines.map(line => {
    const customization = line.customizationNames.length
      ? ` (${line.customizationNames.join(", ")})`
      : "";
    return `${line.quantity}x ${line.product.name}${customization}: $${money(line.lineTotal)}`;
  }).join("; ");
  const warnings = input.lines.flatMap(line => line.warnings);
  const warningText = warnings.length
    ? isArabic(input.language)
      ? ` توجد تحذيرات حساسية موثقة: ${warnings.map(warning => formatWarning(warning, input.language)).join(" ")}`
      : ` Documented allergen warnings apply: ${warnings.map(warning => formatWarning(warning, input.language)).join(" ")}`
    : "";
  const totals = isArabic(input.language)
    ? `المجموع الفرعي $${money(input.subtotal)}، الضريبة $${money(input.tax)}، الإجمالي $${money(input.total)}.`
    : `Subtotal $${money(input.subtotal)}, estimated tax $${money(input.tax)}, total $${money(input.total)}.`;
  const confirmation = input.confirmation
    ? isArabic(input.language)
      ? " أكّد للانتقال إلى شاشة الدفع الآمنة."
      : " Confirm to open the secure payment screen."
    : "";
  return logResponse(
    "checkout",
    "checkout_summary",
    input.lines.map(line => line.product),
    input.language,
    `${lineText}. ${totals}${warningText}${confirmation}`,
  );
}

function recommendationTemplate(interpretation: NoriRequestInterpretation) {
  const constraints = interpretation.constraints;
  if (constraints.kids) return "kids";
  if (constraints.spicy) return "spicy";
  if (constraints.dietaryTags.includes("vegan")) return "vegan";
  if (constraints.minProtein !== null) return "high_protein";
  if (constraints.maxCalories !== null) return "low_calorie";
  if (constraints.maxBudget !== null) return "budget";
  return "general";
}

function englishOpening(
  product: AIFoodItem,
  template: string,
  interpretation: NoriRequestInterpretation,
) {
  switch (template) {
    case "budget":
      return `Within your $${money(interpretation.constraints.maxBudget ?? product.price)} budget, ${product.name} stands out at $${money(product.price)}`;
    case "high_protein":
      return `The best high-protein match is ${product.name} with ${product.proteinGrams}g protein`;
    case "low_calorie":
      return `${product.name} fits your calorie limit at ${product.cal} calories`;
    case "vegan":
      return `For a plant-based choice, ${product.name} is a documented vegan option at $${money(product.price)}`;
    case "kids":
      return `${product.name} is a documented kids meal`;
    case "spicy":
      return `If you enjoy some heat, ${product.name} is a strong spicy choice`;
    default:
      return `${product.name} is my leading recommendation.`;
  }
}

function arabicOpening(
  product: AIFoodItem,
  template: string,
  interpretation: NoriRequestInterpretation,
) {
  switch (template) {
    case "budget":
      return `ضمن ميزانيتك البالغة $${money(interpretation.constraints.maxBudget ?? product.price)}، يبرز ${product.name} بسعر $${money(product.price)}`;
    case "high_protein":
      return `أفضل خيار غني بالبروتين هو ${product.name} مع ${product.proteinGrams}غ بروتين`;
    case "low_calorie":
      return `${product.name} يناسب حد السعرات مع ${product.cal} سعرة`;
    case "vegan":
      return `${product.name} خيار نباتي بالكامل وموثق بسعر $${money(product.price)}`;
    case "kids":
      return `${product.name} وجبة أطفال موثقة`;
    case "spicy":
      return `إذا كنت تحب الطعام الحار، فإن ${product.name} خيار مناسب`;
    default:
      return `${product.name} هو اقتراحي الأول`;
  }
}

function reasonParts(
  product: AIFoodItem,
  interpretation: NoriRequestInterpretation,
  arabic: boolean,
  template: string,
) {
  const constraints = interpretation.constraints;
  const reasons: string[] = [];
  if (constraints.maxBudget !== null && template !== "budget") {
    reasons.push(arabic ? `سعره $${money(product.price)}` : `It costs $${money(product.price)}`);
  }
  if (constraints.minProtein !== null && template !== "high_protein") {
    reasons.push(arabic ? `يحتوي ${product.proteinGrams}غ بروتين` : `it provides ${product.proteinGrams}g protein`);
  }
  if (constraints.maxCalories !== null && template !== "low_calorie") {
    reasons.push(arabic ? `يحتوي ${product.cal} سعرة` : `it has ${product.cal} calories`);
  }
  if (constraints.dietaryTags.includes("vegan") && template !== "vegan") {
    reasons.push(arabic ? "موثق كنباتي بالكامل" : "it is documented vegan");
  } else if (constraints.dietaryTags.includes("vegetarian")) {
    reasons.push(arabic ? "موثق كنباتي" : "it is documented vegetarian");
  }
  if (constraints.kids && template !== "kids") {
    reasons.push(arabic ? "مصنف ضمن وجبات الأطفال" : "it is listed in the kids category");
  }
  if (constraints.spicy && template !== "spicy") {
    reasons.push(arabic ? `مستوى التوابل الموثق ${product.spiceLevel}` : `its documented spice level is ${product.spiceLevel}`);
  }
  if (!reasons.length && template === "general") {
    reasons.push(arabic ? `سعره $${money(product.price)}` : `It costs $${money(product.price)}`);
  }
  return reasons;
}

function logResponse(
  intent: string,
  template: string,
  products: AIFoodItem[],
  language: NoriLanguage,
  reply: string,
) {
  console.log("[NORI][RESPONSE]");
  console.log("intent:", intent);
  console.log("template:", template);
  console.log("products:", products.map(product => product.id));
  console.log("language:", language);
  return reply;
}

function capitalizeSentence(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function isArabic(language: NoriLanguage) {
  return language.toLowerCase().startsWith("ar");
}

function money(value: number) {
  return value.toFixed(2);
}

function signedMoney(value: number) {
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toFixed(2)}`;
}

function join(values: string[]) {
  return values.join(", ");
}

function formatWarning(warning: NoriWarning, language: NoriLanguage) {
  if (isArabic(language)) {
    if (warning.type === "contains") {
      return `${warning.productName} يحتوي على ${join(warning.allergens)}.`;
    }
    if (warning.type === "may_contain") {
      return `${warning.productName} قد يحتوي على ${join(warning.allergens)}.`;
    }
    return `${warning.productName} لديه خطر تلامس متبادل موثق مع ${join(warning.allergens)}.`;
  }
  if (warning.type === "contains") {
    return `${warning.productName} contains ${join(warning.allergens)}.`;
  }
  if (warning.type === "may_contain") {
    return `${warning.productName} may contain ${join(warning.allergens)}.`;
  }
  return `${warning.productName} has documented cross-contact with ${join(warning.allergens)}.`;
}
