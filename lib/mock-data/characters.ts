/* ───────────────────────────────────────────────
   Character fixtures — Emma, Lucas, Sophia, David
   These are the AI personas the learner can choose
   to play the counterpart role in a situation.
   ─────────────────────────────────────────────── */

export interface CharacterFixture {
  id: number;
  name: string;
  role: string;              // e.g. "Friendly Waitress", "Strict Hotel Manager"
  personality: string;       // one-line trait displayed on card
  avatarColor: string;       // gradient/color for placeholder avatar
  avatarIcon: string;        // lucide icon name for placeholder
  voiceType: string;         // descriptor for voice prefs panel
  defaultForDomain?: string; // which domain's situations this char suits best
  displayOrder: number;
}

export const characters: CharacterFixture[] = [
  {
    id: 1,
    name: 'Emma',
    role: 'Friendly Waitress / Shop Assistant',
    personality: 'Patiente et encourageante — Patient and encouraging',
    avatarColor: '#2D3BC5',
    avatarIcon: 'Smile',
    voiceType: 'Warm, Female — Mid Pitch',
    defaultForDomain: 'restaurant',
    displayOrder: 1,
  },
  {
    id: 2,
    name: 'Lucas',
    role: 'Hotel Concierge / Front Desk',
    personality: 'Professionnel mais chaleureux — Professional yet warm',
    avatarColor: '#D14343',
    avatarIcon: 'UserCheck',
    voiceType: 'Calm, Male — Low Pitch',
    defaultForDomain: 'hotel',
    displayOrder: 2,
  },
  {
    id: 3,
    name: 'Sophia',
    role: 'Airport Staff / Travel Agent',
    personality: 'Efficace et sympathique — Efficient and friendly',
    avatarColor: '#2FAE66',
    avatarIcon: 'Headphones',
    voiceType: 'Clear, Female — Mid-High Pitch',
    defaultForDomain: 'airport',
    displayOrder: 3,
  },
  {
    id: 4,
    name: 'David',
    role: 'Doctor / Business Colleague',
    personality: 'Sérieux mais accessible — Serious but approachable',
    avatarColor: '#E3A939',
    avatarIcon: 'Star',
    voiceType: 'Authoritative, Male — Mid Pitch',
    defaultForDomain: 'hospital',
    displayOrder: 4,
  },
  {
    id: 5,
    name: 'Yuki',
    role: 'Street Guide / Tourist Helper',
    personality: 'Amitié et sourire — Friendly and cheerful',
    avatarColor: '#06B6D4',
    avatarIcon: 'Smile',
    voiceType: 'Warm, Female — Mid Pitch',
    defaultForDomain: 'travel',
    displayOrder: 5,
  },
  {
    id: 6,
    name: 'Kenji',
    role: 'Business Colleague / Office Worker',
    personality: 'Ponctuel et professionnel — Punctual and professional',
    avatarColor: '#2563EB',
    avatarIcon: 'UserCheck',
    voiceType: 'Calm, Male — Mid Pitch',
    defaultForDomain: 'business',
    displayOrder: 4,
  },
];
