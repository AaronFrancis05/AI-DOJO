export interface LanguageConfig {
  code: string;
  name: string;
  nativeName: string;
  bcp47: { stt: string; tts: string };
  azureVoice: { female: string; male: string };
  hasRomaji: boolean;
  ttsSupported: boolean;
}

export const TARGET_LANGUAGES: LanguageConfig[] = [
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    bcp47: { stt: 'ja-JP', tts: 'ja-JP' },
    azureVoice: { female: 'ja-JP-NanamiNeural', male: 'ja-JP-KeitaNeural' },
    hasRomaji: true,
    ttsSupported: true,
  },
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    bcp47: { stt: 'en-US', tts: 'en-US' },
    azureVoice: { female: 'en-US-JennyNeural', male: 'en-US-GuyNeural' },
    hasRomaji: false,
    ttsSupported: true,
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    bcp47: { stt: 'fr-FR', tts: 'fr-FR' },
    azureVoice: { female: 'fr-FR-DeniseNeural', male: 'fr-FR-HenriNeural' },
    hasRomaji: false,
    ttsSupported: true,
  },
  {
    code: 'lg',
    name: 'Luganda',
    nativeName: 'Luganda',
    bcp47: { stt: 'en-US', tts: 'en-US' },
    azureVoice: { female: 'en-US-JennyNeural', male: 'en-US-GuyNeural' },
    hasRomaji: false,
    ttsSupported: false,
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

export function getNativeLangBcp47(code: string): string {
  const map: Record<string, string> = {
    'en': 'en-US', 'ja': 'ja-JP', 'fr': 'fr-FR', 'es': 'es-ES',
    'de': 'de-DE', 'zh': 'zh-CN', 'ko': 'ko-KR', 'pt': 'pt-BR',
    'vi': 'vi-VN', 'th': 'th-TH', 'hi': 'hi-IN', 'lg': 'en-US',
  };
  return map[code] ?? 'en-US';
}

export function getBCP47(code: string, type: 'stt' | 'tts'): string {
  return getTargetLangConfig(code).bcp47[type];
}

export function getAzureVoice(code: string, gender: string = 'female'): string {
  const cfg = getTargetLangConfig(code);
  const key = gender === 'male' ? 'male' : 'female';
  return cfg.azureVoice[key];
}

const AZURE_VOICE_MAP: Record<string, { female: string; male: string }> = {
  'ja-JP': { female: 'ja-JP-NanamiNeural',   male: 'ja-JP-KeitaNeural' },
  'ja':    { female: 'ja-JP-NanamiNeural',   male: 'ja-JP-KeitaNeural' },
  'en-US': { female: 'en-US-JennyNeural',    male: 'en-US-GuyNeural' },
  'en':    { female: 'en-US-JennyNeural',    male: 'en-US-GuyNeural' },
  'fr-FR': { female: 'fr-FR-DeniseNeural',   male: 'fr-FR-HenriNeural' },
  'fr':    { female: 'fr-FR-DeniseNeural',   male: 'fr-FR-HenriNeural' },
  'es-ES': { female: 'es-ES-ElviraNeural',   male: 'es-ES-AlvaroNeural' },
  'es':    { female: 'es-ES-ElviraNeural',   male: 'es-ES-AlvaroNeural' },
  'de-DE': { female: 'de-DE-KatjaNeural',    male: 'de-DE-KillianNeural' },
  'de':    { female: 'de-DE-KatjaNeural',    male: 'de-DE-KillianNeural' },
  'zh-CN': { female: 'zh-CN-XiaoxiaoNeural', male: 'zh-CN-YunxiNeural' },
  'zh':    { female: 'zh-CN-XiaoxiaoNeural', male: 'zh-CN-YunxiNeural' },
  'ko-KR': { female: 'ko-KR-SunHiNeural',    male: 'ko-KR-InJoonNeural' },
  'ko':    { female: 'ko-KR-SunHiNeural',    male: 'ko-KR-InJoonNeural' },
  'pt-BR': { female: 'pt-BR-FranciscaNeural', male: 'pt-BR-AntonioNeural' },
  'pt':    { female: 'pt-BR-FranciscaNeural', male: 'pt-BR-AntonioNeural' },
  'vi-VN': { female: 'vi-VN-HoaiMyNeural',   male: 'vi-VN-NamMinhNeural' },
  'vi':    { female: 'vi-VN-HoaiMyNeural',   male: 'vi-VN-NamMinhNeural' },
  'th-TH': { female: 'th-TH-PremwadeeNeural', male: 'th-TH-NiwatNeural' },
  'th':    { female: 'th-TH-PremwadeeNeural', male: 'th-TH-NiwatNeural' },
  'hi-IN': { female: 'hi-IN-SwaraNeural',    male: 'hi-IN-MadhurNeural' },
  'hi':    { female: 'hi-IN-SwaraNeural',    male: 'hi-IN-MadhurNeural' },
};

export function resolveAzureVoice(bcp47: string, gender: string = 'female'): string {
  const key = gender === 'male' ? 'male' : 'female';
  return AZURE_VOICE_MAP[bcp47]?.[key]
    ?? AZURE_VOICE_MAP[bcp47?.split('-')[0]]?.[key]
    ?? 'en-US-JennyNeural';
}
