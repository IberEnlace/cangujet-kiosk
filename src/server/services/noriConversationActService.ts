import type {
  NoriConversationAct,
  NoriConversationState,
  NoriLanguage,
} from "../types/noriChat";
import { extractNoriUnderstanding, normalizeNoriText } from "./noriUnderstandingService";

export type NoriConversationActAnalysis = {
  acts: NoriConversationAct[];
  normalizedInput: string;
  isNoise: boolean;
  hasRestaurantMeaning: boolean;
  hasBusinessCommand: boolean;
  asksPersonalChoice: boolean;
};

const FILLERS = new Set([
  "ah", "er", "erm", "huh", "mm", "mmm", "uh", "uhh", "um",
  "eee", "ıı", "ııı", "şey",
]);

export function detectNoriConversationActs(
  input: string,
  language: NoriLanguage,
  state?: NoriConversationState,
): NoriConversationActAnalysis {
  const text = normalizeNoriText(input, language).replace(/\s+/g, " ").trim();
  const signals = extractNoriUnderstanding(input, language, state);
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  const repeatedFragment = words.length >= 4
    && new Set(words).size <= Math.max(1, Math.floor(words.length / 3));
  const isNoise = !text
    || words.length === 0
    || (words.length === 1 && (words[0].length === 1 || FILLERS.has(words[0])))
    || repeatedFragment
    || words.every(word => FILLERS.has(word));
  const acts: NoriConversationAct[] = [];
  const add = (act: NoriConversationAct, matched: boolean) => {
    if (matched && !acts.includes(act)) acts.push(act);
  };

  add("empty_or_noise_input", isNoise);
  if (!isNoise) {
    add("greeting", /^(?:hello|hi|hey|good (?:morning|afternoon|evening)|how are you|merhaba|selam(?:lar)?|günaydın|iyi (?:günler|akşamlar)|kolay gelsin|nasılsın)(?:\b|[,.!?])/u.test(text));
    add("introduction", /\b(?:who are you|what are you|sen kimsin|nori nedir)\b/u.test(text));
    add("ask_capabilities", /\b(?:what can you do|how can you help|what do you help with|ne yapabilirsin|nasıl yardımcı olabilirsin)\b/u.test(text));
    add("request_help", /\b(?:help me|help me choose|yardım(?:cı)? ol|yardım eder misin)\b/u.test(text));
    add("general_recommendation", signals.impliesRecommendation
      || /(?:what (?:do|would) you recommend|what should i (?:eat|order)|what would you choose|recommend something|what is good here|pick something|help me choose|surprise me|ne önerirsin|ne yemeliyim|bir şey öner|bugün ne yesem|ne alayım|güzel bir şey seç|bana yardımcı olur musun|sen olsan ne yerdin)/u.test(text));
    add("indecision", /\b(?:i (?:cannot|can't) decide|i do not know|i don't know|i am not sure|anything is fine|i do not mind|you choose|surprise me|bilmiyorum|emin değilim|karar veremedim|karar veremiyorum|kararsızım|fark etmez|sen seç|bana uyar|ne alsam)\b/u.test(text));
    add("hesitation", /^(?:h+m+|maybe|belki|sanırım)(?:\b|[,.!?])/u.test(text));
    add("gratitude", /\b(?:thanks|thank you|that helps|teşekkür(?:ler| ederim)?|sağ ol)\b/u.test(text)
      || text.includes("çok yardımcı oldun"));
    add("praise", /\b(?:great|perfect|awesome|excellent|harika|süper|mükemmel|çok güzel)\b/u.test(text));
    add("acknowledgement", /^(?:okay|ok|got it|sounds good|all right|tamam(?:dır)?|anladım|güzel)(?:\b|[,.!?])/u.test(text));
    add("complaint", /\b(?:this is bad|not right for me|too expensive|too many calories|too spicy|bu kötü|bana uygun değil|çok pahalı|çok kalorili|fazla acı)\b/u.test(text));
    add("rejection", /^(?:no|no thanks|hayır|hayır teşekkürler)\b/u.test(text)
      || /\b(?:i do not want (?:it|that|this)|i don't want (?:it|that|this)|not this one|something else|bunu istemiyorum|bu olmasın|başka bir şey|bunu sevmedim)\b/u.test(text));
    add("correction", /\b(?:you misunderstood|that is not what i meant|i said something else|yanlış anladın|onu demedim|başka bir şey söyledim)\b/u.test(text));
    add("misunderstanding", /\b(?:i did not understand|i didn't understand|what do you mean|anlamadım|ne demek istedin|duymadım)\b/u.test(text));
    add("request_repetition", /\b(?:repeat|say (?:it|that) again|i did not hear|i didn't hear|tekrar söyle|tekrar söyler misin|bir daha söyle|duymadım)\b/u.test(text));
    add("request_simplification", /\b(?:more simply|simpler|daha basit)\b/u.test(text));
    add("confirmation", /^(?:yes|confirm|sure|do it|evet|onaylıyorum)(?:\b|[,.!?])/u.test(text));
    add("cancellation", /\b(?:cancel|never mind|do not add|don't add|iptal et|vazgeçtim|ekleme)\b/u.test(text));
    add("change_mind", /\b(?:i changed my mind|start over|forget (?:the )?(?:previous|those) options|show me something different|fikrimi değiştirdim|baştan başlayalım|daha farklı bir şey göster)\b/u.test(text)
      || text.includes("öncekileri unut"));
    add("pause_request", /\b(?:wait|hold on|one moment|pause|bir dakika|bekle|dur)\b/u.test(text));
    add("resume_conversation", /\b(?:continue|resume|go on|devam et|devam edelim)\b/u.test(text));
    add("checkout_transition", /\b(?:checkout|check out|pay now|let us pay|let's pay)\b/u.test(text)
      || text.includes("ödemeye geç")
      || text.includes("siparişi tamamla"));
    add("farewell", /\b(?:goodbye|bye|see you|that is all|that's all|i am done|i'm done|nothing else|that will be all|görüşürüz|hoşça kal|bay bay|bu kadar|hepsi bu|başka bir şey istemiyorum|siparişim tamam|bitti)\b/u.test(text));
    add("abusive_or_inappropriate_language", /\b(?:idiot|stupid|moron|aptal|salak|gerizekalı)\b/u.test(text));
  }

  const hasBusinessCommand = signals.restaurantMeaning
    || signals.addCommand
    || acts.includes("general_recommendation")
    || acts.includes("indecision")
    || /\b(?:cart|sepet|checkout|ödem|allerg|alerjen|içeriyor|contains|remove|çıkar|customi[sz]|özelleştir|compare|karşılaştır)\b/u.test(text);
  add("unrelated_request", !isNoise && !hasBusinessCommand && looksUnrelated(text));

  return {
    acts,
    normalizedInput: text,
    isNoise,
    hasRestaurantMeaning: signals.restaurantMeaning || acts.includes("general_recommendation"),
    hasBusinessCommand,
    asksPersonalChoice: /\b(?:what would you choose|your favorite|sen olsan ne yerdin|favorin ne)\b/u.test(text),
  };
}

export function primaryConversationAct(acts: NoriConversationAct[]): NoriConversationAct | null {
  const priority: NoriConversationAct[] = [
    "empty_or_noise_input",
    "abusive_or_inappropriate_language",
    "correction",
    "cancellation",
    "request_simplification",
    "request_repetition",
    "misunderstanding",
    "checkout_transition",
    "change_mind",
    "rejection",
    "farewell",
    "ask_capabilities",
    "introduction",
    "request_help",
    "indecision",
    "general_recommendation",
    "gratitude",
    "praise",
    "acknowledgement",
    "greeting",
    "pause_request",
    "resume_conversation",
    "unrelated_request",
  ];
  return priority.find(act => acts.includes(act)) ?? null;
}

function looksUnrelated(text: string) {
  return /\b(?:write code|debug code|javascript|python|politics|president|election|weather|capital of|relationship advice|stock price|news today)\b/u.test(text);
}
