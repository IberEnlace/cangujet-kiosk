import {
  LANGUAGE_CONFIG,
  SUPPORTED_LANGUAGE_CODES,
  getLanguageDefinition,
  isSupportedLanguage,
  normalizeSupportedLanguage,
  type SupportedLanguage,
} from "../../shared/languages";

export interface LanguageOption {
  code: SupportedLanguage;
  name: string;
  nativeName: string;
  direction: "ltr";
  speechLocale: string;
}

export const supportedLanguages: readonly LanguageOption[] = SUPPORTED_LANGUAGE_CODES.map(code => ({
  code,
  name: LANGUAGE_CONFIG[code].label,
  nativeName: LANGUAGE_CONFIG[code].nativeLabel,
  direction: LANGUAGE_CONFIG[code].direction,
  speechLocale: LANGUAGE_CONFIG[code].speechRecognitionLocale,
}));

export function getLanguageOption(code: SupportedLanguage): LanguageOption {
  const language = getLanguageDefinition(code);
  return {
    code: language.code,
    name: language.label,
    nativeName: language.nativeLabel,
    direction: language.direction,
    speechLocale: language.speechRecognitionLocale,
  };
}

export {
  LANGUAGE_CONFIG,
  SUPPORTED_LANGUAGE_CODES,
  getLanguageDefinition,
  isSupportedLanguage,
  normalizeSupportedLanguage,
};
export type { SupportedLanguage };
