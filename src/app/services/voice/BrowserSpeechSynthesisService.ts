import type { NoriSpeechSynthesisService } from "./NoriSpeechSynthesisService";
import { toSpeakableText } from "./speakableText";
import { selectSpeechVoice } from "./speechVoiceSelection";

export class BrowserSpeechSynthesisService implements NoriSpeechSynthesisService {
  private utterance: SpeechSynthesisUtterance | null = null;
  private settle: (() => void) | null = null;

  isSupported() {
    return typeof window !== "undefined"
      && "speechSynthesis" in window
      && typeof SpeechSynthesisUtterance !== "undefined";
  }

  speak(text: string, language: string) {
    this.stop();
    if (!this.isSupported()) return Promise.reject(new Error("unsupported"));
    const speakableText = toSpeakableText(text, language);
    if (!speakableText) return Promise.resolve();

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const utterance = new SpeechSynthesisUtterance(speakableText);
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        utterance.onend = null;
        utterance.onerror = null;
        if (this.utterance === utterance) {
          this.utterance = null;
          this.settle = null;
        }
        if (error) reject(error);
        else resolve();
      };
      this.utterance = utterance;
      this.settle = () => finish();
      utterance.lang = language;
      utterance.voice = selectSpeechVoice(window.speechSynthesis.getVoices(), language) ?? null;
      utterance.rate = 0.96;
      utterance.pitch = 1;
      utterance.volume = 1;
      utterance.onend = () => {
        if (this.utterance === utterance) finish();
      };
      utterance.onerror = event => {
        if (this.utterance !== utterance) return;
        if (event.error === "canceled" || event.error === "interrupted") finish();
        else finish(new Error("speech_error"));
      };
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        finish(new Error("speech_error"));
      }
    });
  }

  stop() {
    this.settle?.();
    this.settle = null;
    this.utterance = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }
}
