import type { NoriLanguage } from "../types/noriChat";
import type { NoriSpeechRate } from "../../shared/noriSpeech";

export type NoriSpeechPreferenceCommand = {
  rate: NoriSpeechRate;
  repeat: boolean;
};

export function detectNoriSpeechPreferenceCommand(
  message: string,
  language: NoriLanguage,
): NoriSpeechPreferenceCommand | null {
  const locale = language === "tr" ? "tr-TR" : "en-US";
  const text = message.normalize("NFC").toLocaleLowerCase(locale).replace(/[!?.,]+/g, " ").replace(/\s+/g, " ").trim();
  const includesAny = (phrases: string[]) => phrases.some(phrase => text.includes(phrase));
  const repeat = includesAny(["tekrar", "bir daha", "again", "repeat"]);
  if (includesAny(["normal konuş", "normal hızda konuş", "speak normally", "normal speed"])) {
    return { rate: "normal", repeat };
  }
  if (includesAny([
    "daha yavaş konuş", "yavaş konuşur musun", "çok hızlı konuşuyorsun", "biraz yavaş",
    "yavaşça söyle", "speak more slowly", "slow down", "you are speaking too fast",
    "a little slower", "more slowly",
  ])) {
    return { rate: "slow", repeat };
  }
  if (includesAny(["daha hızlı konuş", "hızlı söyle", "speak faster", "speed up"])) {
    return { rate: "fast", repeat };
  }
  return null;
}

export function speechPreferenceConfirmation(rate: NoriSpeechRate, language: NoriLanguage) {
  if (language === "tr") {
    if (rate === "slow") return "Elbette, daha yavaş konuşacağım.";
    if (rate === "fast") return "Elbette, daha hızlı konuşacağım.";
    return "Elbette, normal hızda konuşacağım.";
  }
  if (rate === "slow") return "Of course. I’ll speak more slowly.";
  if (rate === "fast") return "Of course. I’ll speak faster.";
  return "Of course. I’ll speak at a normal pace.";
}
