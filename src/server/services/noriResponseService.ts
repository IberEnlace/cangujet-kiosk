import type { AIFoodItem } from "../../app/data/aiMenu";
import type { AllergenCheck } from "../../app/services/noriMenuEngine";
import { formatNumber } from "../../shared/languages";
import type { NoriLanguage, NoriSelectedCustomization, NoriWarning } from "../types/noriChat";
import type { calculateCustomizedProduct } from "./noriCustomizationService";
import type { NoriRequestInterpretation } from "./noriRequestInterpreter";
import { buildNoriRecommendationExplanation } from "./noriExplanationService";

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
  const turkish = language === "tr";
  if (!products.length) {
    const { minProtein, maxBudget, categories } = interpretation.constraints;
    let reply: string;
    if (turkish) {
      reply = minProtein !== null && categories.includes("hot_drink")
        ? `En az ${number(minProtein, language)} g protein içeren belgelenmiş bir sıcak içecek yok. Bunun yerine bir yemek seçmek veya protein koşulunu kaldırmak ister misiniz?`
        : minProtein !== null && maxBudget !== null
          ? `Hem en az ${number(minProtein, language)} g protein hem de $${money(maxBudget, language)} bütçe koşuluna uyan belgelenmiş bir ürün yok. Bütçeyi artırmak mı, protein hedefini düşürmek mi istersiniz?`
          : minProtein !== null
            ? `En az ${number(minProtein, language)} g protein koşuluna uyan belgelenmiş bir ürün yok. Protein hedefini düşürmek veya başka bir öncelik seçmek ister misiniz?`
            : maxBudget !== null
              ? `$${money(maxBudget, language)} bütçeyle tüm koşullara uyan belgelenmiş bir ürün yok. Bütçeyi artırmak veya başka bir koşulu değiştirmek ister misiniz?`
              : "Tüm koşullara uyan belgelenmiş bir ürün yok. Hangi koşulu değiştirmek istersiniz?";
    } else {
      reply = minProtein !== null && categories.includes("hot_drink")
        ? `No documented hot drink provides at least ${number(minProtein, language)}g of protein. Would you like a meal instead, or would you like to remove the protein requirement?`
        : minProtein !== null && maxBudget !== null
          ? `No documented item matches both at least ${number(minProtein, language)}g of protein and a $${money(maxBudget, language)} budget. Would you like to raise the budget or lower the protein target?`
          : minProtein !== null
            ? `No documented item matches at least ${number(minProtein, language)}g of protein. Would you like to lower the protein target or choose another priority?`
            : maxBudget !== null
              ? `No documented item matches all of those conditions within a $${money(maxBudget, language)} budget. Would you like to raise the budget or change another condition?`
              : "No documented item matches all of those conditions. Which condition would you like to change?";
    }
    return reply;
  }

  const [best, ...alternatives] = products;
  const proteinPriority = interpretation.constraints.priorities.includes("protein")
    || interpretation.constraints.minProtein !== null;
  const pricePriority = interpretation.constraints.priorities.includes("price")
    || interpretation.constraints.maxBudget !== null;
  if (interpretation.constraints.priorities.length >= 2) {
    const opening = turkish
      ? proteinPriority && pricePriority
        ? "Uygun fiyatlı ve protein açısından güçlü seçenekler buldum:"
        : "Birden fazla tercihinize uyan seçenekler buldum:"
      : proteinPriority && pricePriority
        ? "I found options with a strong protein-to-price balance:"
        : "I found options matching your combined preferences:";
    const lines = products.map((product, index) =>
      `${index + 1}. ${product.name} — ${multiSignalDetails(product, interpretation, language)}`,
    ).join("\n");
    const summary = turkish
      ? proteinPriority && pricePriority
        ? `En iyi fiyat/protein dengesi ${best.name}; çünkü ${buildNoriRecommendationExplanation(best, interpretation, language)}.`
        : `Tercihlerinizin genel dengesine göre ${best.name} öne çıkıyor; çünkü ${buildNoriRecommendationExplanation(best, interpretation, language)}.`
      : proteinPriority && pricePriority
        ? `${best.name} has the strongest overall protein-to-price balance because ${buildNoriRecommendationExplanation(best, interpretation, language)}.`
        : `${best.name} has the strongest overall balance for those preferences because ${buildNoriRecommendationExplanation(best, interpretation, language)}.`;
    const timingText = interpretation.constraints.needsQuickService
      ? turkish
        ? " Menüde doğrulanmış hazırlık süreleri bulunmadığı için hız garantisi veremem."
        : " The menu has no verified preparation times, so I cannot promise which is fastest."
      : "";
    const warningText = warnings.length ? ` ${formatWarning(warnings[0], language)}` : "";
    return `${opening}\n${lines}\n${summary}${timingText}${warningText}`;
  }
  if (turkish && (proteinPriority || pricePriority)) {
    const opening = proteinPriority && pricePriority
      ? "Uygun fiyatlı ve protein açısından güçlü birkaç seçenek buldum:"
      : proteinPriority
        ? "Protein açısından güçlü birkaç seçenek buldum:"
        : "Uygun fiyatlı birkaç seçenek buldum:";
    const productLines = products.map((product, index) =>
      `${index + 1}. ${product.name} — $${money(product.price, language)}, ${number(product.proteinGrams, language)} g protein`,
    ).join("\n");
    const summary = proteinPriority && pricePriority
      ? `En iyi fiyat/protein dengesi ${best.name}; çünkü ${buildNoriRecommendationExplanation(best, interpretation, language)}.`
      : proteinPriority
        ? `Protein önceliğine göre en güçlü eşleşme ${best.name}; çünkü ${buildNoriRecommendationExplanation(best, interpretation, language)}.`
        : `Fiyat önceliğine göre en güçlü eşleşme ${best.name}; çünkü ${buildNoriRecommendationExplanation(best, interpretation, language)}.`;
    const warningText = warnings.length ? ` ${formatWarning(warnings[0], language)}` : "";
    return `${opening}\n${productLines}\n${summary}${warningText}`;
  }
  const template = recommendationTemplate(interpretation);
  const opening = turkish
    ? turkishOpening(best, template, interpretation)
    : englishOpening(best, template, interpretation);
  const reasons = reasonParts(best, interpretation, language, template).slice(0, 3);
  const explanation = reasons.length
    ? `${/[.!?]$/.test(opening) ? " " : ". "}${capitalizeSentence(reasons.join(turkish ? " ve " : ", and "))}.`
    : /[.!?]$/.test(opening) ? "" : ".";
  const alternativeText = alternatives.length
    ? turkish
      ? ` Diğer uygun seçenekler: ${alternatives.map(product => `${product.name} ($${money(product.price, language)})`).join(" veya ")}.`
      : ` Other good matches are ${alternatives.map(product => `${product.name} at $${money(product.price, language)}`).join(" or ")}.`
    : "";
  const companionText = companion
    ? turkish
      ? ` $${money(companion.price, language)} karşılığında ${companion.name} eklenirse ikisinin toplamı $${money(best.price + companion.price, language)} olur.`
      : ` Add ${companion.name} for $${money(companion.price, language)}, bringing the pair to $${money(best.price + companion.price, language)}.`
    : "";
  const timingText = interpretation.constraints.needsQuickService
    ? turkish
      ? " Doğrulanmış hazırlık süreleri menü verilerinde bulunmadığı için hız konusunda garanti veremem; en güncel süre için personele danışabilirsiniz."
      : " The menu does not include verified preparation times, so I cannot promise which item is fastest; staff can confirm the current wait."
    : "";
  const warningText = warnings.length ? ` ${formatWarning(warnings[0], language)}` : "";
  return `${opening}${explanation}${alternativeText}${companionText}${timingText}${warningText}`;
}

