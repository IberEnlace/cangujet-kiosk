export type SupportedLanguage = "en" | "tr" | "ar";

export interface LanguageOption {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  direction: "ltr" | "rtl";
  speechLocale: string;
}

export const supportedLanguages: readonly LanguageOption[] = [
  { code: "en", name: "English", nativeName: "English", direction: "ltr", speechLocale: "en-US" },
  { code: "tr", name: "Turkish", nativeName: "Türkçe", direction: "ltr", speechLocale: "tr-TR" },
  { code: "ar", name: "Arabic", nativeName: "العربية", direction: "rtl", speechLocale: "ar-SA" },
] as const;

export function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return supportedLanguages.some(language => language.code === value);
}

export function getLanguageOption(code: SupportedLanguage): LanguageOption {
  return supportedLanguages.find(language => language.code === code) ?? supportedLanguages[0];
}
