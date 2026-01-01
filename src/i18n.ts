import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en/translation.json';
import zh from './locales/zh/translation.json';
import ja from './locales/ja/translation.json';

const applyDocumentLanguage = (lang?: string) => {
  if (typeof document === 'undefined') {
    return;
  }
  const normalized = (lang || 'en').split('-')[0];
  document.documentElement.lang = normalized;
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: en
      },
      zh: {
        translation: zh
      },
      ja: {
        translation: ja
      }
    },
    fallbackLng: 'en',
    debug: import.meta.env.DEV,
    
    interpolation: {
      escapeValue: false // not needed for react as it escapes by default
    }
  })
  .then(() => applyDocumentLanguage(i18n.resolvedLanguage || i18n.language))
  .catch(() => applyDocumentLanguage(i18n.language));

i18n.on('languageChanged', applyDocumentLanguage);

export default i18n;