export function buildClarificationResponse(question: string, language: NoriLanguage) {
  if (language !== "tr") return question;
  const normalized = question.toLocaleLowerCase("en-US");
  if (normalized.includes("hot drink")) return "Sıcak bir içecek mi, soğuk bir içecek mi tercih edersiniz?";
  if (normalized.includes("vegetarian pizza")) return "Dana etli, tavuklu veya vejetaryen pizza mı tercih edersiniz?";
  if (normalized.includes("chocolate")) return "Çikolatalı mı, meyveli mi tercih edersiniz?";
  if (normalized.includes("beef")) return "Dana etli, tavuklu veya vejetaryen bir yemek mi tercih edersiniz?";
  return "Hangi seçeneği tercih ettiğinizi biraz daha açıklar mısınız?";
}

export function buildAllergyResponse(product: AIFoodItem, check: AllergenCheck, language: NoriLanguage) {
  const turkish = language === "tr";
  const severe = turkish
    ? " Ciddi bir alerjiniz varsa lütfen restoran personeliyle doğrulayın."
    : " For a severe allergy, please confirm with restaurant staff.";
  if (check.contains.length) {
    return turkish
      ? `${product.name} doğrudan ${join(check.contains)} içerir.${severe}`
      : `${product.name} directly contains ${join(check.contains)}.${severe}`;
  }
  if (check.mayContain.length) {
    return turkish
      ? `${product.name} bunları doğrudan içerik olarak listelemiyor ancak ${join(check.mayContain)} içerebilir.${severe}`
      : `${product.name} does not list it as a direct ingredient, but may contain ${join(check.mayContain)}.${severe}`;
  }
  if (check.crossContact.length) {
    return turkish
      ? `${product.name} bunları doğrudan içerik olarak listelemiyor ancak ortak ekipman nedeniyle ${join(check.crossContact)} ile çapraz temas riski belgelenmiştir.${severe}`
      : `${product.name} does not list it as a direct ingredient, but shared-equipment cross-contact with ${join(check.crossContact)} is documented.${severe}`;
  }
  return turkish
    ? `${product.name} için seçili alerjenlerle belgelenmiş bir eşleşme yoktur ancak tam güvenlik garanti edilemez.${severe}`
    : `${product.name} has no documented match for the selected allergens, but complete safety cannot be guaranteed.${severe}`;
}

