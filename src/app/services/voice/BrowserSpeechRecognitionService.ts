import type { NoriSpeechRecognitionResult, NoriSpeechRecognitionService } from "./NoriSpeechRecognitionService";

interface ActiveRecognition {
  recognition: SpeechRecognition;
  cancel: () => void;
}

function RecognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function detach(recognition: SpeechRecognition) {
  recognition.onstart = null;
  recognition.onresult = null;
  recognition.onnomatch = null;
  recognition.onerror = null;
  recognition.onend = null;
}

export class BrowserSpeechRecognitionService implements NoriSpeechRecognitionService {
  private active: ActiveRecognition | null = null;

  isSupported() {
    return Boolean(RecognitionConstructor());
  }

  start(language: string): Promise<NoriSpeechRecognitionResult> {
    const Recognition = RecognitionConstructor();
    if (!Recognition) return Promise.reject(new Error("unsupported"));
    if (this.active) return Promise.reject(new Error("already_active"));

    const recognition = new Recognition();
    recognition.lang = language;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    return new Promise((resolve, reject) => {
      let settled = false;
      let result: NoriSpeechRecognitionResult | null = null;
      const isCurrent = () => this.active?.recognition === recognition;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (isCurrent()) this.active = null;
        detach(recognition);
        if (error) reject(error);
        else if (result) resolve(result);
        else reject(new Error("no_speech"));
      };
      const cancel = () => {
        finish(new Error("aborted"));
        try {
          recognition.abort();
        } catch {
          // The native operation may already have closed.
        }
      };

      this.active = { recognition, cancel };
      recognition.onresult = event => {
        if (!isCurrent() || settled) return;
        const alternative = event.results[0]?.[0];
        const transcript = alternative?.transcript.trim();
        if (!transcript) return;
        result = { transcript, confidence: alternative.confidence };
        try {
          recognition.stop();
        } catch {
          finish();
        }
      };
      recognition.onnomatch = () => {
        if (!isCurrent()) return;
        try {
          recognition.stop();
        } catch {
          finish(new Error("no_speech"));
        }
      };
      recognition.onerror = event => {
        if (!isCurrent()) return;
        const code = event.error === "not-allowed"
          ? "permission_denied"
          : event.error === "service-not-allowed"
            ? "service_unavailable"
          : event.error === "audio-capture"
            ? "microphone_not_found"
            : event.error === "no-speech"
              ? "no_speech"
              : event.error === "network"
                ? "network"
                : event.error === "aborted"
                  ? "aborted"
                  : "error";
        finish(new Error(code));
      };
      recognition.onend = () => {
        if (isCurrent()) finish();
      };
      try {
        recognition.start();
      } catch {
        finish(new Error("error"));
      }
    });
  }

  stop() {
    try {
      this.active?.recognition.stop();
    } catch {
      // The native operation may already have closed.
    }
  }

  cancel() {
    this.active?.cancel();
  }
}
