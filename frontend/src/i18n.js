export const LANGUAGES = {
  en: { short: 'EN', label: 'English', flag: '🇬🇧' },
  uz: { short: 'UZ', label: "O'zbek", flag: '🇺🇿' },
  de: { short: 'DE', label: 'Deutsch', flag: '🇩🇪' },
  ru: { short: 'RU', label: 'Русский', flag: '🇷🇺' },
}

const translations = {
  en: {
    repositoryIntelligence: 'Repository Intelligence',
    analysisEngine: 'Analysis engine',
  },

  uz: {
    repositoryIntelligence: 'Repozitoriy tahlili',
    analysisEngine: 'Tahlil tizimi',
  },

  de: {
    repositoryIntelligence: 'Repository-Intelligenz',
    analysisEngine: 'Analyse-System',
  },

  ru: {
    repositoryIntelligence: 'Анализ репозитория',
    analysisEngine: 'Система анализа',
  },
}

export function translate(language, key) {
  return (
    translations[language]?.[key] ??
    translations.en[key] ??
    key
  )
}