export function buildCustomizationResponse(
  product: AIFoodItem,
  customization: NoriSelectedCustomization,
  calculation: CustomizedCalculation,
  language: NoriLanguage,
) {
  const turkish = language === "tr";
  const priceText = customization.priceAdjustment === 0
    ? turkish ? "fiyat değişmez" : "the price stays the same"
    : turkish
      ? `fiyat ${signedMoney(customization.priceAdjustment, language)} değişerek $${money(calculation.adjustedPrice, language)} olur`
      : `the price changes by ${signedMoney(customization.priceAdjustment, language)} to $${money(calculation.adjustedPrice, language)}`;
  const nutritionChanges = turkish
    ? [
      calculation.adjustedNutrition.calories !== product.cal ? `kalori ${number(product.cal, language)} değerinden ${number(calculation.adjustedNutrition.calories, language)} değerine çıkar` : "",
      calculation.adjustedNutrition.proteinGrams !== product.proteinGrams ? `protein ${number(product.proteinGrams, language)} g değerinden ${number(calculation.adjustedNutrition.proteinGrams, language)} g değerine çıkar` : "",
    ].filter(Boolean)
    : [
      calculation.adjustedNutrition.calories !== product.cal ? `calories change from ${number(product.cal, language)} to ${number(calculation.adjustedNutrition.calories, language)}` : "",
      calculation.adjustedNutrition.proteinGrams !== product.proteinGrams ? `protein changes from ${number(product.proteinGrams, language)}g to ${number(calculation.adjustedNutrition.proteinGrams, language)}g` : "",
    ].filter(Boolean);
  const nutritionText = nutritionChanges.length ? `, ${nutritionChanges.join(turkish ? " ve " : ", and ")}` : "";
  const allergenText = customization.allergensRemoved.length
    ? turkish
      ? `; belgelenmiş tariften ${join(customization.allergensRemoved)} çıkarılır`
      : `, and ${join(customization.allergensRemoved)} are removed from the documented recipe`
    : customization.allergensAdded.length
      ? turkish
        ? `; belgelenmiş alerjenlere ${join(customization.allergensAdded)} eklenir`
        : `, and ${join(customization.allergensAdded)} are added to the documented allergens`
      : "";
  return turkish
    ? `Evet. ${customization.optionName}, ${product.name} için belgelenmiş bir seçenektir; ${priceText}${nutritionText}${allergenText}. Çapraz temas riski devam eder.`
    : `Yes. ${customization.optionName} is documented for ${product.name}; ${priceText}${nutritionText}${allergenText}. Cross-contact risk still remains.`;
}

