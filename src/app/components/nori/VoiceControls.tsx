import { MessageSquareText, Pause, Play, Square, X } from "lucide-react";
import type { VoiceStatus } from "../../hooks/useNoriVoiceSession";
import type { NoriCopy } from "../../pages/nori/noriCopy";

const controlClass = "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white/80 transition hover:border-white/20 hover:bg-white/8 focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#D7FB69]/70 disabled:cursor-not-allowed disabled:opacity-35";

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
