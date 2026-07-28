import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getLanguageOption, normalizeSupportedLanguage, type SupportedLanguage } from "../config/languages";
import { useDevice } from "./DeviceContext";

const LANGUAGE_STORAGE_KEY = "morrow_customer_language";

interface LanguageContextValue {
  language: SupportedLanguage;
  direction: "ltr";
  setLanguage: (language: SupportedLanguage) => void;
  resetLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function restoreLanguage(fallback: SupportedLanguage): SupportedLanguage {
  try {
    const stored = sessionStorage.getItem(LANGUAGE_STORAGE_KEY);
    const restored = normalizeSupportedLanguage(stored, fallback);
    if (stored !== null && stored !== restored) sessionStorage.setItem(LANGUAGE_STORAGE_KEY, restored);
    return restored;
  } catch { return fallback; }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { config } = useDevice();
  const defaultLanguage = normalizeSupportedLanguage(config?.settings.defaultLanguage);
  const [language, setLanguageState] = useState<SupportedLanguage>(() => restoreLanguage(defaultLanguage));
  const direction = getLanguageOption(language).direction;

  const setLanguage = useCallback((nextLanguage: SupportedLanguage) => {
    setLanguageState(nextLanguage);
    try { sessionStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage); } catch { /* Storage may be disabled in kiosk privacy mode. */ }
  }, []);

  const resetLanguage = useCallback(() => {
    setLanguageState(defaultLanguage);
    try { sessionStorage.removeItem(LANGUAGE_STORAGE_KEY); } catch { /* Storage may be disabled in kiosk privacy mode. */ }
  }, [defaultLanguage]);

  useEffect(() => {
    if (!config) return;
    const enabledLanguages = config.settings.enabledLanguages.map(value => normalizeSupportedLanguage(value));
    if (!enabledLanguages.includes(language)) setLanguage(defaultLanguage);
  }, [config, defaultLanguage, language, setLanguage]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
    document.documentElement.dir = direction;
  }, [direction, language]);

  const value = useMemo(() => ({ language, direction, setLanguage, resetLanguage }), [direction, language, resetLanguage, setLanguage]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
