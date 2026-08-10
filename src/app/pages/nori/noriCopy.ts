import type { SupportedLanguage } from "../../config/languages";
import type { VoiceStatus } from "../../hooks/useNoriVoiceSession";

export interface NoriCopy {
  title: string;
  description: string;
  chat: string;
  chatDescription: string;
  typeMessage: string;
  startChat: string;
  voice: string;
  voiceDescription: string;
  startVoice: string;
  back: string;
  end: string;
  switchText: string;
  switchVoice: string;
  privacy: string;
  voiceResponses: string;
  tap: string;
  permission: string;
  listening: string;
  processing: string;
  thinking: string;
  speaking: string;
  paused: string;
  voiceAttention: string;
  noSpeech: string;
  denied: string;
  microphoneNotFound: string;
  networkError: string;
  unsupported: string;
  voiceUnavailable: string;
  insecureContext: string;
  error: string;
  responseError: string;
  playbackError: string;
  heard: string;
  send: string;
  sendAria: string;
  tryAgain: string;
  pauseListening: string;
  resumeListening: string;
  stopSpeaking: string;
  endVoice: string;
  modeAria: string;
  conversationBadge: string;
  listeningHint: string;
  speakingHint: string;
  processingHint: string;
  idleHint: string;
  liveTranscript: string;
  listeningPlaceholder: string;
  youSaid: string;
  interruptAria: string;
  clearConversation: string;
  addToCart: string;
  confirm: string;
  cancel: string;
  continueToCheckout: string;
}

