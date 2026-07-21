import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getLanguageOption, isSupportedLanguage, type SupportedLanguage } from "../config/languages";
import { useDevice } from "./DeviceContext";

const LANGUAGE_STORAGE_KEY = "morrow_customer_language";

interface LanguageContextValue {
  language: SupportedLanguage;
  direction: "ltr" | "rtl";
  setLanguage: (language: SupportedLanguage) => void;
  resetLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function restoreLanguage(fallback: SupportedLanguage): SupportedLanguage {
  try {
    const stored = sessionStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupportedLanguage(stored) ? stored : fallback;
  } catch { return fallback; }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { config } = useDevice();
  const defaultLanguage = config?.settings.defaultLanguage ?? "en";
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

  useEffect(() => { if (config && !config.settings.enabledLanguages.includes(language)) setLanguage(defaultLanguage); }, [config, defaultLanguage, language, setLanguage]);

  useEffect(() => {
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