export function buildCartConfirmationResponse(input: {
  product: AIFoodItem;
  quantity: number;
  customizations: NoriSelectedCustomization[];
  adjustedUnitPrice: number;
  adjustedNutrition?: { calories: number; proteinGrams: number };
  language: NoriLanguage;
}) {
  const turkish = input.language === "tr";
  const customizationText = input.customizations.length
    ? ` ${turkish ? "şu seçeneklerle:" : "with"} ${input.customizations.map(item => item.optionName).join(", ")}`
    : "";
  const total = input.adjustedUnitPrice * input.quantity;
  const nutritionText = input.adjustedNutrition
    ? turkish
      ? ` (${number(input.adjustedNutrition.calories, input.language)} kalori, ${number(input.adjustedNutrition.proteinGrams, input.language)} g protein)`
      : ` (${number(input.adjustedNutrition.calories, input.language)} calories, ${number(input.adjustedNutrition.proteinGrams, input.language)}g protein)`
    : "";
  const safetyText = input.customizations.length
    ? turkish ? " Çapraz temas uyarıları geçerliliğini korur." : " Cross-contact warnings still apply."
    : "";
  return turkish
    ? `Lütfen onaylayın: ${input.quantity} adet ${input.product.name}${customizationText}, toplam $${money(total, input.language)}${nutritionText}.${safetyText}`
    : `Please confirm: add ${input.quantity} ${input.product.name}${customizationText} for $${money(total, input.language)}${nutritionText}.${safetyText}`;
}

export function buildCartExecutionResponse(productNames: string[], success: boolean, language: NoriLanguage) {
  if (!success) {
    return language === "tr"
      ? "Ürünü sepetinize ekleyemedim. Lütfen tekrar deneyin."
      : "I could not add the item to your cart. Please try again.";
  }
  return language === "tr"
    ? `${productNames.join(" ve ")} sepetinize eklendi.`
    : `${productNames.join(" and ")} ${productNames.length === 1 ? "was" : "were"} added to your cart.`;
}

export function buildCheckoutResponse(input: {
  lines: CheckoutResponseLine[];
  subtotal: number;
  tax: number;
  total: number;
  language: NoriLanguage;
  confirmation: boolean;
}) {
  const turkish = input.language === "tr";
  const lineText = input.lines.map(line => {
    const customization = line.customizationNames.length ? ` (${line.customizationNames.join(", ")})` : "";
    return `${line.quantity}x ${line.product.name}${customization}: $${money(line.lineTotal, input.language)}`;
  }).join("; ");
  const warnings = input.lines.flatMap(line => line.warnings);
  const warningText = warnings.length
    ? turkish
      ? ` Belgelenmiş alerjen uyarıları bulunuyor: ${warnings.map(warning => formatWarning(warning, input.language)).join(" ")}`
      : ` Documented allergen warnings apply: ${warnings.map(warning => formatWarning(warning, input.language)).join(" ")}`
    : "";
  const totals = turkish
    ? `Ara toplam $${money(input.subtotal, input.language)}, tahmini vergi $${money(input.tax, input.language)}, toplam $${money(input.total, input.language)}.`
    : `Subtotal $${money(input.subtotal, input.language)}, estimated tax $${money(input.tax, input.language)}, total $${money(input.total, input.language)}.`;
  const confirmation = input.confirmation
    ? turkish ? " Güvenli ödeme ekranını açmak için onaylayın." : " Confirm to open the secure payment screen."
    : "";
  return `${lineText}. ${totals}${warningText}${confirmation}`;
}

function recommendationTemplate(interpretation: NoriRequestInterpretation) {
  const constraints = interpretation.constraints;
  if (constraints.kids) return "kids";
  if (constraints.spicy) return "spicy";
  if (constraints.dietaryTags.includes("vegan")) return "vegan";
  if (constraints.priorities.includes("popular")) return "popular";
  if (constraints.priorities.includes("refreshing")) return "refreshing";
  if (constraints.priorities.includes("filling")) return "filling";
  if (constraints.priorities.includes("light")) return "light";
  if (constraints.priorities.includes("healthy")) return "healthy";
  if (constraints.priorities.includes("price")) return "budget";
  if (constraints.priorities.includes("protein")) return "high_protein";
  if (constraints.minProtein !== null) return "high_protein";
  if (constraints.maxCalories !== null) return "low_calorie";
  if (constraints.maxBudget !== null) return "budget";
  return "general";
}

