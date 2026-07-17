import { db } from '../src/db';
import { domains, situations, characters } from '../src/schema';
import { eq, inArray, sql } from 'drizzle-orm';

const domainFixtures = [
  { slug: 'restaurant', name: 'Restaurant', description: 'Order food, make reservations, handle special requests', icon: 'UtensilsCrossed', heroGradientFrom: '#D14343', heroGradientTo: '#7A1F1F', situationCount: 8, displayOrder: 1 },
  { slug: 'hotel', name: 'Hotel', description: 'Check in and out, request services, handle complaints', icon: 'Building2', heroGradientFrom: '#2D3BC5', heroGradientTo: '#141F6B', situationCount: 6, displayOrder: 2 },
  { slug: 'airport', name: 'Airport', description: 'Check in for flights, navigate customs, handle delays', icon: 'Plane', heroGradientFrom: '#2FAE66', heroGradientTo: '#145A33', situationCount: 7, displayOrder: 3 },
  { slug: 'hospital', name: 'Hospital', description: 'Describe symptoms, schedule appointments, understand prescriptions', icon: 'HeartPulse', heroGradientFrom: '#E3A939', heroGradientTo: '#7A5715', situationCount: 13, displayOrder: 4 },
  { slug: 'shopping', name: 'Shopping', description: 'Ask about products, bargain, process returns', icon: 'ShoppingBag', heroGradientFrom: '#9333EA', heroGradientTo: '#4A117A', situationCount: 6, displayOrder: 5 },
  { slug: 'business', name: 'Business', description: 'Attend meetings, communicate with colleagues, send emails', icon: 'Briefcase', heroGradientFrom: '#2563EB', heroGradientTo: '#0F337A', situationCount: 8, displayOrder: 6 },
  { slug: 'travel', name: 'Travel & Tourism', description: 'Ask for directions, buy tickets, check into accommodation', icon: 'Compass', heroGradientFrom: '#06B6D4', heroGradientTo: '#035B6B', situationCount: 7, displayOrder: 7 },
  { slug: 'daily_life', name: 'Daily Life', description: 'Meet neighbours, make small talk, manage errands', icon: 'Sun', heroGradientFrom: '#F59E0B', heroGradientTo: '#7A4F06', situationCount: 9, displayOrder: 8 },
];

const characterFixtures = [
  { name: 'Yuki Tanaka', role: 'Friendly Shopkeeper / Waitress', personality: 'Patient and encouraging', avatarColor: '#2D3BC5', avatarIcon: 'Smile', voiceType: 'Warm, Female — Mid Pitch', displayOrder: 1 },
  { name: 'Kenji Sato', role: 'Business Executive / Hotel Manager', personality: 'Professional yet warm', avatarColor: '#D14343', avatarIcon: 'UserCheck', voiceType: 'Calm, Male — Low Pitch', displayOrder: 2 },
  { name: 'Miyuki Nakamura', role: 'Customer Service / Nurse', personality: 'Efficient and friendly', avatarColor: '#2FAE66', avatarIcon: 'Smile', voiceType: 'Clear, Female — Mid-High Pitch', displayOrder: 3 },
  { name: 'Takeshi Yamamoto', role: 'Train Conductor / Police Officer', personality: 'Serious but approachable', avatarColor: '#E3A939', avatarIcon: 'UserCheck', voiceType: 'Authoritative, Male — Mid Pitch', displayOrder: 4 },
  { name: 'Hana Kimura', role: 'Fashion Assistant / Tour Guide', personality: 'Friendly and cheerful', avatarColor: '#9333EA', avatarIcon: 'Star', voiceType: 'Warm, Female — Mid Pitch', displayOrder: 5 },
  { name: 'Ryo Aoki', role: 'Airline Staff / Hotel Concierge', personality: 'Efficient and professional', avatarColor: '#06B6D4', avatarIcon: 'Headphones', voiceType: 'Clear, Male — Mid Pitch', displayOrder: 6 },
  { name: 'Takashi Mori', role: 'Business Executive / Corporate Professional', personality: 'Punctual and professional', avatarColor: '#2563EB', avatarIcon: 'UserCheck', voiceType: 'Calm, Male — Low Pitch', displayOrder: 7 },
  { name: 'Sakura Yamada', role: 'Friendly Neighbour / Local Guide', personality: 'Warm and approachable', avatarColor: '#F59E0B', avatarIcon: 'Smile', voiceType: 'Warm, Female — Mid Pitch', displayOrder: 8 },
];

