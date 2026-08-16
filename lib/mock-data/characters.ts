export interface CharacterFixture {
  id: number;
  name: string;
  role: string;
  personality?: string;
  avatarColor?: string;
  avatarIcon?: string;
  voiceType?: string;
  gender?: string;
  avatarModelUrl?: string;
  defaultForDomain?: string;
  displayOrder?: number;
}

export const characters: CharacterFixture[] = [
  { id: 1, name: 'Yuki Tanaka', role: 'Friendly Shopkeeper / Waitress' },
  { id: 2, name: 'Kenji Sato', role: 'Business Executive / Hotel Manager' },
  { id: 3, name: 'Miyuki Nakamura', role: 'Customer Service / Nurse' },
  { id: 4, name: 'Takeshi Yamamoto', role: 'Train Conductor / Police Officer' },
  { id: 5, name: 'Hana Kimura', role: 'Fashion Assistant / Tour Guide' },
  { id: 6, name: 'Ryo Aoki', role: 'Airline Staff / Hotel Concierge' },
  { id: 7, name: 'Takashi Mori', role: 'Business Executive / Corporate Professional' },
  { id: 8, name: 'Sakura Yamada', role: 'Friendly Neighbour / Local Guide' },
];