function englishOpening(product: AIFoodItem, template: string, interpretation: NoriRequestInterpretation) {
  switch (template) {
    case "budget": return interpretation.constraints.maxBudget !== null
      ? `Within your $${money(interpretation.constraints.maxBudget, "en")} budget, ${product.name} stands out at $${money(product.price, "en")}`
      : `For an affordable choice, ${product.name} stands out at $${money(product.price, "en")}`;
    case "high_protein": return `The best match for high-protein food is ${product.name} with ${number(product.proteinGrams, "en")}g protein`;
    case "low_calorie": return `${product.name} fits your calorie limit at ${number(product.cal, "en")} calories`;
    case "vegan": return `For a plant-based choice, ${product.name} is a documented vegan option at $${money(product.price, "en")}`;
    case "kids": return `${product.name} is a documented kids meal`;
    case "spicy": return `If you enjoy some heat, ${product.name} is a strong spicy choice`;
    case "healthy": return `${product.name} is my strongest balanced choice`;
    case "light": return `${product.name} is my leading lighter choice`;
    case "filling": return `${product.name} is my leading filling choice`;
    case "refreshing": return `${product.name} is my most refreshing menu-based match`;
    case "popular": return interpretation.constraints.asksMostOrdered
      ? `I do not have verified order counts, but ${product.name} is the strongest match in the menu's recommendation ranking`
      : `${product.name} is my strongest menu-based pick`;
    default: return `${product.name} is my leading recommendation.`;
  }
}

function turkishOpening(product: AIFoodItem, template: string, interpretation: NoriRequestInterpretation) {
  switch (template) {
    case "budget": return `$${money(interpretation.constraints.maxBudget ?? product.price, "tr")} bütçeniz içinde $${money(product.price, "tr")} fiyatlı ${product.name} öne çıkıyor`;
    case "high_protein": return `En uygun yüksek proteinli seçenek, ${number(product.proteinGrams, "tr")} g protein içeren ${product.name}`;
    case "low_calorie": return `${product.name}, ${number(product.cal, "tr")} kaloriyle kalori sınırınıza uyuyor`;
    case "vegan": return `Bitki bazlı bir seçim olarak ${product.name}, $${money(product.price, "tr")} fiyatlı belgelenmiş vegan bir seçenektir`;
    case "kids": return `${product.name}, belgelenmiş bir çocuk menüsüdür`;
    case "spicy": return `Acı seviyorsanız ${product.name} güçlü bir seçenektir`;
    case "healthy": return `${product.name} en güçlü dengeli önerimdir`;
    case "light": return `${product.name} öne çıkan hafif seçeneğimdir`;
    case "filling": return `${product.name} öne çıkan doyurucu seçeneğimdir`;
    case "refreshing": return `${product.name} menü verilerine göre en ferahlatıcı eşleşmedir`;
    case "popular": return interpretation.constraints.asksMostOrdered
      ? `Doğrulanmış sipariş sayılarım yok ancak ${product.name} menünün öneri sıralamasındaki en güçlü eşleşmedir`
      : `${product.name} menü verilerine dayalı en güçlü seçimimdir`;
    default: return `${product.name} ilk önerimdir.`;
  }
}

