import type { NoriSpeechRecognitionResult, NoriSpeechRecognitionService } from "./NoriSpeechRecognitionService";

interface BrowserRecognitionAlternative { transcript: string; confidence: number; }
interface BrowserRecognitionResult { isFinal: boolean; readonly length: number; [index: number]: BrowserRecognitionAlternative; }
interface BrowserRecognitionResultList { readonly length: number; [index: number]: BrowserRecognitionResult; }
interface BrowserRecognitionEvent extends Event { results: BrowserRecognitionResultList; }
interface BrowserRecognitionErrorEvent extends Event { error: string; }
interface BrowserRecognition {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number;
  onresult: ((event: BrowserRecognitionEvent) => void) | null; onerror: ((event: BrowserRecognitionErrorEvent) => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
interface RecognitionConstructor { new(): BrowserRecognition; }
type SpeechWindow = Window & { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };

export class BrowserSpeechRecognitionService implements NoriSpeechRecognitionService {
  private recognition: BrowserRecognition | null = null;
  isSupported() { const scope = window as SpeechWindow; return Boolean(scope.SpeechRecognition ?? scope.webkitSpeechRecognition); }
  start(language: string): Promise<NoriSpeechRecognitionResult> {
    const scope = window as SpeechWindow; const Recognition = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
    if (!Recognition) return Promise.reject(new Error("unsupported"));
    this.cancel(); const recognition = new Recognition(); this.recognition = recognition;
    recognition.lang = language; recognition.continuous = false; recognition.interimResults = false; recognition.maxAlternatives = 1;
    return new Promise((resolve, reject) => {
      let settled = false;
      recognition.onresult = event => { const alternative = event.results[0]?.[0]; if (!alternative?.transcript.trim()) return; settled = true; resolve({ transcript: alternative.transcript.trim(), confidence: alternative.confidence }); };
      recognition.onerror = event => { settled = true; reject(new Error(event.error === "not-allowed" || event.error === "service-not-allowed" ? "permission_denied" : event.error === "no-speech" ? "no_speech" : "error")); };
      recognition.onend = () => { this.recognition = null; if (!settled) reject(new Error("no_speech")); };
      recognition.start();
    });
  }
  stop() { this.recognition?.stop(); }
  cancel() { this.recognition?.abort(); this.recognition = null; }
}
