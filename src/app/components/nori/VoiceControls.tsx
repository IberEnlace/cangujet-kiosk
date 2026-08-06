import { MessageSquareText, Pause, Play, Square, X } from "lucide-react";
import type { VoiceStatus } from "../../hooks/useNoriVoiceSession";
import type { NoriCopy } from "../../pages/nori/noriCopy";

const controlClass = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#ECECEC] bg-white px-4 text-sm font-semibold text-[#1F1F1F] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#C41E19]/25 hover:bg-[#F8F9FA] hover:shadow-md active:translate-y-0 active:scale-[.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#C41E19]/10 disabled:cursor-not-allowed disabled:opacity-40";

export function VoiceControls({ copy, status, canResume, onPause, onResume, onStopSpeaking, onEnd, onChat }: {
  copy: NoriCopy;
  status: VoiceStatus;
  canResume: boolean;
  onPause: () => void;
  onResume: () => void;
  onStopSpeaking: () => void;
  onEnd: () => void;
  onChat: () => void;
}) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {status === "listening" && <button type="button" onClick={onPause} aria-label={copy.pauseListening} className={controlClass}><Pause size={17} aria-hidden="true" />{copy.pauseListening}</button>}
      {(status === "paused" || (status === "error" && canResume)) && <button type="button" onClick={onResume} aria-label={copy.resumeListening} className={controlClass}><Play size={17} aria-hidden="true" />{copy.resumeListening}</button>}
      {status === "speaking" && <button type="button" onClick={onStopSpeaking} aria-label={copy.stopSpeaking} className={controlClass}><Square size={16} aria-hidden="true" />{copy.stopSpeaking}</button>}
      {status !== "idle" && <button type="button" onClick={onEnd} aria-label={copy.endVoice} className={controlClass}><X size={17} aria-hidden="true" />{copy.endVoice}</button>}
      <button type="button" onClick={onChat} aria-label={copy.switchText} className={controlClass}><MessageSquareText size={17} aria-hidden="true" />{copy.switchText}</button>
    </div>
  );
}