function reasonParts(product: AIFoodItem, interpretation: NoriRequestInterpretation, language: NoriLanguage, template: string) {
  const constraints = interpretation.constraints;
  const turkish = language === "tr";
  const reasons: string[] = [];
  if (constraints.maxBudget !== null && template !== "budget") reasons.push(turkish ? `fiyatı $${money(product.price, language)}` : `It costs $${money(product.price, language)}`);
  if (constraints.minProtein !== null && template !== "high_protein") reasons.push(turkish ? `${number(product.proteinGrams, language)} g protein sağlar` : `it provides ${number(product.proteinGrams, language)}g protein`);
  if (constraints.maxCalories !== null && template !== "low_calorie") reasons.push(turkish ? `${number(product.cal, language)} kaloridir` : `it has ${number(product.cal, language)} calories`);
  if (constraints.dietaryTags.includes("vegan") && template !== "vegan") reasons.push(turkish ? "vegan olduğu belgelenmiştir" : "it is documented vegan");
  else if (constraints.dietaryTags.includes("vegetarian")) reasons.push(turkish ? "vejetaryen olduğu belgelenmiştir" : "it is documented vegetarian");
  if (constraints.kids && template !== "kids") reasons.push(turkish ? "çocuk menüsü kategorisindedir" : "it is listed in the kids category");
  if (constraints.spicy && template !== "spicy") reasons.push(turkish ? `belgelenmiş acılık seviyesi ${product.spiceLevel}` : `its documented spice level is ${product.spiceLevel}`);
  if (constraints.priorities.includes("protein") && template !== "high_protein") reasons.push(turkish ? `${number(product.proteinGrams, language)} g protein içerir` : `it provides ${number(product.proteinGrams, language)}g protein`);
  if (constraints.priorities.includes("filling") && template === "filling") reasons.push(turkish ? `${number(product.cal, language)} kalori, ${number(product.proteinGrams, language)} g protein ve ${number(product.nutrition.fiberGrams, language)} g lif içerir` : `it combines ${number(product.cal, language)} calories, ${number(product.proteinGrams, language)}g protein, and ${number(product.nutrition.fiberGrams, language)}g fiber`);
  if (constraints.priorities.includes("light") && template === "light") reasons.push(turkish ? `${number(product.cal, language)} kaloridir` : `it has ${number(product.cal, language)} calories`);
  if (constraints.priorities.includes("refreshing") && template === "refreshing") reasons.push(turkish ? `içeriği ve kategorisi ferahlatıcı isteğinizle eşleşir` : `its documented category and ingredients fit a refreshing request`);
  if (constraints.priorities.includes("healthy") && template === "healthy") reasons.push(turkish ? `${number(product.cal, language)} kalori, ${number(product.proteinGrams, language)} g protein ve ${number(product.nutrition.fiberGrams, language)} g lif içerir` : `it has ${number(product.cal, language)} calories, ${number(product.proteinGrams, language)}g protein, and ${number(product.nutrition.fiberGrams, language)}g fiber`);
  if (!reasons.length && template === "general") reasons.push(turkish ? `fiyatı $${money(product.price, language)}` : `It costs $${money(product.price, language)}`);
  return reasons;
}

function multiSignalDetails(
  product: AIFoodItem,
  interpretation: NoriRequestInterpretation,
  language: NoriLanguage,
) {
  const turkish = language === "tr";
  const priorities = interpretation.constraints.priorities;
  const details: string[] = [`$${money(product.price, language)}`];
  if (priorities.includes("protein") || priorities.includes("filling")) {
    details.push(turkish
      ? `${number(product.proteinGrams, language)} g protein`
      : `${number(product.proteinGrams, language)}g protein`);
  }
  if (priorities.includes("light") || priorities.includes("healthy")) {
    details.push(turkish
      ? `${number(product.cal, language)} kalori`
      : `${number(product.cal, language)} calories`);
  }
  if (priorities.includes("filling")) {
    details.push(turkish
      ? `${number(product.nutrition.fiberGrams, language)} g lif`
      : `${number(product.nutrition.fiberGrams, language)}g fiber`);
  }
  return details.join(", ");
}

function capitalizeSentence(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
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

function signedMoney(value: number, language: NoriLanguage) {
  return `${value >= 0 ? "+" : "-"}$${money(Math.abs(value), language)}`;
}

function join(values: string[]) {
  return values.join(", ");
}

function formatWarning(warning: NoriWarning, language: NoriLanguage) {
  if (language === "tr") {
    if (warning.type === "contains") return `${warning.productName}, ${join(warning.allergens)} içerir.`;
    if (warning.type === "may_contain") return `${warning.productName}, ${join(warning.allergens)} içerebilir.`;
    return `${warning.productName} için ${join(warning.allergens)} ile belgelenmiş çapraz temas riski vardır.`;
  }
  if (warning.type === "contains") return `${warning.productName} contains ${join(warning.allergens)}.`;
  if (warning.type === "may_contain") return `${warning.productName} may contain ${join(warning.allergens)}.`;
  return `${warning.productName} has documented cross-contact with ${join(warning.allergens)}.`;
}
