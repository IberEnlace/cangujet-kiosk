export const SUPPORTED_LANGUAGE_CODES = ["en", "tr"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGE_CODES)[number];

export interface LanguageDefinition {
  code: SupportedLanguage;
  locale: "en-US" | "tr-TR";
  speechRecognitionLocale: "en-US" | "tr-TR";
  speechSynthesisLocale: "en-US" | "tr-TR";
  label: string;
  nativeLabel: string;
  direction: "ltr";
}

export const LANGUAGE_CONFIG: Readonly<Record<SupportedLanguage, LanguageDefinition>> = {
  en: {
    code: "en",
    locale: "en-US",
    speechRecognitionLocale: "en-US",
    speechSynthesisLocale: "en-US",
    label: "English",
    nativeLabel: "English",
    direction: "ltr",
  },
  tr: {
    code: "tr",
    locale: "tr-TR",
    speechRecognitionLocale: "tr-TR",
    speechSynthesisLocale: "tr-TR",
    label: "Turkish",
    nativeLabel: "Türkçe",
    direction: "ltr",
  },
};

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return value === "en" || value === "tr";
}

export function normalizeSupportedLanguage(
  value: unknown,
  fallback: SupportedLanguage = "en",
): SupportedLanguage {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLocaleLowerCase("en-US");
  if (normalized === "tr" || normalized === "tr-tr" || normalized === "turkish" || normalized === "türkçe") {
    return "tr";
  }
  if (normalized === "en" || normalized === "en-us" || normalized === "english") return "en";
  return fallback;
}

export function getLanguageDefinition(language: SupportedLanguage): LanguageDefinition {
  return LANGUAGE_CONFIG[language];
}

export function lowerForLanguage(value: string, language: SupportedLanguage): string {
  return value.toLocaleLowerCase(LANGUAGE_CONFIG[language].locale);
}

export function getNoriLanguageInstruction(language: SupportedLanguage): string {
  if (language === "tr") {
    return "Respond entirely in natural Turkish. Keep product names, brand names, ingredient names, and menu identifiers exactly as stored in the menu data unless a localized display name exists. Do not switch to English except for product names that are only available in English.";
  }
  return "Respond entirely in English.";
}

export function formatNumber(value: number, language: SupportedLanguage, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(LANGUAGE_CONFIG[language].locale, {
    maximumFractionDigits,
  }).format(value);
}
