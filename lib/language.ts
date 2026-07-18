export interface LanguageConfig {
  code: string;
  name: string;
  nativeName: string;
  bcp47: { stt: string; tts: string };
  azureVoice: string;
  hasRomaji: boolean;
}

export const TARGET_LANGUAGES: LanguageConfig[] = [
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    bcp47: { stt: 'ja-JP', tts: 'ja-JP' },
    azureVoice: 'ja-JP-NanamiNeural',
    hasRomaji: true,
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    bcp47: { stt: 'en-US', tts: 'en-US' },
    azureVoice: 'en-US-JennyNeural',
    hasRomaji: false,
  },
];

export const NATIVE_LANGUAGES: { code: string; name: string; nativeName: string }[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'lg', name: 'Luganda', nativeName: 'Luganda' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
];

export function getTargetLangConfig(code: string): LanguageConfig {
  return TARGET_LANGUAGES.find(l => l.code === code) ?? TARGET_LANGUAGES[0];
}

export function getNativeLangName(code: string): string {
  return NATIVE_LANGUAGES.find(l => l.code === code)?.name ?? code;
}

export function getBCP47(code: string, type: 'stt' | 'tts'): string {
  return getTargetLangConfig(code).bcp47[type];
}

export function getAzureVoice(code: string): string {
  return getTargetLangConfig(code).azureVoice;
}
