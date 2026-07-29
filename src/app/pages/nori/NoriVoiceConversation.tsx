import { ArrowLeft, Sparkles, X } from "lucide-react";
import { NoriVoiceMode } from "../../components/nori/NoriVoiceMode";
import { useLanguage } from "../../context/LanguageContext";
import { useNoriConversation } from "../../context/NoriConversationContext";
import { useNoriVoiceSession } from "../../hooks/useNoriVoiceSession";
import { noriCopy } from "./noriCopy";

export default function NoriVoiceConversation({ onBack, onText, onEnd }: {
  onBack: () => void;
  onText: () => void;
  onEnd: () => void;
}) {
  const { language, direction } = useLanguage();
  const { messages, sendMessage, reportTtsInterrupted } = useNoriConversation();
  const text = noriCopy[language];
  const voice = useNoriVoiceSession({
    language,
    copy: text,
    sendMessage,
    onSpeechInterrupted: reportTtsInterrupted,
  });
  const latestNoriResponse = [...messages].reverse().find(message => message.sender === "nori")?.text ?? "";

  const leave = (action: () => void) => {
    voice.endSession();
    action();
  };

  return (
    <main dir={direction} className="flex min-h-[100dvh] min-w-0 flex-col overflow-x-hidden bg-[#0B0D0A] font-['DM_Sans'] text-white">
      <header className="flex items-center gap-3 border-b border-white/8 px-4 py-3 sm:px-7 sm:py-5">
        <button type="button" onClick={() => leave(onBack)} aria-label={text.back} className="grid size-11 place-items-center rounded-xl border border-white/8 bg-white/5 transition hover:bg-white/8 focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#D7FB69]/70">
          <ArrowLeft aria-hidden="true" />
        </button>
        <span className="grid size-11 place-items-center rounded-xl border border-[#D7FB69]/15 bg-[#D7FB69]/10 text-[#D7FB69]"><Sparkles aria-hidden="true" /></span>
        <div>
          <h1 className="font-bold">Nori AI</h1>
          <p className="text-xs text-white/40">{text.voice}</p>
        </div>
        <button type="button" onClick={() => leave(onEnd)} aria-label={text.end} className="ms-auto grid size-11 place-items-center rounded-xl border border-white/8 bg-white/5 transition hover:bg-white/8 focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#D7FB69]/70">
          <X aria-hidden="true" />
        </button>
      </header>
      <NoriVoiceMode
        copy={text}
        status={voice.status}
        interimTranscript={voice.interimTranscript}
        lastTranscript={voice.lastTranscript}
        currentResponse={voice.currentResponse || latestNoriResponse}
        errorMessage={voice.errorMessage}
        canResume={voice.canResume}
        onStart={() => void voice.startSession()}
        onPause={voice.pause}
        onResume={voice.resume}
        onInterrupt={voice.interrupt}
        onStopSpeaking={voice.stopSpeaking}
        onEnd={voice.endSession}
        onChat={() => leave(onText)}
      />
    </main>
  );
}
