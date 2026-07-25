import { db } from '../src/db';
import { quickDrills } from '../src/schema';

const JA_DRILLS = [
  {
    domainSlug: 'daily_life',
    promptJa: 'おはようございます',
    promptPhonetic: 'ohayou gozaimasu',
    promptEn: 'Good morning — greet the character back politely.',
    expectedGoal: 'greeting_morning',
    difficulty: 'beginner',
    languageCode: 'ja',
    displayOrder: 1,
  },
  {
    domainSlug: 'daily_life',
    promptJa: 'こんにちは',
    promptPhonetic: 'konnichiwa',
    promptEn: 'Good afternoon — respond with the appropriate greeting.',
    expectedGoal: 'greeting_afternoon',
    difficulty: 'beginner',
    languageCode: 'ja',
    displayOrder: 2,
  },
  {
    domainSlug: 'daily_life',
    promptJa: 'こんばんは',
    promptPhonetic: 'konbanwa',
    promptEn: 'Good evening — greet the character for the evening.',
    expectedGoal: 'greeting_evening',
    difficulty: 'beginner',
    languageCode: 'ja',
    displayOrder: 3,
  },
  {
    domainSlug: 'daily_life',
    promptJa: 'お元気ですか',
    promptPhonetic: 'ogenki desu ka',
    promptEn: 'How are you? — Ask how the character is doing.',
    expectedGoal: 'how_are_you',
    difficulty: 'beginner',
    languageCode: 'ja',
    displayOrder: 4,
  },
  {
    domainSlug: 'icebreaker',
    promptJa: 'お名前は何ですか',
    promptPhonetic: 'onamae wa nan desu ka',
    promptEn: 'What is your name? — Introduce yourself to the character.',
    expectedGoal: 'self_introduction',
    difficulty: 'beginner',
    languageCode: 'ja',
    displayOrder: 5,
  },
  {
    domainSlug: 'icebreaker',
    promptJa: 'どこから来ましたか',
    promptPhonetic: 'doko kara kimashita ka',
    promptEn: 'Where are you from? — Tell the character where you come from.',
    expectedGoal: 'origin',
    difficulty: 'beginner',
    languageCode: 'ja',
    displayOrder: 6,
  },
  {
    domainSlug: 'icebreaker',
    promptJa: 'いつ日本に来ましたか',
    promptPhonetic: 'itsu nihon ni kimashita ka',
    promptEn: 'When did you come to Japan? — Say when you arrived.',
    expectedGoal: 'arrival_time',
    difficulty: 'beginner',
    languageCode: 'ja',
    displayOrder: 7,
  },
  {
    domainSlug: 'daily_life',
    promptJa: 'ありがとうございます',
    promptPhonetic: 'arigatou gozaimasu',
    promptEn: 'Thank you — express gratitude for something the character did.',
    expectedGoal: 'gratitude',
    difficulty: 'beginner',
    languageCode: 'ja',
    displayOrder: 8,
  },
  {
    domainSlug: 'daily_life',
    promptJa: 'すみません',
    promptPhonetic: 'sumimasen',
    promptEn: 'Excuse me / I\'m sorry — apologize or get the character\'s attention.',
    expectedGoal: 'apology_attention',
    difficulty: 'beginner',
    languageCode: 'ja',
    displayOrder: 9,
  },
  {
    domainSlug: 'daily_life',
    promptJa: 'はい、わかりました',
    promptPhonetic: 'hai, wakarimashita',
    promptEn: 'Yes, I understand — acknowledge the character\'s instructions.',
    expectedGoal: 'acknowledgment',
    difficulty: 'beginner',
    languageCode: 'ja',
    displayOrder: 10,
  },
];

async function seedQuickDrillsJa() {
  console.log('Seeding Japanese quick drills...');
  for (const drill of JA_DRILLS) {
    await db.insert(quickDrills).values(drill).onConflictDoNothing();
  }
  console.log(`Seeded ${JA_DRILLS.length} Japanese quick drills.`);
}

seedQuickDrillsJa().catch(console.error);
