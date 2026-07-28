import type { NoriConversationState, NoriIntent, NoriLanguage } from "../types/noriChat";

export type NoriIntentDecision = { intent: NoriIntent; confidence: number; reason: string; normalizedInput: string };

export function normalizeNoriInput(input: string, language: NoriLanguage = "en") {
  return input
    .normalize("NFC")
    .toLocaleLowerCase(language === "tr" ? "tr-TR" : "en-US")
    .replace(/’/g, "'")
    .replace(/[_-]+/g, " ")
    .replace(/^an i\b/, "can i")
    .replace(/^alf sweet\b/, "half sweet")
    .replace(/\s+/g, " ")
    .trim();
}

export function routeNoriIntent(input: string, state: NoriConversationState): NoriIntentDecision {
  const text = normalizeNoriInput(input, state.preferredLanguage);
  const pending = state.pendingAction;
  const decide = (intent: NoriIntent, reason: string, confidence = .96): NoriIntentDecision => ({ intent, reason, confidence, normalizedInput: text });
  if (pending && /^(evet|onaylıyorum|tamam|ekle|devam et)$/.test(text)) return decide("confirmation", "Turkish confirmation for valid pending action", .99);
  if (pending && /^(hayır|iptal et|vazgeçtim|bunu ekleme)$/.test(text)) return decide("cancellation", "Turkish cancellation for valid pending action", .99);
  if (/(?:ödemeye geç|siparişi tamamla|kasaya devam et)/.test(text)) return decide("checkout", "Turkish checkout command", .99);
  if (/sepeti temizle/.test(text)) return decide("clear_cart", "Turkish cart clear command", .99);
  if (/(?:sepetten çıkar|içeceği kaldır)/.test(text)) return decide("remove_from_cart", "Turkish cart removal command", .99);
  if (/(?:bir tane daha ekle|adedi (?:iki|2) yap)/.test(text)) return decide("update_quantity", "Turkish quantity command", .99);
  if (/(?:bunu|onu|ilkini|ikinci seçeneği)\s+(?:sepete )?ekle|onu istiyorum/.test(text)) return decide("add_to_cart", "Turkish cart add command", .99);
  if (/(?:peyniri çıkar|soğansız olsun|ekstra peynir ekle|sosu çıkar|büyük boy yap|acısı az olsun)/.test(text)) return decide("customization_question", "Turkish customization command", .99);
  if (/(?:ilk iki seçeneği karşılaştır|ilk iki seçenek)/.test(text)) return decide("compare_products", "Turkish recent-result comparison", .99);
  if (/(?:hangisi daha sağlıklı|hangisinde daha fazla protein var|spor için hangisi daha iyi)/.test(text)) return decide("comparison_follow_up", "Turkish comparison follow-up", .99);
  if (/(?:protein oranı yüksek|en yüksek protein|yüksek proteinli)/.test(text)) return decide("highest_protein", "Turkish high-protein request", .99);
  if (/(?:sağlıklı bir şey öner|sağlıklı.*öner)/.test(text)) return decide("healthy_recommendation", "Turkish healthy recommendation", .99);
  if (/(?:acılı bir şey istiyorum|acı.*(?:öner|istiyorum))/.test(text)) return decide("recommendation", "Turkish spicy recommendation", .98);
  if (/vejetaryen seçenekler neler/.test(text)) return decide("recommendation", "Turkish vegetarian recommendation", .98);
  if (/(?:bütçeme uygun|bütçe.*öner)/.test(text)) return decide("recommendation", "Turkish budget recommendation", .98);
  if (/(?:ilkini seç|ikinci seçeneği ekle)/.test(text)) return decide("product_details", "Turkish selection reference", .99);
  if (pending && /^(yes|confirm|okay|ok|sure|proceed|do it|apply it)[.! ]*$/.test(text)) return decide("confirmation", "confirmation for valid pending action", .99);
  if (pending && /^(no|cancel|never mind|do not add it)[.! ]*$/.test(text)) return decide("cancellation", "cancellation for valid pending action", .99);
  if (/^(start over|new order)[.! ]*$|\b(clear my preferences|forget my budget)\b/.test(text)) return decide("clarification_answer", "explicit state reset command", .99);
  if (/^(?:i only have|i have|my budget is|budget is)\s*\$?\s*\d+(?:\.\d+)?[.! ]*$/.test(text)
    || /^(?:(?:i )?(?:don't|do not) feel like eating|no|nothing|avoid)\s+(?:beef|meat|cheese|spicy|fried(?: food)?)(?: today)?[.! ]*$/.test(text)
    || /^(?:i want )?(?:under|below|less than)\s*\d+(?:\.\d+)?\s*(?:calories|cal)[.! ]*$/.test(text)
    || /^(?:(?:i need )?(?:at least|over|above|more than)\s*\d+(?:\.\d+)?\s*g(?:rams?)?\s*(?:of\s*)?protein|actually,?\s*\d+(?:\.\d+)?\s*g(?:rams?)?(?:\s*(?:of\s*)?protein)?\s+is enough)[.! ]*$/.test(text)) {
    return decide("constraint_update", "constraint-only recommendation context", .98);
  }
  if (/\b(checkout|pay now|proceed to checkout)\b/.test(text)) return decide("checkout", "checkout command");
  if (/^(undo|undo that|revert the last change)\b/.test(text)) return decide("undo", "undo command");
  if (/\b(clear|empty).{0,12}\bcart\b/.test(text)) return decide("clear_cart", "cart clear command");
  if (/\b(review|summari[sz]e|read).{0,20}\b(order|cart)\b|\bwhat am i ordering\b|\bcheck my order before checkout\b/.test(text)) return decide("review_order", "order review request", .99);
  if (/\b(cart total|total price)\b|\bwhat is (?:my |the )?total\b|\bhow much (?:is my cart|do i owe)\b|\bwhat does everything cost\b/.test(text)) return decide("cart_total", "cart total request", .99);
  if (/\b(show|view|what is in).{0,12}\bcart\b|^(?:show|view) my cart/.test(text)) return decide("show_cart", "cart display command");
  if (/\b(remove|delete).{0,20}\bcart\b|\bfrom (?:my )?cart\b|^remove it\b/.test(text)) return decide("remove_from_cart", "cart removal command");
  if (/\b(increase|decrease|quantity|change to|make it|set).{0,12}\d+\b/.test(text)) return decide("update_quantity", "quantity command");
  if (/^add (?:the )?(?:healthier|higher[ -]protein|lower[ -]calorie|cheaper|better (?:one )?for (?:the )?gym)(?: one)?[.! ]*$/.test(text)) return decide("comparative_add", "comparative cart add command", .99);
  if (/\b(add|put).{0,20}\bcart\b|^add (?:it|the|this|that|both|only)/.test(text)) return decide("add_to_cart", "cart add command");
  if (/\b(?:choose|select) the (?:first|second|third) pair\b/.test(text)) return decide("product_details", "bundle pair selection", .98);
  if (/\b(remove|take off|without|no|hold|extra|light|on the side|half sweet|gluten free|lettuce wrap|replace).{0,30}\b(onions?|tomatoes?|pickles?|mayo(?:nnaise)?|cheese|cheddar|mozzarella|parmesan|sauce|dressing|bread|bun|lettuce|greens|sweet|fries|fruit)\b|^(gluten free bun|half sweet)/.test(text)) return decide("customization_question", state.selectedProductId || pending ? "customization with active product" : "customization requiring product clarification");
  if ((state.comparisonContext || (state.lastComparedProductIds?.length ?? 0) === 2) && /\b(which one|more protein|fewer calories|less fat|less sodium|cheaper|healthier|better for (?:the )?gym|safer|recommend)\b/.test(text)) return decide("comparison_follow_up", "comparison context follow-up", .99);
  if (/\bwhich one (?:is healthier|has more protein|would you recommend|is cheaper|is better for (?:the )?gym|has fewer calories|has less fat|has less sodium|is safer)\b/.test(text)) return decide("comparison_follow_up", "comparison follow-up needing context", .9);
  if (/\b(first two|first and (?:second|third)|these (?:two|options)|first two burgers)\b/.test(text)) return decide("compare_products", "recent-result comparison request", .98);
  if (/\b(compare|difference|versus| vs )\b/.test(text)) return decide("product_comparison", "product comparison request", .98);
  if (/\b(which|what|show me).{0,24}\b(most|highest|protein rich)\b.{0,12}\bprotein\b|\bhighest protein\b/.test(text)) return decide("highest_protein", "nutrition superlative", .99);
  if (/\b(fewest|least|lowest|lightest)\b.{0,12}\b(calories?|calorie)\b|\blowest calorie\b/.test(text)) return decide("lowest_calories", "nutrition superlative", .99);
  if (/\b(lowest|least|fewest)\b.{0,12}\bfat\b/.test(text)) return decide("lowest_fat", "nutrition superlative", .99);
  if (/\b(lowest|least|fewest)\b.{0,12}\b(sugar|sugars)\b/.test(text)) return decide("lowest_sugar", "nutrition superlative", .99);
  if (/\b(lowest|least)\b.{0,12}\bsodium\b/.test(text)) return decide("lowest_sodium", "nutrition superlative", .99);
  if (/\b(most|highest)\b.{0,12}\bfiber\b/.test(text)) return decide("highest_fiber", "nutrition superlative", .99);
  if (/\b(how do i order|how can i order|how does ordering work|help me place an order|ordering steps|use this kiosk|what should i do first|explain how to order)\b/.test(text)) return decide("ordering_help", "ordering instructions", .99);
  if (/\b(food|meal|lunch|burger)\b.{0,16}\b(and|plus|with)\b.{0,10}\b(drink|beverage|coffee)\b|\bcomplete meal with a beverage\b/.test(text)) return decide("bundle_recommendation", "explicit food and drink request", .98);
  if (/\b(recommend|suggest|show|find|want).{0,24}\b(healthy|healthier|light|nutritious|low calorie|low fat|balanced|good for my diet)\b/.test(text)) return decide("healthy_recommendation", "healthy recommendation request", .98);
  if (/\b(will it|become|is it).{0,12}\bsafe\b|\b(allerg|contains|gluten|milk|dairy|peanut|sesame|soy|wheat|nuts)\b/.test(text)) return decide("allergen_check", "allergen request");
  if (/\b(recommend|suggest|show|find|need|want)\b/.test(text) && /\b(calories?|protein|fat|sugars?|fiber|carbs?|sodium|meals?|food|drinks?|desserts?)\b/.test(text)) return decide("recommendation", "nutrition-filtered menu discovery request", .95);
  if (/\b(calorie|protein|nutrition|fat|sugar|fiber|carb|sodium)\b/.test(text)) return decide("nutrition_question", "nutrition request");
  if (/\b(i'm|i am|im) diabetic\b|\btrying to lose weight\b|\bwhat is healthiest\b/.test(text)) return decide("nutrition_question", "medical-diet nutrition request");
  if (/\b(what comes with|what is included|does it come with|tell me about).{0,20}\b(kids?|children|meal|drink)\b|^what is included[?!. ]*$/.test(text)) return decide("product_details", "kids meal details request", .98);
  if (/\b(details?|ingredient|what is in|tell me about)\b/.test(text)) return decide("product_details", "product details request");
  if (/\b(how long|preparation time|order take|when.*ready)\b/.test(text)) return decide("order_timing", "order timing information request");
  if (/\b(apple pay|google pay|payment method|how can i pay|pay with)\b/.test(text)) return decide("payment_methods", "payment information request");
  if (/\b(open|opening hours?|close|closing|hours)\b/.test(text)) return decide("opening_hours", "opening-hours request");
  if (/\bhalal\b/.test(text)) return decide("restaurant_information", "halal certification request");
  if (/\b(call|need|get|request).{0,12}\b(staff|employee|team member|assistance)\b/.test(text)) return decide("staff_assistance", "staff assistance request");
  if (/^(hi|hello|hey|merhaba)\b/.test(text)) return decide("greeting", "greeting");
  if (/\b(help|what can you do)\b/.test(text)) return decide("help", "help request");
  if (/^(i want|give me|show me) (food|something)[.! ]*$/.test(text)) return decide("recommendation", "ambiguous food request", .7);
  if (/\b(i have|budget|under|up to|max)\s*\$?\s*\d+/.test(text)) return decide("recommendation", "budget menu request", .9);
  if (/\b(select|choose|pick) (?:the )?(?:first|second|1st|2nd) (?:option|one|item)\b/.test(text)) return decide("product_details", "selection reference");
  if (/\b(best|recommend|suggest|meal|food|burger|pizza|pasta|salad|drink|vegan|vegetarian|kids?|spicy|dessert|budget|under \$|after the gym|post workout|light|fresh|filling|starving|comfort food|fried|eat beef|eat meat)\b/.test(text)) return decide("recommendation", "explicit menu discovery request", .9);
  return decide("unsupported", "no supported intent matched", .9);
}
