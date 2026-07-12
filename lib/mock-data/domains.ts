/* ───────────────────────────────────────────────
   Domain fixtures — matches the `domains` table shape
   (The brief says domains conceptually exists; we model it here.)
   ─────────────────────────────────────────────── */

export interface DomainFixture {
  id: number;
  slug: string;                    // URL-safe, used in route params
  name: string;                    // Display name e.g. "Restaurant"
  description: string;
  icon: string;                    // lucide icon name
  heroGradientFrom: string;
  heroGradientTo: string;
  situationCount: number;
  displayOrder: number;
}

export const domains: DomainFixture[] = [
  {
    id: 1,
    slug: 'restaurant',
    name: 'Restaurant',
    description: 'Order food, make reservations, handle special requests',
    icon: 'UtensilsCrossed',
    heroGradientFrom: '#D14343',
    heroGradientTo: '#7A1F1F',
    situationCount: 8,
    displayOrder: 1,
  },
  {
    id: 2,
    slug: 'hotel',
    name: 'Hotel',
    description: 'Check in and out, request services, handle complaints',
    icon: 'Building2',
    heroGradientFrom: '#2D3BC5',
    heroGradientTo: '#141F6B',
    situationCount: 6,
    displayOrder: 2,
  },
  {
    id: 3,
    slug: 'airport',
    name: 'Airport',
    description: 'Check in for flights, navigate customs, handle delays',
    icon: 'Plane',
    heroGradientFrom: '#2FAE66',
    heroGradientTo: '#145A33',
    situationCount: 7,
    displayOrder: 3,
  },
  {
    id: 4,
    slug: 'hospital',
    name: 'Hospital',
    description: 'Describe symptoms, schedule appointments, understand prescriptions',
    icon: 'HeartPulse',
    heroGradientFrom: '#E3A939',
    heroGradientTo: '#7A5715',
    situationCount: 5,
    displayOrder: 4,
  },
  {
    id: 5,
    slug: 'shopping',
    name: 'Shopping',
    description: 'Ask about products, bargain, process returns',
    icon: 'ShoppingBag',
    heroGradientFrom: '#9333EA',
    heroGradientTo: '#4A117A',
    situationCount: 6,
    displayOrder: 5,
  },
  {
    id: 6,
    slug: 'workplace',
    name: 'Workplace',
    description: 'Attend meetings, communicate with colleagues, send emails',
    icon: 'Briefcase',
    heroGradientFrom: '#2563EB',
    heroGradientTo: '#0F337A',
    situationCount: 8,
    displayOrder: 6,
  },
  {
    id: 7,
    slug: 'travel',
    name: 'Travel',
    description: 'Ask for directions, buy tickets, check into accommodation',
    icon: 'Compass',
    heroGradientFrom: '#06B6D4',
    heroGradientTo: '#035B6B',
    situationCount: 7,
    displayOrder: 7,
  },
  {
    id: 8,
    slug: 'daily-life',
    name: 'Daily Life',
    description: 'Meet neighbours, make small talk, manage errands',
    icon: 'Sun',
    heroGradientFrom: '#F59E0B',
    heroGradientTo: '#7A4F06',
    situationCount: 9,
    displayOrder: 8,
  },
];
