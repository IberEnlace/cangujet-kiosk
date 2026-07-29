import type {
  NoriConversationState,
  NoriLanguage,
  NoriRankingPriority,
} from "../types/noriChat";

export type NoriUnderstandingSignals = {
  normalizedInput: string;
  priorities: NoriRankingPriority[];
  dietaryTags: string[];
  excludedIngredients: string[];
  allergens: string[];
  categories: string[];
  recommendationCue: boolean;
  restaurantMeaning: boolean;
  impliesRecommendation: boolean;
  isRefinement: boolean;
  kids: boolean;
  wantsDrink: boolean;
  wantsDessert: boolean;
  drinkTemperature: "hot" | "cold" | null;
  spicy: boolean;
  referenceOrdinal: number | null;
  refersToPreviousRecommendations: boolean;
  refersToCurrentCart: boolean;
  refersToLastProduct: boolean;
  alternativeReference: boolean;
  bothReference: boolean;
  comparisonRequest: boolean;
  comparativePreference: "price" | "protein" | "healthy" | "light" | null;
  addCommand: boolean;
  removeCommand: boolean;
  customizationRequest: boolean;
  confidence: number;
  labels: string[];
};

export function normalizeNoriText(input: string, language: NoriLanguage = "en") {
  return input
    .normalize("NFC")
    .toLocaleLowerCase(language === "tr" ? "tr-TR" : "en-US")
    .replace(/’/g, "'")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractNoriUnderstanding(
  input: string,
  language: NoriLanguage,
  state?: NoriConversationState,
): NoriUnderstandingSignals {
  const text = normalizeNoriText(input, language);
  const turkish = language === "tr";
  const priorities: NoriRankingPriority[] = [];
  const labels: string[] = [];
  const addPriority = (priority: NoriRankingPriority, label = priority) => {
    if (!priorities.includes(priority)) priorities.push(priority);
    if (!labels.includes(label)) labels.push(label);
  };

  const protein = turkish
    ? /protein(?:li|i yüksek| oranı yüksek| açısından zengin)|yüksek protein|bol protein|daha proteinli|daha fazla protein|spor(?:dan çıkt|dan sonra| öncesi| sonrası)|antrenman sonrası|gym sonrası/u.test(text)
    : /high (?:in )?protein|protein rich|more protein|higher protein|post workout|after (?:the )?gym|finished work(?:ing)? out|just worked out|gym session/i.test(text);
  const affordable = turkish
    ? /ucuz|uygun fiyat|ekonomik|hesaplı|bütçe dostu|pahalı olmasın|fiyatı düşük|fiyatı uygun|aynı bütçe|bütçemde|bütçeme/u.test(text)
    : /cheap|affordable|budget friendly|less expensive|cheaper|best value|good value|current budget/i.test(text);
  const healthy = turkish
    ? /sağlıklı|diyete uygun|dengeli|besleyici/u.test(text)
    : /healthy|healthier|balanced|nutritious|good for (?:my )?diet/i.test(text);
  const light = turkish
    ? /hafif|ağır (?:bir şey )?(?:olmasın|istemiyorum)|fazla ağır olmasın|kalorisi düşük|kalorisi (?:çok )?yüksek olmasın/u.test(text)
    : /light(?:er)?|not (?:too )?heavy|lower calorie|low calorie/i.test(text);
  const filling = turkish
    ? /tok tut|doyur|çok aç|karnım aç|ne yiyim/u.test(text)
    : /filling|starving|famished|very hungry|really hungry|something substantial/i.test(text);
  const refreshing = turkish
    ? /ferah|serinlet/u.test(text)
    : /refreshing|cooling|something fresh/i.test(text);
  const popular = turkish
    ? /emin değilim|kararsızım|sen seç|en iyisi|ne seçerdin|favorin/u.test(text)
    : /not sure|what would you choose|you choose|your favorite|best choice|most popular/i.test(text);
  const quick = turkish
    ? /acelem|hızlı|çabuk|hemen|vaktim az/u.test(text)
    : /quick|quickly|in a hurry|in a rush|fastest|short on time/i.test(text);

  if (protein) addPriority("protein");
  if (affordable) addPriority("price");
  if (healthy) addPriority("healthy");
  if (light) addPriority("light");
  if (filling) addPriority("filling");
  if (refreshing) addPriority("refreshing");
  if (popular) addPriority("popular");
  if (quick) addPriority("quick");

  const dietaryTags: string[] = [];
  const meatless = turkish
    ? /et yemiyorum|etsiz|vejetaryen/u.test(text)
    : /do not eat meat|don't eat meat|no meat|meatless|vegetarian/i.test(text);
  if (meatless) dietaryTags.push("vegetarian");
  if (/vegan|bitki bazlı/u.test(text)) dietaryTags.push("vegan");

  const noSpice = turkish
    ? /acısız|acı olmasın|acılı olmasın/u.test(text)
    : /not spicy|no spice|mild|without (?:any )?spice/i.test(text);
  const spicy = !noSpice && (turkish
    ? /acılı|baharatlı/u.test(text)
    : /spicy|chili|jalapeno|hot food/i.test(text));
  const excludedIngredients: string[] = [];
  if (meatless) excludedIngredients.push("meat");
  if (noSpice) excludedIngredients.push("spicy");
  if (turkish ? /şekersiz/u.test(text) : /sugar free|without sugar/i.test(text)) excludedIngredients.push("sugar");
  if (turkish ? /sütsüz/u.test(text) : /dairy free|without (?:milk|dairy)/i.test(text)) excludedIngredients.push("milk");

  const allergens: string[] = [];
  const allergenPatterns: Array<[string, RegExp]> = turkish
    ? [
      ["Milk", /süt|sütlü|sütsüz/u],
      ["Peanuts", /yer ?fıstığı|fıstık/u],
      ["Sesame", /susam/u],
      ["Soy", /soya/u],
      ["Wheat", /buğday/u],
      ["Gluten", /glüten|gluten/u],
      ["Eggs", /yumurta/u],
      ["Tree Nuts", /kuruyemiş|ağaç yemiş/u],
    ]
    : [
      ["Milk", /milk|dairy/i],
      ["Peanuts", /peanut/i],
      ["Sesame", /sesame/i],
      ["Soy", /soy/i],
      ["Wheat", /wheat/i],
      ["Gluten", /gluten/i],
      ["Eggs", /egg/i],
      ["Tree Nuts", /tree nuts|nuts/i],
    ];
  const allergyContext = turkish
    ? /alerji|alerjim|alerjik|glütensiz|glutensiz|sütsüz/u.test(text)
    : /allerg|free|without/i.test(text);
  if (allergyContext) {
    for (const [allergen, pattern] of allergenPatterns) if (pattern.test(text)) allergens.push(allergen);
  }

  const categories: string[] = [];
  const categoryPatterns: Array<[string, RegExp]> = turkish
    ? [
      ["burger", /burger/u],
      ["pizza", /pizza/u],
      ["pasta", /makarna|pasta/u],
      ["salad", /salata/u],
      ["dessert", /tatlı/u],
      ["hot_drink", /sıcak içecek|kahve/u],
      ["cold_drink", /soğuk içecek/u],
    ]
    : [
      ["burger", /burger/i],
      ["pizza", /pizza/i],
      ["pasta", /pasta/i],
      ["salad", /salad/i],
      ["dessert", /dessert|something sweet/i],
      ["hot_drink", /hot drink|warm drink|coffee/i],
      ["cold_drink", /cold drink|iced drink/i],
    ];
  for (const [category, pattern] of categoryPatterns) if (pattern.test(text)) categories.push(category);

  const kids = turkish ? /çocuk/u.test(text) : /kid|child|children/i.test(text);
  const wantsDrink = turkish ? /içecek|kahve|meyve suyu/u.test(text) : /drink|beverage|coffee|juice/i.test(text);
  const wantsDessert = categories.includes("dessert");
  const drinkTemperature = turkish
    ? /soğuk/u.test(text) ? "cold" : /sıcak/u.test(text) ? "hot" : null
    : /cold|iced/i.test(text) ? "cold" : /hot|warm/i.test(text) ? "hot" : null;

  const recommendationCue = turkish
    ? /bir şey|bi şey|yemek|ne yiy|öner|göster|var mı|istiyorum|isterim|lazım|olsun|sen seç|ne gider|başka ne|seçenek|neler/u.test(text)
    : /something|food|meal|what (?:can|should|would)|recommend|suggest|show|find|want|need|choose|option|what goes/i.test(text);
  const pairingRequest = turkish
    ? /bunun yanına ne gider|yanına ne öner/u.test(text)
    : /what goes well with|what pairs with|something to go with/i.test(text);
  const referenceOrdinal = ordinal(text, turkish);
  const alternativeReference = turkish
    ? /öbür|diğer|bunu değil|yerine/u.test(text)
    : /other one|not that|instead/i.test(text);
  const bothReference = turkish ? /ikisini de|ikisi/u.test(text) : /both|either of them/i.test(text);
  const comparisonRequest = turkish
    ? /karşılaştır|hangisi|olanı seç/u.test(text)
    : /compare|which (?:one|is)|whichever/i.test(text);
  const comparativePreference: NoriUnderstandingSignals["comparativePreference"] =
    affordable ? "price" : protein ? "protein" : healthy ? "healthy" : light ? "light" : null;
  const addCommand = turkish
    ? /(?:sepete )?ekle|alayım|alacağım/u.test(text)
    : /add|put (?:it|this|that) (?:in|to)/i.test(text);
  const removeCommand = turkish
    ? /sepetten çıkar|onu çıkar|kaldır/u.test(text)
    : /remove|take (?:it|that) out/i.test(text);
  const customizationRequest = turkish
    ? /çıkarıp|çıkar|büyük boy|ekstra|az olsun|değiştir/u.test(text)
    : /remove|without|extra|large|make it|customi[sz]e/i.test(text);
  const refersToPreviousRecommendations = referenceOrdinal !== null
    || alternativeReference
    || bothReference
    || (turkish
      ? /daha |aynı bütçe|ilk iki|bunlar|hangisi/u.test(text)
      : /more |cheaper|lighter|same budget|first two|these options|make it|which one/i.test(text));
  const refersToCurrentCart = turkish
    ? /sepet|sipariş/u.test(text)
    : /cart|order/i.test(text);
  const refersToLastProduct = alternativeReference || (turkish
    ? /bunu|onu|ilki|birincisi|ikincisi/u.test(text)
    : /\bit\b|this one|that one|first one|second one/i.test(text));
  const isRefinement = Boolean(state?.recentRecommendationContext)
    && (refersToPreviousRecommendations || priorities.length > 0)
    && !addCommand
    && !removeCommand;
  const restaurantMeaning = priorities.length > 0
    || dietaryTags.length > 0
    || excludedIngredients.length > 0
    || allergens.length > 0
    || categories.length > 0
    || kids
    || wantsDrink
    || wantsDessert
    || pairingRequest;
  const inherentRecommendation = filling || popular || protein && /spor|antrenman|gym|work/i.test(text);
  const shortPreferenceRequest = restaurantMeaning
    && text.split(/\s+/).length <= 6
    && !addCommand
    && !removeCommand
    && !customizationRequest;
  const impliesRecommendation = isRefinement
    || inherentRecommendation
    || pairingRequest
    || restaurantMeaning && recommendationCue
    || priorities.length >= 2 && shortPreferenceRequest;

  if (dietaryTags.length) labels.push("dietary");
  if (excludedIngredients.length) labels.push("exclusion");
  if (allergens.length) labels.push("allergen");
  if (categories.length) labels.push("category");
  if (kids) labels.push("kids");
  if (refersToPreviousRecommendations) labels.push("reference");
  const confidence = Math.min(0.99, 0.45
    + (restaurantMeaning ? 0.2 : 0)
    + (recommendationCue ? 0.12 : 0)
    + (isRefinement ? 0.12 : 0)
    + (addCommand || removeCommand || comparisonRequest ? 0.1 : 0));

  return {
    normalizedInput: text,
    priorities,
    dietaryTags: [...new Set(dietaryTags)],
    excludedIngredients: [...new Set(excludedIngredients)],
    allergens: [...new Set(allergens)],
    categories: [...new Set(categories)],
    recommendationCue,
    restaurantMeaning,
    impliesRecommendation,
    isRefinement,
    kids,
    wantsDrink,
    wantsDessert,
    drinkTemperature,
    spicy,
    referenceOrdinal,
    refersToPreviousRecommendations,
    refersToCurrentCart,
    refersToLastProduct,
    alternativeReference,
    bothReference,
    comparisonRequest,
    comparativePreference,
    addCommand,
    removeCommand,
    customizationRequest,
    confidence,
    labels,
  };
}

function ordinal(text: string, turkish: boolean) {
  if (turkish && /ilk(?:i|ini)?.*yerine.*ikinci(?:si|sini|yi)?/u.test(text)) return 2;
  const patterns: Array<[number, RegExp]> = turkish
    ? [
      [1, /(?:^|\s)(?:ilk(?:i|ini)?|birinci(?:si|yi)?)(?=$|[\s,.!?])/u],
      [2, /(?:^|\s)ikinci(?:si|sini|yi)?(?=$|[\s,.!?])/u],
      [3, /(?:^|\s)üçüncü(?:sü|sünü|yü)?(?=$|[\s,.!?])/u],
    ]
    : [
      [1, /\bfirst(?: one| option)?\b/i],
      [2, /\bsecond(?: one| option)?\b/i],
      [3, /\bthird(?: one| option)?\b/i],
    ];
  return patterns.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}