const situationFixtures = [
  { domainSlug: 'restaurant', title: 'Order at the Counter', context: 'Walk into a casual ramen shop and order your meal at the counter.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Order food using basic polite phrases', focusPills: 'Ordering Food|||Numbers & Prices|||Polite Phrases|||Menu Items', displayOrder: 1 },
  { domainSlug: 'restaurant', title: 'Make a Reservation', context: 'Call a high-end restaurant to book a table for a business dinner.', skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Make phone reservations with proper keigo', focusPills: 'Phone Etiquette|||Dates & Times|||Politeness Levels|||Special Requests', displayOrder: 2 },
  { domainSlug: 'restaurant', title: 'Handle a Complaint', context: 'Your steak is overcooked and the service is slow — talk to the manager.', skillLevel: 'advanced', behaviorMode: 'trouble', learningGoals: 'Express dissatisfaction politely without being rude', focusPills: 'Complaints|||Apologies|||Tone Management|||Resolution', displayOrder: 3 },
  { domainSlug: 'hotel', title: 'Check In', context: 'Arrive at a hotel and complete the check-in process.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Check in using basic Japanese', focusPills: 'Check-in Phrases|||Identification|||Room Preferences|||Payment', displayOrder: 1 },
  { domainSlug: 'hotel', title: 'Request Housekeeping', context: 'Ask for extra towels and late-night room service.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Request services politely', focusPills: 'Requests|||Room Items|||Time Expressions|||Gratitude', displayOrder: 2 },
  { domainSlug: 'hotel', title: 'Handle a Billing Issue', context: 'Your bill has charges you did not make — dispute them at the front desk.', skillLevel: 'advanced', behaviorMode: 'trouble', learningGoals: 'Dispute charges calmly and clearly', focusPills: 'Numbers & Prices|||Clarification|||Assertiveness|||Resolution', displayOrder: 3 },
  { domainSlug: 'airport', title: 'Check In for a Flight', context: 'Check in at the airline counter and drop your luggage.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Complete check-in formalities', focusPills: 'Check-in|||Luggage|||Boarding Pass|||Gate Information', displayOrder: 1 },
  { domainSlug: 'airport', title: 'Flight Delay Announced', context: 'Your flight is delayed by 5 hours — ask for compensation.', skillLevel: 'intermediate', behaviorMode: 'trouble', learningGoals: 'Handle unexpected changes assertively', focusPills: 'Delays|||Compensation|||Alternative Options|||Persistence', displayOrder: 2 },
  { domainSlug: 'airport', title: 'Customs & Immigration', context: 'Go through immigration and answer questions about your stay.', skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Answer immigration questions clearly', focusPills: 'Purpose of Visit|||Duration|||Customs Declarations|||Hotel Info', displayOrder: 3 },
  { domainSlug: 'hospital', title: 'Describe Symptoms', context: 'Visit a doctor and explain what is wrong.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Describe basic symptoms using body vocabulary', focusPills: 'Body Parts|||Symptoms|||Duration|||Pain Level', displayOrder: 1 },
  { domainSlug: 'hospital', title: 'Schedule an Appointment', context: 'Call a clinic to book a check-up appointment.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Schedule appointments using polite forms', focusPills: 'Phone Etiquette|||Dates & Times|||Availability|||Confirmation', displayOrder: 2 },
  { domainSlug: 'hospital', title: 'Emergency Room Visit', context: 'You have been rushed to the ER — communicate with the on-call doctor.', skillLevel: 'advanced', behaviorMode: 'trouble', learningGoals: 'Communicate under stress with limited vocabulary', focusPills: 'Emergency Phrases|||Severity|||Urgency|||Medical History', displayOrder: 3 },
  { domainSlug: 'shopping', title: 'Ask About a Product', context: 'Ask a store clerk about the features of a camera.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Ask about product features and prices', focusPills: 'Product Inquiries|||Colors & Sizes|||Prices|||Comparisons', displayOrder: 1 },
  { domainSlug: 'shopping', title: 'Bargain at a Market', context: 'Negotiate prices at a local flea market.', skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Use negotiation phrases and numbers', focusPills: 'Numbers|||Bargaining|||Quantity|||Payment', displayOrder: 2 },
  { domainSlug: 'shopping', title: 'Return a Defective Item', context: 'Return a phone that stopped working after two days.', skillLevel: 'intermediate', behaviorMode: 'trouble', learningGoals: 'Explain a problem and request a refund', focusPills: 'Complaints|||Refunds|||Explanations|||Receipts', displayOrder: 3 },
  { domainSlug: 'business', title: 'Introduce Yourself', context: 'First day at a new job — introduce yourself to the team.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Give a self-introduction', focusPills: 'Self-introduction|||Job Title|||Hobbies|||Politeness', displayOrder: 1 },
  { domainSlug: 'business', title: 'Join a Meeting', context: 'Participate in a team meeting and give your opinion.', skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Express opinions and agree/disagree politely', focusPills: 'Meeting Phrases|||Opinions|||Agreeing|||Disagreeing', displayOrder: 2 },
  { domainSlug: 'business', title: 'Handle a Mistake', context: 'You made an error on a report — explain to your manager.', skillLevel: 'advanced', behaviorMode: 'trouble', learningGoals: 'Apologize professionally and propose solutions', focusPills: 'Apologies|||Responsibility|||Solutions|||Keigo', displayOrder: 3 },
  { domainSlug: 'travel', title: 'Ask for Directions', context: 'You are lost in Shinjuku station — ask a passerby for help.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Ask for and understand directions', focusPills: 'Directions|||Landmarks|||Transport|||Gratitude', displayOrder: 1 },
  { domainSlug: 'travel', title: 'Buy a Train Ticket', context: 'Purchase a Shinkansen ticket at the station counter.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Buy tickets using basic Japanese', focusPills: 'Destinations|||Ticket Types|||Times|||Payment', displayOrder: 2 },
  { domainSlug: 'travel', title: 'Lost Baggage Claim', context: 'Your luggage did not arrive — file a claim at the airport desk.', skillLevel: 'intermediate', behaviorMode: 'trouble', learningGoals: 'File a lost item report clearly', focusPills: 'Descriptions|||Lost Items|||Forms|||Follow-up', displayOrder: 3 },
  { domainSlug: 'daily_life', title: 'Meet a Neighbour', context: 'Introduce yourself to a new neighbour in your apartment building.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Make small talk and basic introductions', focusPills: 'Greetings|||Self-introduction|||Small Talk|||Neighbourhood', displayOrder: 1 },
  { domainSlug: 'daily_life', title: 'Visit the Post Office', context: 'Send a package overseas at the post office counter.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Complete postal transactions', focusPills: 'Parcel Types|||Destinations|||Shipping Options|||Payment', displayOrder: 2 },
  { domainSlug: 'daily_life', title: 'Attend a Local Event', context: 'Join a community festival and chat with locals.', skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Engage in casual conversation at events', focusPills: 'Festival Vocabulary|||Exclamations|||Compliments|||Participation', displayOrder: 3 },
  // ── Hospital: extended healthcare & eldercare ──
  { domainSlug: 'hospital', title: 'Morning Vitals Check', context: 'As a caregiver, greet an elderly resident, ask how they slept, and take their temperature and blood pressure.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Use warm, unhurried caregiving language for morning check-ins', focusPills: 'Elderly Care|||Greetings|||Vitals Vocabulary|||Gentle Tone', displayOrder: 4 },
  { domainSlug: 'hospital', title: 'Assisting with Meals', context: 'Offer a resident food choices, check for allergies or swallowing difficulty, and encourage them to eat.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Offer choices and encouragement around mealtime safely', focusPills: 'Elderly Care|||Food & Allergies|||Encouragement|||Safety Checks', displayOrder: 5 },
  { domainSlug: 'hospital', title: 'Mobility Assistance', context: 'Help a resident recovering from a hip fracture move safely from bed to wheelchair, giving clear safety instructions.', skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Give step-by-step safety instructions during physical assistance', focusPills: 'Elderly Care|||Safety Instructions|||Reassurance|||Physical Assistance', displayOrder: 6 },
  { domainSlug: 'hospital', title: 'Reporting a Condition Change', context: 'Report a change in a resident\'s condition to the on-duty nurse using proper handover language.', skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Deliver a concise, accurate clinical handover to a nurse', focusPills: 'Elderly Care|||Handover Reports|||Symptom Vocabulary|||Professional Register', displayOrder: 7 },
  { domainSlug: 'hospital', title: 'Calming an Anxious Resident', context: 'Use gentle, reassuring language with a resident who is confused or anxious (e.g. early dementia).', skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'De-escalate confusion or distress with calm, reassuring phrasing', focusPills: 'Elderly Care|||Dementia Care|||Reassurance|||Patience', displayOrder: 8 },
  { domainSlug: 'hospital', title: 'Updating a Family Member', context: 'A resident\'s family member visits — summarize how their day went and answer their questions.', skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Summarize a care recipient\'s day clearly for a worried family member', focusPills: 'Elderly Care|||Family Communication|||Summaries|||Empathy', displayOrder: 9 },
  { domainSlug: 'hospital', title: 'Night Shift Handover', context: 'Exchange shift notes with another caregiver about multiple residents\' status before leaving for the night.', skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Give and receive a structured staff-to-staff shift handover', focusPills: 'Elderly Care|||Shift Handover|||Colleague Register|||Conciseness', displayOrder: 10 },
  { domainSlug: 'hospital', title: 'Orienting a New Resident', context: 'Walk a newly admitted elderly resident through the daily schedule and facility rules on their first day.', skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Explain a daily routine and facility rules clearly and kindly', focusPills: 'Elderly Care|||Orientation|||Daily Schedule|||Clarity', displayOrder: 11 },
  { domainSlug: 'hospital', title: 'Pharmacy Medication Instructions', context: 'Explain to a patient (or their caregiver) how and when to take a newly prescribed medication.', skillLevel: 'beginner', behaviorMode: 'standard', learningGoals: 'Give clear dosage and timing instructions for medication', focusPills: 'Medication|||Dosage & Timing|||Side Effects|||Clarity', displayOrder: 12 },
  { domainSlug: 'hospital', title: 'Difficult Family Conversation', context: 'A resident\'s condition has worsened — deliver the update to an upset family member with care and honesty.', skillLevel: 'advanced', behaviorMode: 'trouble', learningGoals: 'Deliver sensitive news calmly while managing an emotional reaction', focusPills: 'Elderly Care|||Difficult News|||Emotional Regulation|||Compassion', displayOrder: 13 },
];

async function seedDomainData() {
  console.log('=== Domain Data Seeder ===\n');

  let domainMap: Map<string, number>;

  const existingDomains = await db.select().from(domains);
  if (existingDomains.length > 0) {
    console.log(`Domains table already has ${existingDomains.length} rows. Checking for missing situations...\n`);
    domainMap = new Map(existingDomains.map(d => [d.slug, d.id]));
  } else {
    console.log('Seeding domains...');
    const insertedDomains = await db.insert(domains).values(domainFixtures).returning();
    domainMap = new Map(insertedDomains.map(d => [d.slug, d.id]));
    console.log(`  Inserted ${insertedDomains.length} domains.\n`);

    console.log('Seeding characters...');
    const insertedCharacters = await db.insert(characters).values(
      characterFixtures.map(c => ({
        ...c,
        defaultForDomainId: domainMap.get(
          c.name === 'Yuki Tanaka' ? 'restaurant' :
          c.name === 'Kenji Sato' ? 'hotel' :
          c.name === 'Miyuki Nakamura' ? 'hospital' :
          c.name === 'Takeshi Yamamoto' ? 'travel' :
          c.name === 'Hana Kimura' ? 'shopping' :
          c.name === 'Ryo Aoki' ? 'airport' :
          c.name === 'Takashi Mori' ? 'business' : 'daily_life'
        ) ?? null,
      }))
    ).returning();
    console.log(`  Inserted ${insertedCharacters.length} characters.\n`);
  }

  // Upsert situations — insert only those not already present by title
  console.log('Upserting situations...');
  const allFixtureTitles = situationFixtures.map(sf => sf.title);
  const existingRows = await db.select({ title: situations.title })
    .from(situations)
    .where(inArray(situations.title, allFixtureTitles));
  const existingTitles = new Set(existingRows.map(r => r.title));

  const toInsert = situationFixtures
    .map(sf => {
      const domainId = domainMap.get(sf.domainSlug);
      if (!domainId) {
        console.warn(`  [WARN] No domain id for slug "${sf.domainSlug}", skipping "${sf.title}"`);
        return null;
      }
      if (existingTitles.has(sf.title)) return null;
      return {
        domainId,
        title: sf.title,
        context: sf.context,
        skillLevel: sf.skillLevel,
        behaviorMode: sf.behaviorMode as 'standard' | 'trouble',
        learningGoals: sf.learningGoals,
        focusPills: sf.focusPills,
        displayOrder: sf.displayOrder,
      };
    })
    .filter(Boolean) as any[];

  if (toInsert.length > 0) {
    await db.insert(situations).values(toInsert);
  }
  console.log(`  Inserted ${toInsert.length} new situations, ${allFixtureTitles.length - toInsert.length} already exist.\n`);

  // Update situationCount on each domain to match actual count
  for (const [slug, id] of domainMap) {
    const rows = await db.select({ count: sql<number>`count(*)` })
      .from(situations)
      .where(eq(situations.domainId, id));
    const n = Number(rows[0]?.count ?? 0);
    await db.update(domains).set({ situationCount: n }).where(eq(domains.id, id));
  }
  console.log('  Updated domain situationCounts.\n');

  console.log('=== Seed Complete ===');
}

seedDomainData().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
