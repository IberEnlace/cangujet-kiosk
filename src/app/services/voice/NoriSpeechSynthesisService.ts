export interface NoriSpeechSynthesisService { isSupported(): boolean; speak(text: string, language: string): Promise<void>; stop(): void; }
