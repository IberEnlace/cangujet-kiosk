export type VoiceRecognitionStatus = "idle" | "requesting_permission" | "listening" | "processing" | "unsupported" | "permission_denied" | "no_speech" | "error";
export interface NoriSpeechRecognitionResult { transcript: string; confidence?: number; }
export interface NoriSpeechRecognitionService { isSupported(): boolean; start(language: string): Promise<NoriSpeechRecognitionResult>; stop(): void; cancel(): void; }
