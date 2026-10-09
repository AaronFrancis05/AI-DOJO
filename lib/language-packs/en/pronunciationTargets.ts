/**
 * The English sounds speakers of each native language most often get wrong
 * because of their first language (L1 transfer). The AI coach uses these to
 * decide which mispronunciations are worth correcting first, and they are the
 * vocabulary a tutor briefing or weak-point model can name a sound with.
 *
 * The rubric judges INTELLIGIBILITY, not accent: a sound is listed only where
 * getting it wrong changes or hides the word (light/right, ship/sheep, pan/
 * ban). Keyed by native-language code; a missing language gets the general
 * list.
 */
export const EN_PRONUNCIATION_TARGETS: Record<string, readonly string[]> = {
  ja: [
    '/r/ vs /l/ (right/light, rice/lice)',
    'extra vowels after consonants (desk → "desuku", strike → "sutoraiku")',
    '/θ/ and /ð/ said as /s/ and /z/ (think → "sink")',
    '/v/ vs /b/ (very → "berry")',
    'word and sentence stress — English is stress-timed, so unstressed syllables shrink',
  ],
  ko: [
    '/f/ vs /p/ (coffee → "copy")',
    '/r/ vs /l/',
    '/z/ said as /dʒ/ (zoo → "joo")',
    'final consonants released or followed by a vowel',
    '/θ/ and /ð/',
  ],
  zh: [
    '/θ/ and /ð/ (three → "sree" or "free")',
    'dropped final consonants and clusters (world, asked)',
    '/v/ vs /w/',
    '/n/ vs /l/ for some southern speakers',
    'short vs long vowels (ship/sheep, full/fool)',
  ],
  es: [
    'an /e/ added before s + consonant (school → "eschool", Spain → "Espain")',
    'short vs long vowels (ship/sheep, live/leave)',
    '/b/ vs /v/',
    '/dʒ/ vs /j/ (job/yob)',
    'final -ed and -s endings dropped',
  ],
  pt: [
    'an /i/ added after final consonants (black → "blacky")',
    'short vs long vowels (ship/sheep)',
    '/θ/ and /ð/',
    'initial /h/ dropped or said as a rough /r/',
    'final /m/ and /n/ nasalised into the vowel',
  ],
  ar: [
    '/p/ vs /b/ (park → "bark")',
    '/v/ vs /f/ (van → "fan")',
    'vowels inserted into consonant clusters (street → "istreet", spring → "sipring")',
    'short vowels /ɪ/ /e/ /æ/ merged',
    'silent letters pronounced',
  ],
  fa: [
    'an /e/ added before initial s + consonant (school → "eschool")',
    '/w/ said as /v/',
    '/θ/ and /ð/',
    'short vowels /ɪ/ vs /iː/',
  ],
  ur: [
    '/v/ vs /w/ (west → "vest")',
    '/θ/ and /ð/ said as aspirated t/d',
    'initial s + consonant clusters broken with a vowel',
    'retroflex /t/ /d/ in place of English alveolar ones',
  ],
  hi: [
    '/v/ vs /w/ (west → "vest")',
    '/θ/ and /ð/ said as aspirated t/d',
    'initial s + consonant clusters broken with a vowel (school → "ischool")',
    'retroflex /t/ /d/ in place of English alveolar ones',
    'syllable-timed rhythm — unstressed syllables not reduced',
  ],
  bn: [
    '/v/ vs /b/ and /w/',
    '/z/ said as /dʒ/',
    '/θ/ and /ð/',
    'initial s + consonant clusters broken with a vowel',
  ],
  fr: [
    '/θ/ and /ð/ said as /s/ /z/ or /t/ /d/',
    'initial /h/ dropped (hungry → "ungry") or added where it is silent',
    'stress placed on the last syllable of every word',
    '/ɪ/ vs /iː/ (ship/sheep)',
  ],
  de: [
    '/w/ said as /v/ (wine → "vine")',
    'final voiced consonants devoiced (bad → "bat", dogs → "docks")',
    '/θ/ and /ð/',
    '/æ/ vs /e/ (bad/bed)',
  ],
  ru: [
    '/θ/ and /ð/',
    '/w/ said as /v/',
    '/h/ said as a rough /x/',
    'final consonants devoiced',
    '/ɪ/ vs /iː/ and /æ/ vs /e/',
  ],
  uk: [
    '/θ/ and /ð/',
    '/w/ said as /v/',
    '/h/ vs /ɡ/',
    'final consonants devoiced',
  ],
  vi: [
    'final consonants and clusters dropped (rice → "rye", asked → "ask")',
    'linking between words missing — each word said separately',
    '/θ/ and /ð/',
    '/ʃ/ vs /s/',
  ],
  th: [
    'final consonants dropped or changed (five → "fi", rice → "rite")',
    'consonant clusters broken with a vowel',
    '/r/ vs /l/',
    '/v/ vs /w/',
    '/θ/ and /ð/',
  ],
  id: [
    '/θ/ and /ð/',
    '/f/ vs /p/ and /v/ vs /f/',
    'final consonants unreleased or dropped',
    'short vs long vowels',
  ],
  ms: [
    '/θ/ and /ð/',
    '/f/ vs /p/ and /v/ vs /f/',
    'final consonants unreleased or dropped',
    'short vs long vowels',
  ],
  tl: [
    '/f/ vs /p/ (fan → "pan")',
    '/v/ vs /b/ (very → "berry")',
    '/θ/ and /ð/',
    'short vs long vowels',
  ],
  tr: [
    '/w/ said as /v/',
    '/θ/ and /ð/',
    'a vowel inserted before or inside initial clusters (school → "ischool")',
    'short vs long vowels',
  ],
  it: [
    'a vowel added after final consonants (big → "bigga")',
    'initial /h/ dropped',
    '/ɪ/ vs /iː/ and /æ/ vs /e/',
    '/θ/ and /ð/',
  ],
  sw: [
    '/r/ vs /l/ for some speakers',
    'a vowel added after final consonants or inside clusters',
    '/θ/ and /ð/ said as /s/ /z/',
    'English vowel contrasts merged into five vowels (ship/sheep, cat/cut)',
  ],
  lg: [
    '/r/ vs /l/ (Luganda treats them as one sound)',
    'a vowel added after final consonants or inside clusters',
    'English vowel contrasts merged into five vowels (ship/sheep, cat/cut)',
    '/θ/ and /ð/',
  ],
};

const GENERAL_TARGETS: readonly string[] = [
  '/θ/ and /ð/ (think, this)',
  'short vs long vowels (ship/sheep, full/fool)',
  'final consonants and -ed / -s endings',
  'word stress on the right syllable (PHOtograph, phoTOgraphy)',
];

export function getEnglishPronunciationTargets(nativeLanguage: string): readonly string[] {
  return EN_PRONUNCIATION_TARGETS[nativeLanguage] ?? GENERAL_TARGETS;
}
