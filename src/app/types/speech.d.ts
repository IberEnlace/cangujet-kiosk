interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error:
    | "aborted"
    | "audio-capture"
    | "bad-grammar"
    | "language-not-supported"
    | "network"
    | "no-speech"
    | "not-allowed"
    | "phrases-not-supported"
    | "service-not-allowed";
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  grammars: unknown;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onaudioend: ((this: SpeechRecognition, event: Event) => void) | null;
  onaudiostart: ((this: SpeechRecognition, event: Event) => void) | null;
  onend: ((this: SpeechRecognition, event: Event) => void) | null;
  onerror: ((this: SpeechRecognition, event: SpeechRecognitionErrorEvent) => void) | null;
  onnomatch: ((this: SpeechRecognition, event: SpeechRecognitionEvent) => void) | null;
  onresult: ((this: SpeechRecognition, event: SpeechRecognitionEvent) => void) | null;
  onsoundend: ((this: SpeechRecognition, event: Event) => void) | null;
  onsoundstart: ((this: SpeechRecognition, event: Event) => void) | null;
  onspeechend: ((this: SpeechRecognition, event: Event) => void) | null;
  onspeechstart: ((this: SpeechRecognition, event: Event) => void) | null;
  onstart: ((this: SpeechRecognition, event: Event) => void) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
