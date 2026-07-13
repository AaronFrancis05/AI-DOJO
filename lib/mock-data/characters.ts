/* ───────────────────────────────────────────────
   Character fixtures — matches the live production
   `characters` table roster as of July 2026.
   Kept in sync with scripts/seed-domain-data.ts.
   ─────────────────────────────────────────────── */

export interface CharacterFixture {
  id: number;
  name: string;
  role: string;
  personality: string;
  avatarColor: string;
  avatarIcon: string;
  voiceType: string;
  defaultForDomain?: string;  // domain slug — resolved from defaultForDomainId
  displayOrder: number;
}

export const characters: CharacterFixture[] = [
  {
    id: 1,
    name: 'Yuki Tanaka',
    role: 'Friendly Shopkeeper / Waitress',
    personality: 'Patient and encouraging',
    avatarColor: '#2D3BC5',
    avatarIcon: 'Smile',
    voiceType: 'Warm, Female — Mid Pitch',
    defaultForDomain: 'restaurant',
    displayOrder: 1,
  },
  {
    id: 2,
    name: 'Kenji Sato',
    role: 'Business Executive / Hotel Manager',
    personality: 'Professional yet warm',
    avatarColor: '#D14343',
    avatarIcon: 'UserCheck',
    voiceType: 'Calm, Male — Low Pitch',
    defaultForDomain: 'hotel',
    displayOrder: 2,
  },
  {
    id: 3,
    name: 'Miyuki Nakamura',
    role: 'Customer Service / Nurse',
    personality: 'Efficient and friendly',
    avatarColor: '#2FAE66',
    avatarIcon: 'Smile',
    voiceType: 'Clear, Female — Mid-High Pitch',
    defaultForDomain: 'hospital',
    displayOrder: 3,
  },
  {
    id: 4,
    name: 'Takeshi Yamamoto',
    role: 'Train Conductor / Police Officer',
    personality: 'Serious but approachable',
    avatarColor: '#E3A939',
    avatarIcon: 'UserCheck',
    voiceType: 'Authoritative, Male — Mid Pitch',
    defaultForDomain: 'travel',
    displayOrder: 4,
  },
  {
    id: 5,
    name: 'Hana Kimura',
    role: 'Fashion Assistant / Tour Guide',
    personality: 'Friendly and cheerful',
    avatarColor: '#9333EA',
    avatarIcon: 'Star',
    voiceType: 'Warm, Female — Mid Pitch',
    defaultForDomain: 'shopping',
    displayOrder: 5,
  },
  {
    id: 6,
    name: 'Ryo Aoki',
    role: 'Airline Staff / Hotel Concierge',
    personality: 'Efficient and professional',
    avatarColor: '#06B6D4',
    avatarIcon: 'Headphones',
    voiceType: 'Clear, Male — Mid Pitch',
    defaultForDomain: 'airport',
    displayOrder: 6,
  },
  {
    id: 7,
    name: 'Takashi Mori',
    role: 'Business Executive / Corporate Professional',
    personality: 'Punctual and professional',
    avatarColor: '#2563EB',
    avatarIcon: 'UserCheck',
    voiceType: 'Calm, Male — Low Pitch',
    defaultForDomain: 'business',
    displayOrder: 7,
  },
  {
    id: 8,
    name: 'Sakura Yamada',
    role: 'Friendly Neighbour / Local Guide',
    personality: 'Warm and approachable',
    avatarColor: '#F59E0B',
    avatarIcon: 'Smile',
    voiceType: 'Warm, Female — Mid Pitch',
    defaultForDomain: 'daily_life',
    displayOrder: 8,
  },
];