export const noriCopy: Record<SupportedLanguage, NoriCopy> = {
  en: {
    title: "How would you like to talk to Nori?",
    description: "Choose how you would like help finding your meal.",
    chat: "Chat",
    chatDescription: "Type your questions and receive recommendations.",
    typeMessage: "Type a message",
    startChat: "Start Chat",
    voice: "Voice",
    voiceDescription: "Speak naturally and hear Nori’s response.",
    startVoice: "Start Voice Session",
    back: "Back",
    end: "End Conversation",
    switchText: "Switch to Chat",
    switchVoice: "Voice mode",
    privacy: "Your speech is processed only to understand this conversation. Audio is not stored by cangujet.",
    voiceResponses: "Voice responses",
    tap: "Tap to start",
    permission: "Requesting microphone access",
    listening: "Listening",
    processing: "Processing",
    thinking: "Nori is thinking…",
    speaking: "Nori is speaking",
    paused: "Paused",
    voiceAttention: "Voice needs attention",
    noSpeech: "No speech was detected. Please try again.",
    denied: "Microphone access was denied. Allow access in your browser settings or continue using chat.",
    microphoneNotFound: "No microphone was found. Connect a microphone or continue using chat.",
    networkError: "Voice recognition could not connect. Check the connection and try again.",
    unsupported: "Voice recognition is not supported in this browser. You can continue using chat.",
    voiceUnavailable: "A suitable voice is not available for the selected language. Nori’s reply remains visible on screen.",
    insecureContext: "Voice mode requires a secure HTTPS connection or localhost.",
    error: "Voice recognition stopped unexpectedly. Please try again.",
    responseError: "Nori could not respond right now. Please try again.",
    playbackError: "Nori’s voice could not be played. The response is still available on screen.",
    heard: "I heard:",
    send: "Send",
    sendAria: "Send message to Nori",
    tryAgain: "Try again",
    pauseListening: "Pause Listening",
    resumeListening: "Resume Listening",
    stopSpeaking: "Stop Speaking",
    endVoice: "End Voice Session",
    modeAria: "Nori conversation mode",
    conversationBadge: "Nori voice conversation",
    listeningHint: "Speak naturally. I’ll respond when you finish.",
    speakingHint: "Tap the microphone to interrupt.",
    processingHint: "Your request is going through the same Nori assistant and cart.",
    idleHint: "A hands-free conversation with automatic turn-taking.",
    liveTranscript: "Live transcript",
    listeningPlaceholder: "Listening for your voice…",
    youSaid: "You said",
    interruptAria: "Interrupt Nori and start listening",
    clearConversation: "Clear conversation",
    addToCart: "Add to cart",
    confirm: "Confirm",
    cancel: "Cancel",
    continueToCheckout: "Continue to checkout",
  },
  tr: {
    title: "Nori ile nasıl konuşmak istersiniz?",
    description: "Yemeğinizi bulmak için nasıl yardım almak istediğinizi seçin.",
    chat: "Sohbet",
    chatDescription: "Sorularınızı yazın ve öneriler alın.",
    typeMessage: "Mesajınızı yazın",
    startChat: "Sohbeti Başlat",
    voice: "Sesli",
    voiceDescription: "Doğal biçimde konuşun ve Nori’nin yanıtını dinleyin.",
    startVoice: "Sesli Görüşmeyi Başlat",
    back: "Geri",
    end: "Görüşmeyi Bitir",
    switchText: "Sohbete Geç",
    switchVoice: "Sesli mod",
    privacy: "Konuşmanız yalnızca bu görüşmeyi anlamak için işlenir. Ses cangujet tarafından saklanmaz.",
    voiceResponses: "Sesli yanıtlar",
    tap: "Başlamak için dokunun",
    permission: "Mikrofon erişimi isteniyor",
    listening: "Dinliyorum",
    processing: "İşleniyor",
    thinking: "Nori düşünüyor…",
    speaking: "Nori konuşuyor",
    paused: "Duraklatıldı",
    voiceAttention: "Sesli görüşme için işlem gerekli",
    noSpeech: "Konuşma algılanmadı. Lütfen tekrar deneyin.",
    denied: "Mikrofon erişimi reddedildi. Tarayıcı ayarlarından izin verin veya sohbeti kullanın.",
    microphoneNotFound: "Mikrofon bulunamadı. Bir mikrofon bağlayın veya sohbeti kullanın.",
    networkError: "Ses tanıma hizmetine bağlanılamadı. Bağlantıyı kontrol edip tekrar deneyin.",
    unsupported: "Bu tarayıcı ses tanımayı desteklemiyor. Sohbeti kullanmaya devam edebilirsiniz.",
    voiceUnavailable: "Seçili dil için uygun bir ses bulunamadı. Nori’nin yanıtı ekranda görünmeye devam eder.",
    insecureContext: "Sesli mod için güvenli bir HTTPS bağlantısı veya localhost gerekir.",
    error: "Ses tanıma beklenmedik biçimde durdu. Lütfen tekrar deneyin.",
    responseError: "Nori şu anda yanıt veremiyor. Lütfen tekrar deneyin.",
    playbackError: "Nori’nin sesi oynatılamadı. Yanıt ekranda görünmeye devam eder.",
    heard: "Duyduğum:",
    send: "Gönder",
    sendAria: "Nori’ye mesaj gönder",
    tryAgain: "Tekrar deneyin",
    pauseListening: "Dinlemeyi Duraklat",
    resumeListening: "Dinlemeye Devam Et",
    stopSpeaking: "Konuşmayı Durdur",
    endVoice: "Sesli Görüşmeyi Bitir",
    modeAria: "Nori görüşme modu",
    conversationBadge: "Nori ile sesli görüşme",
    listeningHint: "Doğal biçimde konuşun. Bitirdiğinizde yanıt vereceğim.",
    speakingHint: "Araya girmek için mikrofona dokunun.",
    processingHint: "İsteğiniz aynı Nori asistanı ve sepet akışıyla işleniyor.",
    idleHint: "Otomatik konuşma sıralı, eller serbest görüşme.",
    liveTranscript: "Canlı konuşma metni",
    listeningPlaceholder: "Sesiniz dinleniyor…",
    youSaid: "Söylediğiniz",
    interruptAria: "Nori’yi durdur ve dinlemeye başla",
    clearConversation: "Görüşmeyi Temizle",
    addToCart: "Sepete Ekle",
    confirm: "Onayla",
    cancel: "İptal",
    continueToCheckout: "Ödemeye Devam Et",
  },
};

export function voiceStatusLabel(copy: NoriCopy, status: VoiceStatus): string {
  if (status === "idle") return copy.tap;
  if (status === "requesting-permission") return copy.permission;
  if (status === "listening") return copy.listening;
  if (status === "processing") return copy.processing;
  if (status === "speaking") return copy.speaking;
  if (status === "paused") return copy.paused;
  return copy.voiceAttention;
}
