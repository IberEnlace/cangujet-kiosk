import type {
  NoriChatRequest,
  NoriConversationAct,
  NoriConversationStage,
  NoriConversationState,
  NoriLanguage,
} from "../types/noriChat";

type Template = { id: string; text: string };
type TemplateGroup = Record<NoriLanguage, Template[]>;

const GREETINGS: TemplateGroup = {
  tr: [
    { id: "greeting.tr.1", text: "Merhaba! Ben Nori. Bugün size ne önerebilirim?" },
    { id: "greeting.tr.2", text: "Selam! Lezzetli bir şey seçmenize yardımcı olabilirim." },
    { id: "greeting.tr.3", text: "Hoş geldiniz! Ne yemek istediğinizi birlikte bulabiliriz." },
  ],
  en: [
    { id: "greeting.en.1", text: "Hello! I’m Nori. What can I help you choose today?" },
    { id: "greeting.en.2", text: "Hi! I can help you find the right meal." },
    { id: "greeting.en.3", text: "Welcome! Let’s find something you’ll enjoy." },
  ],
};

const ACTIVE_GREETINGS: TemplateGroup = {
  tr: [
    { id: "greeting.active.tr.1", text: "Tekrar merhaba! Siparişinize devam edebiliriz." },
    { id: "greeting.active.tr.2", text: "Merhaba! Kaldığımız yerden devam edebiliriz." },
  ],
  en: [
    { id: "greeting.active.en.1", text: "Hello again! We can continue with your order." },
    { id: "greeting.active.en.2", text: "Hi again! We can pick up where we left off." },
  ],
};

export function selectNoriSocialTemplate(
  group: TemplateGroup,
  language: NoriLanguage,
  state: NoriConversationState,
) {
  const templates = group[language];
  const rotation = Math.max(0, state.socialResponseRotationIndex ?? 0);
  let selected = templates[rotation % templates.length];
  if (selected.id === state.lastAssistantTemplateId && templates.length > 1) {
    selected = templates[(rotation + 1) % templates.length];
  }
  state.lastAssistantTemplateId = selected.id;
  state.socialResponseRotationIndex = rotation + 1;
  return selected.text;
}

export function buildNoriSocialResponse(input: {
  act: NoriConversationAct;
  stage: NoriConversationStage;
  state: NoriConversationState;
  request: NoriChatRequest;
}): string {
  const { act, stage, state, request } = input;
  const tr = state.preferredLanguage === "tr";
  switch (act) {
    case "greeting":
      return selectNoriSocialTemplate(
        stage === "new_session" || stage === "welcomed" ? GREETINGS : ACTIVE_GREETINGS,
        state.preferredLanguage,
        state,
      );
    case "introduction":
    case "ask_capabilities":
      state.lastAssistantTemplateId = `capabilities.${state.preferredLanguage}`;
      return tr
        ? "Ben Nori. Menüden yemek önerebilir, ürünleri karşılaştırabilir, kayıtlı besin ve alerjen bilgilerini açıklayabilir, özelleştirmelere, sepetinize ve ödeme adımına yardımcı olabilirim."
        : "I’m Nori. I can recommend menu items, compare products, explain documented nutrition and allergen information, help with customizations, manage your cart, and guide you to checkout.";
    case "gratitude":
    case "praise":
    case "acknowledgement":
      return gratitudeResponse(stage, request.cart.length > 0, tr);
    case "farewell":
      if (stage === "completed" || state.closingStatus === "order_completed") {
        return tr
          ? "Rica ederim! Afiyet olsun."
          : "You’re welcome! Enjoy your meal.";
      }
      if (request.cart.length) {
        state.closingStatus = "awaiting_checkout_decision";
        return tr
          ? "Tabii. Sepetinizde ürünler var. Ödemeye geçmek ister misiniz, yoksa siparişi iptal mi edelim?"
          : "Of course. You still have items in your cart. Would you like to continue to checkout or cancel the order?";
      }
      state.closingStatus = "closed";
      return tr ? "Teşekkürler, görüşmek üzere!" : "Thank you. Goodbye!";
    case "pause_request":
      state.closingStatus = "paused";
      return tr ? "Tabii, bekliyorum. Hazır olduğunuzda devam edebiliriz." : "Of course. I’ll wait; we can continue when you’re ready.";
    case "resume_conversation":
      state.closingStatus = "open";
      return tr ? "Hazırım. Siparişinize devam edebiliriz." : "I’m ready. We can continue with your order.";
    case "abusive_or_inappropriate_language":
      return tr
        ? "Size yardımcı olmak için buradayım. Menü, sipariş veya sepetiniz hakkında devam edebiliriz."
        : "I’m here to help. We can continue with the menu, your order, or your cart.";
    case "unrelated_request":
      return tr
        ? "Bu konuda yardımcı olamıyorum, ancak menüden seçim yapmanıza veya siparişinizi tamamlamanıza yardımcı olabilirim."
        : "I can’t help with that topic, but I can help you choose from the menu or complete your order.";
    case "empty_or_noise_input":
      return noiseResponse(state);
    case "correction":
      return tr
        ? "Üzgünüm, sizi yanlış anladım. Hangi kısmı değiştirmemi istersiniz: ürün, fiyat, beslenme tercihi veya özelleştirme?"
        : "Sorry, I misunderstood you. What should I change: the product, price, dietary preference, or customization?";
    case "rejection":
    case "change_mind":
      return tr
        ? "Anladım. Önceki seçeneği tekrar önermeden farklı bir seçenek bulabilirim."
        : "Understood. I can find a different option without repeating the previous choice.";
    case "indecision":
    case "hesitation":
      return tr
        ? "Daha hafif, daha doyurucu veya daha uygun fiyatlı bir şey mi tercih edersiniz?"
        : "Would you prefer something lighter, more filling, or more affordable?";
    default:
      return tr ? "Nasıl yardımcı olabilirim?" : "How can I help?";
  }
}

