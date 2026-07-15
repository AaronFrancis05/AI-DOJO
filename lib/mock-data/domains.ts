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
  imageUrl?: string;
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
    imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80',
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
    imageUrl: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80',
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
    imageUrl: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800&q=80',
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
    imageUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=800&q=80',
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
    imageUrl: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=800&q=80',
  },
  {
    id: 6,
    slug: 'business',
    name: 'Business',
    description: 'Attend meetings, communicate with colleagues, send emails',
    icon: 'Briefcase',
    heroGradientFrom: '#2563EB',
    heroGradientTo: '#0F337A',
    situationCount: 8,
    displayOrder: 6,
    imageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80',
  },
  {
    id: 7,
    slug: 'travel',
    name: 'Travel & Tourism',
    description: 'Ask for directions, buy tickets, check into accommodation',
    icon: 'Compass',
    heroGradientFrom: '#06B6D4',
    heroGradientTo: '#035B6B',
    situationCount: 7,
    displayOrder: 7,
    imageUrl: 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&q=80',
  },
  {
    id: 8,
    slug: 'daily_life',
    name: 'Daily Life',
    description: 'Meet neighbours, make small talk, manage errands',
    icon: 'Sun',
    heroGradientFrom: '#F59E0B',
    heroGradientTo: '#7A4F06',
    situationCount: 9,
    displayOrder: 8,
    imageUrl: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&q=80',
  },
];
