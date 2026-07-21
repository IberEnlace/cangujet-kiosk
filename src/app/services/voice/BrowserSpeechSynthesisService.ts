import type { NoriSpeechSynthesisService } from "./NoriSpeechSynthesisService";
export class BrowserSpeechSynthesisService implements NoriSpeechSynthesisService {
  isSupported() { return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window; }
  speak(text: string, language: string) { this.stop(); return new Promise<void>((resolve, reject) => { if (!this.isSupported()) { reject(new Error("unsupported")); return; } const utterance = new SpeechSynthesisUtterance(text); utterance.lang = language; utterance.onend = () => resolve(); utterance.onerror = () => reject(new Error("speech_error")); window.speechSynthesis.speak(utterance); }); }
  stop() { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); }
}