export function socialBusinessPrefix(
  acts: NoriConversationAct[],
  language: NoriLanguage,
  asksPersonalChoice: boolean,
) {
  if (asksPersonalChoice) return language === "tr"
    ? "Ben yemek yemiyorum, ancak tercihlerinize göre en güçlü seçeneği belirleyebilirim. "
    : "I don’t eat, but I can choose the strongest option based on your preferences. ";
  if (acts.includes("correction")) return language === "tr"
    ? "Haklısınız, sizi yanlış anladım. "
    : "You’re right; I misunderstood you. ";
  if (acts.includes("gratitude")) return language === "tr" ? "Rica ederim! " : "You’re welcome! ";
  if (acts.includes("greeting")) return language === "tr" ? "Merhaba! " : "Hello! ";
  if (acts.includes("praise") || acts.includes("acknowledgement")) return language === "tr" ? "Tabii! " : "Of course! ";
  return "";
}

function gratitudeResponse(stage: NoriConversationStage, hasCart: boolean, tr: boolean) {
  if (stage === "completed") return tr ? "Rica ederim! Afiyet olsun." : "You’re welcome! Enjoy your meal.";
  if (stage === "checkout_ready") return tr ? "Rica ederim. Siparişinizi tamamlamaya hazırsınız." : "You’re welcome. You’re ready to complete your order.";
  if (hasCart || stage === "cart_review") return tr
    ? "Rica ederim! Başka bir şey eklemek ister misiniz, yoksa sepetinize geçelim mi?"
    : "You’re welcome! Would you like to add anything else or review your cart?";
  if (stage === "recommending" || stage === "comparing") return tr
    ? "Rica ederim! Seçeneklerden birini karşılaştırabilir veya sepete ekleyebilirim."
    : "You’re welcome! I can compare an option or help add one to your cart.";
  return tr ? "Rica ederim! Menü veya siparişiniz için buradayım." : "You’re welcome! I’m here to help with the menu or your order.";
}

function noiseResponse(state: NoriConversationState) {
  const tr = state.preferredLanguage === "tr";
  if ((state.consecutiveNoiseCount ?? 0) >= 2) {
    return tr
      ? "Sizi hâlâ net duyamadım. Şunlardan birini seçebilirsiniz: yemek öner, sepeti göster, ödemeye geç veya alerjen sor."
      : "I still didn’t catch that. You can choose: recommend food, view cart, checkout, or ask about allergens.";
  }
  return tr
    ? "Sizi tam duyamadım. Lütfen tekrar söyler misiniz?"
    : "I didn’t catch that. Could you please say it again?";
}
