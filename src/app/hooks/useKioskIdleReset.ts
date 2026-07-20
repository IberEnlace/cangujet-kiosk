import { useEffect, useRef } from "react";

interface UseKioskIdleResetOptions { timeoutMs: number; enabled?: boolean; onIdle: () => void; }

export function useKioskIdleReset({ timeoutMs, enabled = true, onIdle }: UseKioskIdleResetOptions) {
  const onIdleRef = useRef(onIdle);
  useEffect(() => { onIdleRef.current = onIdle; }, [onIdle]);
  useEffect(() => {
    if (!enabled) return;
    let timer = window.setTimeout(() => onIdleRef.current(), timeoutMs);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => onIdleRef.current(), timeoutMs);
    };
    const events: (keyof WindowEventMap)[] = ["pointerdown", "pointermove", "touchstart", "keydown"];
    events.forEach(event => window.addEventListener(event, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, reset));
    };
  }, [enabled, timeoutMs]);
}
