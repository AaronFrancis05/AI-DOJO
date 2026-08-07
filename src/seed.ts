import { db } from './db';
import { hashPassword } from '../lib/auth';
import { eq } from 'drizzle-orm';
import {
  users, scenarios, vocabulary, scenarioGoals,
  sessions, conversations, corrections, evaluations,
  goalCompletions, vocabularyEncounters,
  scenarioLocalizations, vocabularyLocalizations,
  countries, scenarioSettings,
  courses, courseLevels, units, lessons, lessonPhases,
} from './schema';

async function seed() {
  try {
    const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
    if (existingUsers.length > 0) {
      console.log('📦 Database already seeded — skipping.');
      return;
    }
    console.log('🌱 Starting AI DOJO database seeding...');

    // ================================================================
    // 1. USERS
    // ================================================================
    console.log('Inserting users...');

    // Dev-only default password: changeme123
    // In production, users should register with their own passwords.
    const defaultPwHash = await hashPassword('changeme123');

    const insertedUsers = await db.insert(users).values([
      { name: 'Lynnette', email: 'nangonzilynnette775@gmail.com', passwordHash: defaultPwHash, level: 'beginner', xp: 2400, xpToNext: 3000, tier: 'premium', streak: 12, consentToDataSharing: true },
      { name: 'Aaron', email: 'aarontaremwa8@gmail.com', passwordHash: defaultPwHash, level: 'beginner', xp: 1800, xpToNext: 2000, tier: 'premium', streak: 7, consentToDataSharing: true },
      { name: 'Desire', email: 'desirehope82@gmail.com', passwordHash: defaultPwHash, level: 'intermediate', xp: 5600, xpToNext: 8000, tier: 'premium', streak: 3, consentToDataSharing: true },
      { name: 'Derrick', email: 'alaxdero1@gmail.com', passwordHash: defaultPwHash, level: 'beginner', xp: 900, xpToNext: 1000, tier: 'free', streak: 0, consentToDataSharing: true },
    ]).returning();

    const userMap = Object.fromEntries(insertedUsers.map(u => [u.name, u.id]));

    // ================================================================
    // 2. SCENARIOS (20 upgraded scenarios)
    // ================================================================
    console.log('Inserting 20 scenarios...');
    const insertedScenarios = await db.insert(scenarios).values([
      {
        title: 'First Meeting & Self Introduction',
        context: 'A Ugandan learner arrives at a community welcome event in Tokyo and meets Hana, a cultural exchange coordinator. This initial encounter requires a proper self-introduction using Japanese etiquette: bowing, stating one\'s name, origin, and expressing the desire for a good relationship. First impressions matter deeply in Japanese culture, and using the correct set phrases signals respect and willingness to integrate.',
        businessType: 'Social / Language Learning', difficulty: 'beginner', domain: 'social',
        aiCharacterName: 'Hana', aiCharacterRole: 'Cultural exchange coordinator at Tokyo International Centre',
        userCharacterName: 'Sarah', userCharacterRole: 'Ugandan learner attending her first community welcome event in Tokyo',
        learningGoals: 'Master hajimemashite, watashi wa ___ desu structure, yoroshiku onegaishimasu, and polite self-introduction flow',
        displayOrder: 1,
      },
      {
        title: 'Buying a Snack at Konbini',
        context: 'After a long day, a Ugandan learner stops at a Lawson convenience store to buy a snack and a drink. The clerk greets with the standard irasshaimase, and the learner must request items, confirm the quantity, pay, and receive change. Konbini interactions are the most frequent daily transactions in Japan, making this foundational vocabulary essential.',
        businessType: 'Shopping / Daily Life', difficulty: 'beginner', domain: 'shopping',
        aiCharacterName: 'Sato', aiCharacterRole: 'Lawson convenience store clerk in Tokyo',
        userCharacterName: 'Grace', userCharacterRole: 'Ugandan learner stopping for a snack at a Japanese konbini',
        learningGoals: 'Understand irasshaimase, use ___ o kudasai to request items, confirm quantity with counter words, complete a polite purchase',
        displayOrder: 2,
      },
      {
        title: 'Asking for Directions to the Station',
        context: 'A Ugandan learner is lost in Shinjuku and needs to find the nearest train station. They must politely interrupt a passerby with sumimasen, state their destination, and understand the directional response. This scenario builds confidence in asking for help in public — a critical skill for navigating Japan\'s sprawling urban centres.',
        businessType: 'Navigation / Daily Life', difficulty: 'beginner', domain: 'transport',
        aiCharacterName: 'Watanabe', aiCharacterRole: 'Helpful passerby on a street in Shinjuku',
        userCharacterName: 'David', userCharacterRole: 'Ugandan learner lost in Shinjuku looking for the train station',
        learningGoals: 'Use sumimasen to get attention, ask ___ wa doko desu ka, understand directional words like migi/hidari/massugu, close with arigatou gozaimasu',
        displayOrder: 3,
      },
      {
        title: 'Visiting a Medical Clinic',
        context: 'A Ugandan learner wakes up with a fever and sore throat and visits a local clinic in Osaka. They must check in at reception, describe symptoms to the nurse, and understand basic instructions. Medical interactions require precise symptom vocabulary and the ability to understand simple health questions — essential knowledge for living independently in Japan.',
        businessType: 'Healthcare / Daily Life', difficulty: 'beginner', domain: 'healthcare',
        aiCharacterName: 'Nurse Yamada', aiCharacterRole: 'Receptionist and triage nurse at Sakura Clinic in Osaka',
        userCharacterName: 'Faith', userCharacterRole: 'Ugandan learner feeling unwell and visiting a clinic in Osaka',
        learningGoals: 'Describe symptoms with ___ ga itai desu / netsu ga arimasu, understand dou shimashita ka, respond to health questions, complete registration',
        displayOrder: 4,
      },
      {
        title: 'Ordering Food at a Restaurant',
        context: 'A Ugandan learner visits a traditional izakaya with a friend and must order food in Japanese. The server asks what they would like to eat and drink, and the learner must navigate the menu, use ordering phrases, and employ dining etiquette like itadakimasu and gochisousama. Food culture is central to Japanese social life.',
        businessType: 'Food & Dining / Daily Life', difficulty: 'beginner', domain: 'daily_life',
        aiCharacterName: 'Server Tanaka', aiCharacterRole: 'Waitstaff at Sakura Izakaya in Osaka',
        userCharacterName: 'Michael', userCharacterRole: 'Ugandan learner dining at a Japanese izakaya for the first time',
        learningGoals: 'Use ___ o onegaishimasu / ___ o kudasai to order, understand osusume wa nan desu ka, say itadakimasu before eating, thank the staff',
        displayOrder: 5,
      },
      {
        title: 'Shopping at a Supermarket',
        context: 'A Ugandan learner goes grocery shopping at a Japanese supermarket. They need to find ingredients, ask the staff where specific items are located, weigh produce, and go through the checkout. Supermarket vocabulary is essential for daily independent living.',
        businessType: 'Shopping / Daily Life', difficulty: 'beginner', domain: 'shopping',
        aiCharacterName: 'Staff Nakamura', aiCharacterRole: 'Supermarket employee at Life Supermarket in Tokyo',
        userCharacterName: 'Esther', userCharacterRole: 'Ugandan learner shopping for groceries at a Japanese supermarket',
        learningGoals: 'Ask ___ wa doko desu ka for item locations, understand price inquiries, handle checkout and payment phrases, use common food vocabulary',
        displayOrder: 6,
      },
      {
        title: 'Buying a Ticket at the Train Station',
        context: 'A Ugandan learner needs to take the JR train from Tokyo to Yokohama. They must approach the ticket machine or counter, state their destination, buy the correct ticket, and understand platform announcements. Japan\'s rail system is the backbone of transport, and navigating it independently is a key milestone.',
        businessType: 'Transport / Daily Life', difficulty: 'beginner', domain: 'transport',
        aiCharacterName: 'Station Staff Kimura', aiCharacterRole: 'JR station attendant at Tokyo Station',
        userCharacterName: 'James', userCharacterRole: 'Ugandan learner buying a train ticket from Tokyo to Yokohama',
        learningGoals: 'State destination using ___ made onegaishimasu, understand fare and ticket type questions, ask about platform (nanbansen), confirm departure time',
        displayOrder: 7,
      },
      {
        title: 'Checking into a Hotel',
        context: 'A Ugandan learner arrives at a business hotel in Kyoto for a short stay. They must check in at the front desk, provide their reservation details, confirm the length of stay, and understand the hotel\'s amenities and rules. Hotel check-in is a common scenario for any traveller in Japan.',
        businessType: 'Accommodation / Daily Life', difficulty: 'beginner', domain: 'services',
        aiCharacterName: 'Receptionist Fujita', aiCharacterRole: 'Front desk receptionist at Kyoto Business Hotel',
        userCharacterName: 'Peter', userCharacterRole: 'Ugandan traveller checking into a hotel in Kyoto for two nights',
        learningGoals: 'Confirm reservation with yoyaku shite imasu, state duration (___ haku), understand key and breakfast information, use polite check-in phrases',
        displayOrder: 8,
      },
      {
        title: 'Meeting Your Neighbour',
        context: 'A Ugandan learner encounters their Japanese neighbour in the apartment building hallway for the first time. They exchange morning greetings, introduce themselves as residents, and share a brief friendly conversation. Good neighbourly relations are valued in Japan, and knowing the correct greetings builds community.',
        businessType: 'Social Life / Daily Life', difficulty: 'beginner', domain: 'social',
        aiCharacterName: 'Suzuki-san', aiCharacterRole: 'Neighbour living in the same apartment building',
        userCharacterName: 'Harriet', userCharacterRole: 'Ugandan learner who just moved into a Japanese apartment building',
        learningGoals: 'Use ohayo gozaimasu / konnichiwa appropriately, introduce yourself as a neighbour, ask ogenki desu ka, use casual friendly phrases',
        displayOrder: 9,
      },
      {
        title: 'Home Visit & Omotenashi',
        context: 'A Ugandan learner is invited to a Japanese colleague\'s home for dinner. Upon arrival, they must greet the host properly, present a small gift (omiyage), accept the offered slippers and tea, and engage in polite dinner conversation. Home visits follow a specific etiquette script that reflects the Japanese value of omotenashi (wholehearted hospitality).',
        businessType: 'Social / Cultural', difficulty: 'intermediate', domain: 'social',
        aiCharacterName: 'Yamamoto-san', aiCharacterRole: 'Japanese colleague hosting dinner at their home',
        userCharacterName: 'Robert', userCharacterRole: 'Ugandan learner invited to a Japanese colleague\'s home for dinner',
        learningGoals: 'Use ojama shimasu when entering, present omiyage with tsumaranai mono desu ga, accept ocha politely, use itadakimasu and gochisousama',
        displayOrder: 10,
      },
      {
        title: 'Nomikai — Company Drinks Party',
        context: 'A Ugandan learner attends a company nomikai (after-work drinking party) with colleagues. The party has a casual yet structured flow: opening remarks (kanpai), self-introductions, informal conversation, and closing remarks. Nomikai is central to Japanese workplace bonding, and knowing the etiquette helps newcomers integrate socially.',
        businessType: 'Workplace / Social', difficulty: 'intermediate', domain: 'workplace',
        aiCharacterName: 'Kato-bucho', aiCharacterRole: 'Department manager organizing the nomikai',
        userCharacterName: 'Takeshi (the learner chooses their own name)', userCharacterRole: 'Ugandan learner attending their first company nomikai in Tokyo',
        learningGoals: 'Participate in kanpai toast, introduce yourself to colleagues, use casual workplace drinking vocabulary, understand the flow of nomikai from start to closing',
        displayOrder: 11,
      },
      {
        title: 'Community Welcome Party',
        context: 'A Ugandan learner attends a community welcome party for new international residents. They must circulate, introduce themselves to multiple people, respond to the same questions (name, country, reason for being in Japan) gracefully each time, and remember names. This scenario builds endurance in repeated self-introductions.',
        businessType: 'Social / Community', difficulty: 'beginner', domain: 'social',
        aiCharacterName: 'Yuki', aiCharacterRole: 'Community event host at the International Friendship Centre',
        userCharacterName: 'Amina', userCharacterRole: 'Ugandan learner attending a community welcome event for new international residents',
        learningGoals: 'Repeat confident self-introduction across multiple interactions, vary responses slightly each time, use listening cues like ee and sou desu ne, close each exchange naturally',
        displayOrder: 12,
      },
      {
        title: 'Job Interview at a Japanese Company',
        context: 'A Ugandan learner has a job interview for an entry-level position at a Japanese IT company. They must enter the meeting room properly, greet the interviewers, answer questions about their background and skills, express motivation, and close the interview with the correct phrases. Job interviews in Japan follow strict etiquette regarding bowing, sitting, and speech register.',
        businessType: 'Employment / Formal', difficulty: 'intermediate', domain: 'workplace',
        aiCharacterName: 'Tanaka-shachō', aiCharacterRole: 'Company president conducting the job interview',
        userCharacterName: 'Joseph', userCharacterRole: 'Ugandan learner interviewing for an entry-level position at a Japanese IT company',
        learningGoals: 'Use formal keigo greetings (hajimemashite, yoroshiku onegaishimasu), answer shigoto keiken/questions with appropriate humility, express motivation with ganbarimasu, close with arigatou gozaimashita',
        displayOrder: 13,
      },
      {
        title: 'First Day at the Office',
        context: 'On their first day at a Japanese company, a Ugandan learner is introduced to the team by their supervisor. They must greet each colleague, remember names and roles, learn the office layout, and understand basic workplace norms like seating and break times. This scenario covers onboarding vocabulary and office social dynamics.',
        businessType: 'Workplace / Onboarding', difficulty: 'intermediate', domain: 'workplace',
        aiCharacterName: 'Sato-senpai', aiCharacterRole: 'Senior colleague assigned to mentor the new hire',
        userCharacterName: 'David', userCharacterRole: 'Ugandan learner starting their first day at a Japanese company in Tokyo',
        learningGoals: 'Respond to team introductions with proper greetings, use senpai/kouhai awareness, understand office-related vocabulary (tsukue, kaigi, kyūkei), ask basic workplace questions politely',
        displayOrder: 14,
      },
      {
        title: 'Business Meeting & Keigo',
        context: 'A Ugandan learner participates in a weekly team meeting at their Japanese company. They must contribute a status update, respond to questions from the manager, and use appropriate keigo (honorific language) when addressing superiors. This scenario introduces business meeting structure and hierarchical language.',
        businessType: 'Workplace / Meetings', difficulty: 'intermediate', domain: 'workplace',
        aiCharacterName: 'Yamada-kachō', aiCharacterRole: 'Section manager leading the weekly team meeting',
        userCharacterName: 'Michael', userCharacterRole: 'Ugandan learner giving a status update at a Japanese company team meeting',
        learningGoals: 'Use formal desu/masu consistently, report progress with shinkyou houkoku, respond to manager questions with hai and appropriate keigo, close updates with ijou desu',
        displayOrder: 15,
      },
      {
        title: 'Business Card Exchange (Meishi)',
        context: 'A Ugandan learner attends a business networking event and must exchange meishi (business cards) with several professionals. The exchange follows a precise ritual: presenting the card with both hands, reading the other person\'s card carefully, commenting on the company, and placing the card respectfully in the card case. Meishi etiquette is a core Japanese business skill.',
        businessType: 'Workplace / Networking', difficulty: 'intermediate', domain: 'workplace',
        aiCharacterName: 'Ishida-shachō', aiCharacterRole: 'Executive from a partner company at a networking event',
        userCharacterName: 'Sarah', userCharacterRole: 'Ugandan learner attending a business networking event and exchanging meishi',
        learningGoals: 'Present meishi with both hands and proper bow, read and acknowledge the other card, use choushi wa ikaga desu ka, handle dozo and o-taku phrases, respect the card hierarchy',
        displayOrder: 16,
      },
      {
        title: 'Video Conference with Tokyo HQ',
        context: 'A Ugandan learner working remotely joins a video conference with colleagues in Tokyo HQ. They must greet the remote team, share their screen to present a report, handle technical difficulties politely, and close the call with appropriate sign-off. Video meeting etiquette — including timing, camera etiquette, and turn-taking — is essential for modern distributed work.',
        businessType: 'Workplace / Remote', difficulty: 'intermediate', domain: 'workplace',
        aiCharacterName: 'Nakamura-kaichō', aiCharacterRole: 'Tokyo HQ department head leading the remote video conference',
        userCharacterName: 'Grace', userCharacterRole: 'Ugandan learner joining a video conference with Tokyo HQ from their remote office',
        learningGoals: 'Use remote meeting greetings (ohayou gozaimasu from anywhere), handle screen share with kore ga... desu, manage technical apologies (sumimasen, koe ga...), close with otsukaresama desu',
        displayOrder: 17,
      },
      {
        title: 'Post Office — Sending a Parcel',
        context: 'A Ugandan learner needs to send a care package back home from a Japanese post office. They must select the shipping method, fill out the customs form, confirm the address, and pay for the service. Post office vocabulary is practical for anyone living in Japan who needs to send documents or packages internationally.',
        businessType: 'Services / Daily Life', difficulty: 'beginner', domain: 'services',
        aiCharacterName: 'Postal Clerk Ito', aiCharacterRole: 'Japan Post counter staff at Shinjuku Post Office',
        userCharacterName: 'Esther', userCharacterRole: 'Ugandan learner sending a parcel home from a Japanese post office',
        learningGoals: 'State shipping purpose with kore o okuritai desu, select method (funa-bin / koukuu-bin), fill out customs forms, understand weight and price questions',
        displayOrder: 18,
      },
      {
        title: 'Opening a Bank Account',
        context: 'A Ugandan learner needs to open a bank account at a Japanese bank to receive their salary. They must provide identification, explain their purpose, choose an account type, and understand basic banking terms. Bank account opening is a critical step for anyone working or living long-term in Japan.',
        businessType: 'Finance / Services', difficulty: 'intermediate', domain: 'services',
        aiCharacterName: 'Bank Clerk Yoshida', aiCharacterRole: 'Bank teller at Mizuho Bank in Shinjuku',
        userCharacterName: 'James', userCharacterRole: 'Ugandan learner opening a bank account to receive their salary in Japan',
        learningGoals: 'Use kouza o hirakitai desu, provide identification and explain zairyuu card, understand yokin / furikomi / kouza bangou terms, complete application politely',
        displayOrder: 19,
      },
      {
        title: 'Farewell & Saying Goodbye',
        context: 'A Ugandan learner\'s colleague is transferring to another branch, and a small farewell gathering is held at the office. The learner must express gratitude, share a brief farewell message, and participate in the closing ceremony. Saying goodbye properly in Japanese involves specific phrases that acknowledge the relationship and express continued goodwill.',
        businessType: 'Workplace / Social', difficulty: 'intermediate', domain: 'workplace',
        aiCharacterName: 'Tanaka-san', aiCharacterRole: 'Colleague who is transferring to the Osaka branch',
        userCharacterName: 'Peter', userCharacterRole: 'Ugandan learner saying farewell to a colleague at their Japanese company',
        learningGoals: 'Express gratitude with osewa ni narimashita, use sabishii desu ne naturally, give a brief farewell message, close with otagai ni genki de / gokigen you',
        displayOrder: 20,
      },
    ]).returning();

    const sIds = insertedScenarios.map(s => s.id);

    // ================================================================
    // 3. VOCABULARY (5-8 items per scenario)
    // ================================================================
    console.log('Inserting vocabulary...');
    await db.insert(vocabulary).values([
      // Scenario 1: First Meeting
      { scenarioId: sIds[0], targetText: 'はじめまして', phonetic: 'Hajimemashite', translation: 'Nice to meet you (first meeting only)', category: 'greeting', usageTip: 'Only used the very first time you meet someone. Never used again with the same person.', formalityLevel: 'polite' },
      { scenarioId: sIds[0], targetText: 'わたしは___です', phonetic: 'Watashi wa ___ desu', translation: 'I am ___', category: 'self-introduction', usageTip: 'The standard self-introduction template. Say your name where ___ is, then bow slightly.', formalityLevel: 'polite' },
      { scenarioId: sIds[0], targetText: 'よろしくおねがいします', phonetic: 'Yoroshiku onegaishimasu', translation: 'Pleased to meet you / I look forward to your kindness', category: 'greeting', usageTip: 'The all-purpose closer for introductions. It expresses gratitude in advance for the relationship.', formalityLevel: 'polite' },
      { scenarioId: sIds[0], targetText: 'ウガンダからきました', phonetic: 'Uganda kara kimashita', translation: 'I came from Uganda', category: 'origin', usageTip: 'Use this to state where you are from. Replaces kara with other country names.', formalityLevel: 'polite' },
      { scenarioId: sIds[0], targetText: 'おなまえはなんですか', phonetic: 'O-namae wa nan desu ka', translation: 'What is your name?', category: 'question', usageTip: 'The polite way to ask someone\'s name. The o- prefix makes it respectful.', formalityLevel: 'polite' },
      { scenarioId: sIds[0], targetText: 'どうぞよろしく', phonetic: 'Douzo yoroshiku', translation: 'Pleased to meet you (casual)', category: 'greeting', usageTip: 'A slightly less formal version of yoroshiku onegaishimasu. Fine for social settings.', formalityLevel: 'casual' },
      // Scenario 2: Konbini
      { scenarioId: sIds[1], targetText: 'いらっしゃいませ', phonetic: 'Irasshaimase', translation: 'Welcome to the store', category: 'greeting', usageTip: 'You will hear this everywhere. No need to respond — just smile or nod.', formalityLevel: 'polite' },
      { scenarioId: sIds[1], targetText: '___をください', phonetic: '___ o kudasai', translation: 'Please give me ___', category: 'request', usageTip: 'The simplest way to order or request an item. Replace ___ with what you want.', formalityLevel: 'polite' },
      { scenarioId: sIds[1], targetText: 'おみず', phonetic: 'O-mizu', translation: 'Water', category: 'food-drink', usageTip: 'Add o- to mizu for politeness. Omizu kudasai is a natural way to ask for water.', formalityLevel: 'polite' },
      { scenarioId: sIds[1], targetText: 'いっぽん', phonetic: 'Ippon', translation: 'One (bottle/counted item)', category: 'counter', usageTip: 'Japanese uses counters. -hon/-pon/-bon is for long cylindrical items like bottles and pens.', formalityLevel: 'polite' },
      { scenarioId: sIds[1], targetText: 'いくらですか', phonetic: 'Ikura desu ka', translation: 'How much is it?', category: 'question', usageTip: 'Essential for any purchase. Point at the item and say this if you cannot see a price tag.', formalityLevel: 'polite' },
      { scenarioId: sIds[1], targetText: 'ありがとうございます', phonetic: 'Arigatou gozaimasu', translation: 'Thank you very much', category: 'thanks', usageTip: 'Use this when receiving change or your items. The gozaimasu makes it formal.', formalityLevel: 'polite' },
      // Scenario 3: Directions
      { scenarioId: sIds[2], targetText: 'すみません', phonetic: 'Sumimasen', translation: 'Excuse me / Sorry', category: 'polite-expression', usageTip: 'Your most useful word. Use it to get attention, apologize, or say thank you in daily life.', formalityLevel: 'polite' },
      { scenarioId: sIds[2], targetText: 'えきはどこですか', phonetic: 'Eki wa doko desu ka', translation: 'Where is the station?', category: 'question', usageTip: 'Template: replace eki (station) with any destination name.', formalityLevel: 'polite' },
      { scenarioId: sIds[2], targetText: 'みぎ', phonetic: 'Migi', translation: 'Right', category: 'direction', usageTip: 'One of the three key directional words. Practise with: migi (right), hidari (left), massugu (straight).', formalityLevel: 'neutral' },
      { scenarioId: sIds[2], targetText: 'まっすぐ', phonetic: 'Massugu', translation: 'Straight ahead', category: 'direction', usageTip: 'Combine with: massugu itte kudasai (please go straight).', formalityLevel: 'neutral' },
      { scenarioId: sIds[2], targetText: '___までどのくらいですか', phonetic: '___ made dono kurai desu ka', translation: 'How far is it to ___?', category: 'question', usageTip: 'Use this to ask about distance or time to a destination.', formalityLevel: 'polite' },
      // Scenario 4: Medical Clinic
      { scenarioId: sIds[3], targetText: 'どうしましたか', phonetic: 'Dou shimashita ka', translation: 'What is wrong? / What happened?', category: 'medical', usageTip: 'The standard question a doctor or nurse will ask when you arrive.', formalityLevel: 'polite' },
      { scenarioId: sIds[3], targetText: 'ねつがあります', phonetic: 'Netsu ga arimasu', translation: 'I have a fever', category: 'medical', usageTip: 'Use this pattern: ___ ga arimasu (I have ___). Replace netsu with other symptoms.', formalityLevel: 'polite' },
      { scenarioId: sIds[3], targetText: 'のどがいたいです', phonetic: 'Nodo ga itai desu', translation: 'My throat hurts', category: 'medical', usageTip: 'Body part + ga itai desu = my ___ hurts. Extremely useful template.', formalityLevel: 'polite' },
      { scenarioId: sIds[3], targetText: 'くすり', phonetic: 'Kusuri', translation: 'Medicine', category: 'medical', usageTip: 'Used in: kusuri o kudasai (please give me medicine).', formalityLevel: 'neutral' },
      { scenarioId: sIds[3], targetText: 'かぜをひきました', phonetic: 'Kaze o hikimashita', translation: 'I caught a cold', category: 'medical', usageTip: 'The natural way to say you have a cold. Doctors will understand immediately.', formalityLevel: 'polite' },
      // Scenario 5: Restaurant
      { scenarioId: sIds[4], targetText: 'おすすめはなんですか', phonetic: 'Osusume wa nan desu ka', translation: 'What do you recommend?', category: 'dining', usageTip: 'Great for izakaya or restaurants where you want guidance from the staff.', formalityLevel: 'polite' },
      { scenarioId: sIds[4], targetText: '___をください', phonetic: '___ o kudasai', translation: 'Please give me ___', category: 'ordering', usageTip: 'The most common ordering phrase in restaurants. Polite and direct.', formalityLevel: 'polite' },
      { scenarioId: sIds[4], targetText: 'いただきます', phonetic: 'Itadakimasu', translation: 'I humbly receive (said before eating)', category: 'etiquette', usageTip: 'Always say this before the first bite. It expresses gratitude for the food and everyone involved.', formalityLevel: 'polite' },
      { scenarioId: sIds[4], targetText: 'おいしいです', phonetic: 'Oishii desu', translation: 'It is delicious', category: 'dining', usageTip: 'A simple compliment the cook or server will appreciate. Oishii alone is fine too.', formalityLevel: 'polite' },
      { scenarioId: sIds[4], targetText: 'ごちそうさまでした', phonetic: 'Gochisousama deshita', translation: 'Thank you for the meal (after eating)', category: 'etiquette', usageTip: 'Say this when leaving the restaurant or finishing the meal. Staff will often respond with a smile.', formalityLevel: 'polite' },
      // Scenario 6: Supermarket
      { scenarioId: sIds[5], targetText: '___はどこですか', phonetic: '___ wa doko desu ka', translation: 'Where is ___?', category: 'question', usageTip: 'Replace ___ with the item you need. Point at a sign or shelf for extra clarity.', formalityLevel: 'polite' },
      { scenarioId: sIds[5], targetText: 'いくらですか', phonetic: 'Ikura desu ka', translation: 'How much is it?', category: 'shopping', usageTip: 'Point at the price tag or item. Works anywhere.', formalityLevel: 'polite' },
      { scenarioId: sIds[5], targetText: 'ふくろはいりますか', phonetic: 'Fukuro wa irimasu ka', translation: 'Do you need a bag?', category: 'shopping', usageTip: 'The cashier will ask this. Say hai (yes) or iie (no). Bring your own to save ¥3-5.', formalityLevel: 'polite' },
      { scenarioId: sIds[5], targetText: 'かしこまりました', phonetic: 'Kashikomarimashita', translation: 'Certainly / Understood', category: 'polite-expression', usageTip: 'Staff often say this. It means "certainly" — more formal than wakarimashita.', formalityLevel: 'polite' },
      { scenarioId: sIds[5], targetText: 'おかいけい', phonetic: 'O-kaikei', translation: 'Checkout / Bill', category: 'shopping', usageTip: 'You can say o-kaikei onegaishimasu to ask for the bill at a restaurant too.', formalityLevel: 'polite' },
      // Scenario 7: Train Station
      { scenarioId: sIds[6], targetText: '___までおねがいします', phonetic: '___ made onegaishimasu', translation: 'To ___, please (buying a ticket)', category: 'transport', usageTip: 'Say the destination + made + onegaishimasu. Staff will tell you the fare.', formalityLevel: 'polite' },
      { scenarioId: sIds[6], targetText: 'なんばんせん', phonetic: 'Nanbansen', translation: 'What platform number?', category: 'transport', usageTip: 'Ask: ___ wa nanbansen desu ka (what platform for ___?). Critical for train stations.', formalityLevel: 'neutral' },
      { scenarioId: sIds[6], targetText: 'おうふく', phonetic: 'Oufuku', translation: 'Round trip', category: 'transport', usageTip: 'Say oufuku when you want a return ticket. Katamichi is one-way.', formalityLevel: 'neutral' },
      { scenarioId: sIds[6], targetText: 'つぎの___', phonetic: 'Tsugi no ___', translation: 'The next ___', category: 'transport', usageTip: 'Combine with densha (train) or basu (bus) to ask about the next departure.', formalityLevel: 'neutral' },
      // Scenario 8: Hotel
      { scenarioId: sIds[7], targetText: 'よやくしています', phonetic: 'Yoyaku shite imasu', translation: 'I have a reservation', category: 'hotel', usageTip: 'Say this first at check-in. Have your reservation confirmation ready to show.', formalityLevel: 'polite' },
      { scenarioId: sIds[7], targetText: 'にょこう', phonetic: 'Niyokou (haku)', translation: '___ night(s)', category: 'hotel', usageTip: 'Use counter: ippaku (1 night), nihaku (2 nights). Ask: nan-nichi (how many days?).', formalityLevel: 'neutral' },
      { scenarioId: sIds[7], targetText: 'へや', phonetic: 'Heya', translation: 'Room', category: 'hotel', usageTip: 'Used in: heya wa itsu demo daijoubu desu ka (when is check-in).', formalityLevel: 'neutral' },
      { scenarioId: sIds[7], targetText: 'チェックアウト', phonetic: 'Chekkuauto', translation: 'Check-out', category: 'hotel', usageTip: 'English loanword commonly used. Check-in is also chekkuin.', formalityLevel: 'neutral' },
      // Scenario 9: Neighbour
      { scenarioId: sIds[8], targetText: 'おはようございます', phonetic: 'Ohayou gozaimasu', translation: 'Good morning', category: 'greeting', usageTip: 'Use until about 10-11am. Dropping gozaimasu makes it casual.', formalityLevel: 'polite' },
      { scenarioId: sIds[8], targetText: 'こんにちは', phonetic: 'Konnichiwa', translation: 'Hello / Good afternoon', category: 'greeting', usageTip: 'The standard daytime greeting from late morning to evening.', formalityLevel: 'polite' },
      { scenarioId: sIds[8], targetText: 'おげんきですか', phonetic: 'O-genki desu ka', translation: 'How are you?', category: 'greeting', usageTip: 'A polite way to ask about someone\'s wellbeing. Answer: genki desu.', formalityLevel: 'polite' },
      { scenarioId: sIds[8], targetText: 'となり', phonetic: 'Tonari', translation: 'Next door / Neighbour', category: 'location', usageTip: 'Use: tonari ni sunde imasu (I live next door). Great for neighbourhood introductions.', formalityLevel: 'neutral' },
      // Scenario 10: Home Visit
      { scenarioId: sIds[9], targetText: 'おじゃまします', phonetic: 'Ojama shimasu', translation: 'Sorry for intruding (said when entering a home)', category: 'etiquette', usageTip: 'Always say this at the entrance before stepping inside. It is a key politeness marker.', formalityLevel: 'polite' },
      { scenarioId: sIds[9], targetText: 'つまらないものですが', phonetic: 'Tsumaranai mono desu ga', translation: 'This is a small gift (modest expression)', category: 'gift-giving', usageTip: 'The standard humble phrase when presenting a gift. The gift is never actually "boring".', formalityLevel: 'polite' },
      { scenarioId: sIds[9], targetText: 'おちゃはいかがですか', phonetic: 'Ocha wa ikaga desu ka', translation: 'Would you like some tea?', category: 'hospitality', usageTip: 'You will hear this often as a guest. Accept with hai, onegaishimasu.', formalityLevel: 'polite' },
      { scenarioId: sIds[9], targetText: 'すみませんが', phonetic: 'Sumimasen ga', translation: 'Excuse me but...', category: 'polite-expression', usageTip: 'Use this to preface a request or question politely. Softer than just sumimasen.', formalityLevel: 'polite' },
      { scenarioId: sIds[9], targetText: 'ごちそうさまでした', phonetic: 'Gochisousama deshita', translation: 'Thank you for the meal/hospitality', category: 'etiquette', usageTip: 'Say this to the host after a meal. It expresses gratitude for the food and hospitality.', formalityLevel: 'polite' },
      // Scenario 11: Nomikai
      { scenarioId: sIds[10], targetText: 'かんぱい', phonetic: 'Kanpai', translation: 'Cheers!', category: 'social', usageTip: 'Wait for the most senior person to initiate kanpai before drinking. Never start alone.', formalityLevel: 'casual' },
      { scenarioId: sIds[10], targetText: 'おつかれさまです', phonetic: 'Otsukaresama desu', translation: 'Thank you for your hard work (workplace greeting)', category: 'workplace', usageTip: 'The all-purpose workplace greeting. Use it at nomikai to acknowledge colleagues.', formalityLevel: 'polite' },
      { scenarioId: sIds[10], targetText: 'もういっぱい', phonetic: 'Mou ippai', translation: 'One more (drink)', category: 'social', usageTip: 'Say: mou ippai onegaishimasu to order another drink. Slurred slightly is acceptable at nomikai.', formalityLevel: 'casual' },
      { scenarioId: sIds[10], targetText: 'おだいじに', phonetic: 'O-daiji ni', translation: 'Take care (of yourself)', category: 'social', usageTip: 'Use when someone is leaving or if they mention feeling unwell from drinking.', formalityLevel: 'polite' },
      // Scenario 12: Community Welcome Party
      { scenarioId: sIds[11], targetText: 'はじめまして', phonetic: 'Hajimemashite', translation: 'Nice to meet you', category: 'greeting', usageTip: 'Repeat this with each new person you meet. It never gets old at a welcome party.', formalityLevel: 'polite' },
      { scenarioId: sIds[11], targetText: 'どこからきましたか', phonetic: 'Doko kara kimashita ka', translation: 'Where are you from?', category: 'question', usageTip: 'The most common question at international events. Have your answer ready.', formalityLevel: 'polite' },
      { scenarioId: sIds[11], targetText: 'にほんの___がすきです', phonetic: 'Nihon no ___ ga suki desu', translation: 'I like Japanese ___', category: 'expression', usageTip: 'Great conversation starter. Fill in: tabemono (food), eiga (movies), ongaku (music).', formalityLevel: 'polite' },
      { scenarioId: sIds[11], targetText: 'またあいましょう', phonetic: 'Mata aimashou', translation: 'Let\'s meet again', category: 'farewell', usageTip: 'A friendly way to end a conversation. Less formal: mata ne.', formalityLevel: 'polite' },
      // Scenario 13: Job Interview
      { scenarioId: sIds[12], targetText: 'しつれいします', phonetic: 'Shitsurei shimasu', translation: 'Excuse me (entering a room)', category: 'etiquette', usageTip: 'Say this before entering an interview room. Knock first, wait, then enter and say it.', formalityLevel: 'formal' },
      { scenarioId: sIds[12], targetText: 'がんばります', phonetic: 'Ganbarimasu', translation: 'I will do my best', category: 'workplace', usageTip: 'Use this to express determination and commitment. Interviewers love hearing it.', formalityLevel: 'polite' },
      { scenarioId: sIds[12], targetText: 'しごとけいけん', phonetic: 'Shigoto keiken', translation: 'Work experience', category: 'interview', usageTip: 'You may be asked: shigoto keiken wa arimasu ka? (Do you have work experience?)', formalityLevel: 'polite' },
      { scenarioId: sIds[12], targetText: 'よろしくおねがいします', phonetic: 'Yoroshiku onegaishimasu', translation: 'Please treat me favourably', category: 'greeting', usageTip: 'Crucial at the end of an interview. It replaces a "thank you for this opportunity."', formalityLevel: 'formal' },
      // Scenario 14: First Day at Office
      { scenarioId: sIds[13], targetText: 'はじめまして', phonetic: 'Hajimemashite', translation: 'Nice to meet you', category: 'greeting', usageTip: 'Use this with each new colleague during the team introduction.', formalityLevel: 'polite' },
      { scenarioId: sIds[13], targetText: '___せんぱい', phonetic: '___-senpai', translation: 'Senior colleague', category: 'workplace', usageTip: 'Add -senpai to the name of more experienced colleagues. Shows respect for seniority.', formalityLevel: 'polite' },
      { scenarioId: sIds[13], targetText: 'つくえ', phonetic: 'Tsukue', translation: 'Desk', category: 'office', usageTip: 'You may be shown: kochira ga anata no tsukue desu (this is your desk).', formalityLevel: 'neutral' },
      { scenarioId: sIds[13], targetText: 'きゅうけい', phonetic: 'Kyuukei', translation: 'Break', category: 'office', usageTip: 'Ask: kyuukei wa nanji desu ka (what time is break?).', formalityLevel: 'neutral' },
      // Scenario 15: Business Meeting
      { scenarioId: sIds[14], targetText: 'しんこうほうこく', phonetic: 'Shinkou houkoku', translation: 'Progress report', category: 'business', usageTip: 'Say: shinkou houkoku o shimasu (I will give a progress report).', formalityLevel: 'formal' },
      { scenarioId: sIds[14], targetText: 'いじょうです', phonetic: 'Ijō desu', translation: 'That is all / Over to you', category: 'business', usageTip: 'The standard way to end a presentation or update. Signals you are finished.', formalityLevel: 'formal' },
      { scenarioId: sIds[14], targetText: 'ぎょうむ', phonetic: 'Gyoumu', translation: 'Business / Work duties', category: 'business', usageTip: 'Used in formal meeting contexts. E.g.: gyoumu no shinkyou ni tsuite (about work progress).', formalityLevel: 'formal' },
      { scenarioId: sIds[14], targetText: 'はい、わかりました', phonetic: 'Hai, wakarimashita', translation: 'Yes, I understand', category: 'workplace', usageTip: 'The default response to any instruction. Always acknowledge before asking questions.', formalityLevel: 'polite' },
      // Scenario 16: Meishi Exchange
      { scenarioId: sIds[15], targetText: 'めいし', phonetic: 'Meishi', translation: 'Business card', category: 'business', usageTip: 'Always carry meishi. Present with both hands, text facing the recipient.', formalityLevel: 'formal' },
      { scenarioId: sIds[15], targetText: 'ちょうしはいかがですか', phonetic: 'Choushi wa ikaga desu ka', translation: 'How is business?', category: 'business', usageTip: 'A polite conversation starter after exchanging cards. Shows professional interest.', formalityLevel: 'formal' },
      { scenarioId: sIds[15], targetText: 'どうぞ', phonetic: 'Douzo', translation: 'Here you are / Please', category: 'polite-expression', usageTip: 'Say douzo when presenting your card. It means "please, go ahead."', formalityLevel: 'polite' },
      { scenarioId: sIds[15], targetText: 'おたく', phonetic: 'O-taku', translation: 'Your company (polite)', category: 'business', usageTip: 'Use o-taku instead of anata no kaisha in business contexts. Much more polite.', formalityLevel: 'formal' },
      // Scenario 17: Video Conference
      { scenarioId: sIds[16], targetText: 'おはようございます', phonetic: 'Ohayou gozaimasu', translation: 'Good morning', category: 'greeting', usageTip: 'Use at the start of a morning video call even if you are in different time zones.', formalityLevel: 'polite' },
      { scenarioId: sIds[16], targetText: 'こえがきこえますか', phonetic: 'Koe ga kikoemasu ka', translation: 'Can you hear me?', category: 'tech', usageTip: 'Essential for remote meetings. Alternative: mieru (can see) for video issues.', formalityLevel: 'polite' },
      { scenarioId: sIds[16], targetText: 'これが___です', phonetic: 'Kore ga ___ desu', translation: 'This is ___ (while screen sharing)', category: 'presentation', usageTip: 'Use when sharing your screen. Point to the relevant document or chart.', formalityLevel: 'polite' },
      { scenarioId: sIds[16], targetText: 'おつかれさまでした', phonetic: 'Otsukaresama deshita', translation: 'Thank you for your hard work (past tense)', category: 'workplace', usageTip: 'Use at the end of a meeting or work day. The all-purpose thanks for effort.', formalityLevel: 'polite' },
      // Scenario 18: Post Office
      { scenarioId: sIds[17], targetText: 'これをおくりたいです', phonetic: 'Kore o okuritai desu', translation: 'I want to send this', category: 'postal', usageTip: 'Point at your parcel and say this. The clerk will guide you through the rest.', formalityLevel: 'polite' },
      { scenarioId: sIds[17], targetText: 'ふなびん', phonetic: 'Funa-bin', translation: 'Sea mail (surface shipping)', category: 'postal', usageTip: 'Cheapest but slowest (1-3 months). Good for non-urgent parcels.', formalityLevel: 'neutral' },
      { scenarioId: sIds[17], targetText: 'こうくうびん', phonetic: 'Koukuu-bin', translation: 'Airmail', category: 'postal', usageTip: 'Fast but more expensive. Takes about 1 week internationally.', formalityLevel: 'neutral' },
      { scenarioId: sIds[17], targetText: 'おもさ', phonetic: 'Omosa', translation: 'Weight', category: 'postal', usageTip: 'The clerk may ask about weight. Let them weigh it — omosa o hakari ni norete mo ii desu ka?', formalityLevel: 'neutral' },
      // Scenario 19: Bank Account
      { scenarioId: sIds[18], targetText: 'こうざをひらきたいです', phonetic: 'Kouza o hirakitai desu', translation: 'I want to open an account', category: 'banking', usageTip: 'Say this first at the bank counter. Have your residence card (zairyuu card) ready.', formalityLevel: 'polite' },
      { scenarioId: sIds[18], targetText: 'ざいりゅうカード', phonetic: 'Zairyuu kaado', translation: 'Residence card', category: 'banking', usageTip: 'The most important ID in Japan. Required for bank accounts, phone contracts, etc.', formalityLevel: 'neutral' },
      { scenarioId: sIds[18], targetText: 'よきん', phonetic: 'Yokin', translation: 'Deposit / Savings', category: 'banking', usageTip: 'Choose: futsuu yokin (ordinary savings) for everyday accounts.', formalityLevel: 'neutral' },
      { scenarioId: sIds[18], targetText: 'ふりこみ', phonetic: 'Furikomi', translation: 'Bank transfer', category: 'banking', usageTip: 'Ask about: furikomi wa dekimasu ka (can I do transfers?). Standard for salary accounts.', formalityLevel: 'neutral' },
      // Scenario 20: Farewell
      { scenarioId: sIds[19], targetText: 'おせわになりました', phonetic: 'Osewa ni narimashita', translation: 'Thank you for your support/care', category: 'farewell', usageTip: 'The most important farewell phrase. Say this to anyone who helped you — boss, colleagues, mentor.', formalityLevel: 'polite' },
      { scenarioId: sIds[19], targetText: 'さびしいですね', phonetic: 'Sabishii desu ne', translation: 'It\'s sad, isn\'t it?', category: 'farewell', usageTip: 'A natural empathetic response when someone is leaving. Shows emotional connection.', formalityLevel: 'polite' },
      { scenarioId: sIds[19], targetText: 'おたがいにげんきで', phonetic: 'Otagai ni genki de', translation: 'Take care of yourselves', category: 'farewell', usageTip: 'A warm closing phrase. Use when parting ways, especially for long separations.', formalityLevel: 'polite' },
      { scenarioId: sIds[19], targetText: 'いってらっしゃい', phonetic: 'Itterasshai', translation: 'Take care / Have a good one (said to someone leaving)', category: 'farewell', usageTip: 'Say this when someone leaves the office or home. Response: ittekimasu.', formalityLevel: 'polite' },
    ]);

    // ================================================================
    // 3b. LOCALIZATIONS (Luganda — demo-grade native-language UX)
    // ================================================================
    console.log('Inserting Luganda localizations...');
    await db.insert(scenarioLocalizations).values({
      scenarioId: sIds[0],
      languageCode: 'lg',
      title: 'Okutegeeza ne Kuyogaanya okukubiri',
      context: 'Omutabaga owa Uganda akuutuuka mu mwolo gw\'okwaniriza abantu mu Tokyo era alaba Hana, omukugu mu kukolagana n\'amawanga. Okusooka kuno kusaba okwetegeza n\'ebitiibwa: okukuuta, okwogera erinnya lyo, n\'okwagala okubeera mu mikwano egirungi.',
      learningGoals: 'Yiga okukozesa hajimemashite, watashi wa ___ desu, yoroshiku onegaishimasu, n\'enzira ey\'okwetegeza.',
    }).onConflictDoUpdate({
      target: [scenarioLocalizations.scenarioId, scenarioLocalizations.languageCode],
      set: {
        title: 'Okutegeeza ne Kuyogaanya okukubiri',
        context: 'Omutabaga owa Uganda akuutuuka mu mwolo gw\'okwaniriza abantu mu Tokyo era alaba Hana, omukugu mu kukolagana n\'amawanga. Okusooka kuno kusaba okwetegeza n\'ebitiibwa: okukuuta, okwogera erinnya lyo, n\'okwagala okubeera mu mikwano egirungi.',
        learningGoals: 'Yiga okukozesa hajimemashite, watashi wa ___ desu, yoroshiku onegaishimasu, n\'enzira ey\'okwetegeza.',
      },
    });

    const s1LocalizationVocab = await db
      .select({ id: vocabulary.id })
      .from(vocabulary)
      .where(eq(vocabulary.scenarioId, sIds[0]))
      .orderBy(vocabulary.id);

    const lgVocab: Array<[string, string]> = [
      ['Nsanyuse okukutusa', 'Kozesa emirundi emu gyokka, ng\'osooka okutukutusa omuntu.'],
      ['Nze ___', 'Yingira erinnya lyo mu kifo kya ___ we lisangibwa.'],
      ['Nsanyuse okukolagana naawe', 'Ekigambo ekikozesebwa okuggumiza omukwano ng\'omaze okwetegeza.'],
      ['Nva mu Uganda', 'Kozesa \'Nva mu ___\' okwogera n\'ensi gye wava.'],
      ['Erinnya lyo ggwe ani?', 'Ekibuuzo ekipolofu eky\'okubuuza erinnya ly\'omuntu.'],
      ['Nsanyuse', 'Enfaanana enkyusifu ya yoroshiku onegaishimasu.'],
    ];
    await db.insert(vocabularyLocalizations).values(
      s1LocalizationVocab.slice(0, lgVocab.length).map((v, i) => ({
        vocabularyId: v.id,
        languageCode: 'lg',
        translation: lgVocab[i][0],
        usageTip: lgVocab[i][1],
      })),
    ).onConflictDoNothing();

    // ================================================================
    // 4. SCENARIO GOALS (4-6 per scenario)
    // ================================================================
    console.log('Inserting scenario goals...');
    await db.insert(scenarioGoals).values([
      // Scenario 1: First Meeting
      { scenarioId: sIds[0], sequenceOrder: 1, goalType: 'vocabulary', goalText: 'Recognize and use "hajimemashite" as a first-meeting greeting', targetPhrase: 'はじめまして' },
      { scenarioId: sIds[0], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Introduce oneself using "watashi wa ___ desu" with own name', targetPhrase: 'わたしは___です' },
      { scenarioId: sIds[0], sequenceOrder: 3, goalType: 'vocabulary', goalText: 'State country of origin with "___ kara kimashita"', targetPhrase: '〜からきました' },
      { scenarioId: sIds[0], sequenceOrder: 4, goalType: 'phrase_production', goalText: 'Respond with "yoroshiku onegaishimasu" after introduction', targetPhrase: 'よろしくおねがいします' },
      { scenarioId: sIds[0], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Complete a polite self-introduction flowing from opening to closing', targetPhrase: null },
      // Scenario 2: Konbini
      { scenarioId: sIds[1], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Understand "irasshaimase" as store welcome', targetPhrase: 'いらっしゃいませ' },
      { scenarioId: sIds[1], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Request items using "___ o kudasai"', targetPhrase: '〜をください' },
      { scenarioId: sIds[1], sequenceOrder: 3, goalType: 'vocabulary', goalText: 'Use counter "ippon" for bottle-shaped items', targetPhrase: 'いっぽん' },
      { scenarioId: sIds[1], sequenceOrder: 4, goalType: 'phrase_production', goalText: 'Confirm price with "ikura desu ka"', targetPhrase: 'いくらですか' },
      { scenarioId: sIds[1], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Complete a polite purchase exchange including thanks', targetPhrase: null },
      // Scenario 3: Directions
      { scenarioId: sIds[2], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Use "sumimasen" to politely get someone\'s attention', targetPhrase: 'すみません' },
      { scenarioId: sIds[2], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Ask "___ wa doko desu ka" for a location', targetPhrase: '〜はどこですか' },
      { scenarioId: sIds[2], sequenceOrder: 3, goalType: 'vocabulary', goalText: 'Understand directional words: migi, hidari, massugu', targetPhrase: null },
      { scenarioId: sIds[2], sequenceOrder: 4, goalType: 'comprehension', goalText: 'Understand the distance question "___ made dono kurai desu ka"', targetPhrase: '〜までどのくらいですか' },
      { scenarioId: sIds[2], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Use "arigatou gozaimasu" and respond to "dou itashimashite"', targetPhrase: 'ありがとうございます' },
      // Scenario 4: Medical Clinic
      { scenarioId: sIds[3], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Understand "dou shimashita ka" from medical staff', targetPhrase: 'どうしましたか' },
      { scenarioId: sIds[3], sequenceOrder: 2, goalType: 'vocabulary', goalText: 'Describe symptom using "___ ga itai desu" pattern', targetPhrase: '〜がいたいです' },
      { scenarioId: sIds[3], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Say "netsu ga arimasu" to indicate fever', targetPhrase: 'ねつがあります' },
      { scenarioId: sIds[3], sequenceOrder: 4, goalType: 'comprehension', goalText: 'Respond to basic health questions from nurse or doctor', targetPhrase: null },
      { scenarioId: sIds[3], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Complete clinic visit with polite thanks', targetPhrase: null },
      // Scenario 5: Restaurant
      { scenarioId: sIds[4], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Understand "nan o tabemasu ka" or "nan ni shimasu ka"', targetPhrase: 'なにをたべますか' },
      { scenarioId: sIds[4], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Order using "___ o onegaishimasu" or "___ o kudasai"', targetPhrase: '〜をください' },
      { scenarioId: sIds[4], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Ask "osusume wa nan desu ka" for recommendations', targetPhrase: 'おすすめはなんですか' },
      { scenarioId: sIds[4], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Say "itadakimasu" before eating', targetPhrase: 'いただきます' },
      { scenarioId: sIds[4], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Say "gochisousama deshita" after the meal', targetPhrase: 'ごちそうさまでした' },
      // Scenario 6: Supermarket
      { scenarioId: sIds[5], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Ask "___ wa doko desu ka" to locate items', targetPhrase: '〜はどこですか' },
      { scenarioId: sIds[5], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Ask "ikura desu ka" for price', targetPhrase: 'いくらですか' },
      { scenarioId: sIds[5], sequenceOrder: 3, goalType: 'comprehension', goalText: 'Understand "fukuro wa irimasu ka" at checkout', targetPhrase: 'ふくろはいりますか' },
      { scenarioId: sIds[5], sequenceOrder: 4, goalType: 'comprehension', goalText: 'Understand "kashikomarimashita" as confirmation', targetPhrase: 'かしこまりました' },
      { scenarioId: sIds[5], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Complete a polite supermarket checkout interaction', targetPhrase: null },
      // Scenario 7: Train Station
      { scenarioId: sIds[6], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Ask for ticket using "___ made onegaishimasu"', targetPhrase: '〜までおねがいします' },
      { scenarioId: sIds[6], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Ask about platform: "___ wa nanbansen desu ka"', targetPhrase: '〜はなんばんせんですか' },
      { scenarioId: sIds[6], sequenceOrder: 3, goalType: 'vocabulary', goalText: 'Distinguish oufuku (round trip) vs katamichi (one-way)', targetPhrase: 'おうふく' },
      { scenarioId: sIds[6], sequenceOrder: 4, goalType: 'comprehension', goalText: 'Understand departure time information from station staff', targetPhrase: null },
      { scenarioId: sIds[6], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Thank the station staff and proceed correctly', targetPhrase: null },
      // Scenario 8: Hotel
      { scenarioId: sIds[7], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'State "yoyaku shite imasu" to confirm reservation', targetPhrase: 'よやくしています' },
      { scenarioId: sIds[7], sequenceOrder: 2, goalType: 'vocabulary', goalText: 'Use counter "___ haku" for length of stay', targetPhrase: '〜はく' },
      { scenarioId: sIds[7], sequenceOrder: 3, goalType: 'comprehension', goalText: 'Understand check-in and check-out timing information', targetPhrase: null },
      { scenarioId: sIds[7], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Complete hotel check-in with appropriate polite phrases', targetPhrase: null },
      // Scenario 9: Neighbour
      { scenarioId: sIds[8], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Use "ohayou gozaimasu" / "konnichiwa" appropriately', targetPhrase: 'おはようございます' },
      { scenarioId: sIds[8], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Ask "ogenki desu ka" and respond with "genki desu"', targetPhrase: 'おげんきですか' },
      { scenarioId: sIds[8], sequenceOrder: 3, goalType: 'vocabulary', goalText: 'Use "tonari" to indicate neighbour relationship', targetPhrase: 'となり' },
      { scenarioId: sIds[8], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Complete a friendly neighbourly conversation naturally', targetPhrase: null },
      // Scenario 10: Home Visit
      { scenarioId: sIds[9], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Say "ojama shimasu" when entering the home', targetPhrase: 'おじゃまします' },
      { scenarioId: sIds[9], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Present omiyage with "tsumaranai mono desu ga"', targetPhrase: 'つまらないものですが' },
      { scenarioId: sIds[9], sequenceOrder: 3, goalType: 'comprehension', goalText: 'Respond to "ocha wa ikaga desu ka" appropriately', targetPhrase: 'おちゃはいかがですか' },
      { scenarioId: sIds[9], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Practice home-visit etiquette and closing', targetPhrase: null },
      { scenarioId: sIds[9], sequenceOrder: 5, goalType: 'cultural', goalText: 'Demonstrate understanding of omotenashi hospitality culture', targetPhrase: null },
      // Scenario 11: Nomikai
      { scenarioId: sIds[10], sequenceOrder: 1, goalType: 'vocabulary', goalText: 'Participate in "kanpai" toast at the right moment', targetPhrase: 'かんぱい' },
      { scenarioId: sIds[10], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Use "otsukaresama desu" when greeting colleagues', targetPhrase: 'おつかれさまです' },
      { scenarioId: sIds[10], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Order another drink with "mou ippai onegaishimasu"', targetPhrase: 'もういっぱいおねがいします' },
      { scenarioId: sIds[10], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Navigate the opening to closing flow of nomikai', targetPhrase: null },
      { scenarioId: sIds[10], sequenceOrder: 5, goalType: 'cultural', goalText: 'Demonstrate understanding of nomikai social hierarchy and etiquette', targetPhrase: null },
      // Scenario 12: Community Welcome Party
      { scenarioId: sIds[11], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Initiate with "hajimemashite" confidently to new people', targetPhrase: 'はじめまして' },
      { scenarioId: sIds[11], sequenceOrder: 2, goalType: 'comprehension', goalText: 'Understand and answer "doko kara kimashita ka"', targetPhrase: 'どこからきましたか' },
      { scenarioId: sIds[11], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Share interests with "nihon no ___ ga suki desu"', targetPhrase: 'にほんの〜がすきです' },
      { scenarioId: sIds[11], sequenceOrder: 4, goalType: 'phrase_production', goalText: 'Close exchanges with "mata aimashou"', targetPhrase: 'またあいましょう' },
      { scenarioId: sIds[11], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Complete a multi-person introduction circuit', targetPhrase: null },
      // Scenario 13: Job Interview
      { scenarioId: sIds[12], sequenceOrder: 1, goalType: 'vocabulary', goalText: 'Use "shitsurei shimasu" upon entering the interview room', targetPhrase: 'しつれいします' },
      { scenarioId: sIds[12], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Express motivation with "ganbarimasu" and related phrases', targetPhrase: 'がんばります' },
      { scenarioId: sIds[12], sequenceOrder: 3, goalType: 'comprehension', goalText: 'Answer questions about work experience and background', targetPhrase: null },
      { scenarioId: sIds[12], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Close the interview with formal thanks and bow', targetPhrase: null },
      { scenarioId: sIds[12], sequenceOrder: 5, goalType: 'cultural', goalText: 'Demonstrate understanding of Japanese interview etiquette (bows, seating, timing)', targetPhrase: null },
      // Scenario 14: First Day
      { scenarioId: sIds[13], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Greet new colleagues with "hajimemashite" and self-introduction', targetPhrase: 'はじめまして' },
      { scenarioId: sIds[13], sequenceOrder: 2, goalType: 'vocabulary', goalText: 'Use "-senpai" appropriately for senior colleagues', targetPhrase: '〜せんぱい' },
      { scenarioId: sIds[13], sequenceOrder: 3, goalType: 'vocabulary', goalText: 'Understand office vocabulary: tsukue, kaigi, kyuukei', targetPhrase: null },
      { scenarioId: sIds[13], sequenceOrder: 4, goalType: 'comprehension', goalText: 'Understand workspace orientation information', targetPhrase: null },
      { scenarioId: sIds[13], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Complete a smooth first day interaction cycle', targetPhrase: null },
      // Scenario 15: Business Meeting
      { scenarioId: sIds[14], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Begin meeting participation with proper greeting', targetPhrase: null },
      { scenarioId: sIds[14], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Deliver a progress report using "shinkou houkoku" vocabulary', targetPhrase: 'しんこうほうこく' },
      { scenarioId: sIds[14], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'End an update with "ijou desu"', targetPhrase: 'いじょうです' },
      { scenarioId: sIds[14], sequenceOrder: 4, goalType: 'phrase_production', goalText: 'Respond to manager questions with "hai, wakarimashita"', targetPhrase: 'はい、わかりました' },
      { scenarioId: sIds[14], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Use keigo appropriately with superiors in the meeting', targetPhrase: null },
      // Scenario 16: Meishi Exchange
      { scenarioId: sIds[15], sequenceOrder: 1, goalType: 'cultural', goalText: 'Present meishi with both hands and correct orientation', targetPhrase: 'めいし' },
      { scenarioId: sIds[15], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Respond with "choushi wa ikaga desu ka" after receiving card', targetPhrase: 'ちょうしはいかがですか' },
      { scenarioId: sIds[15], sequenceOrder: 3, goalType: 'vocabulary', goalText: 'Use "o-taku" to refer to the other person\'s company', targetPhrase: 'おたく' },
      { scenarioId: sIds[15], sequenceOrder: 4, goalType: 'phrase_production', goalText: 'Say "douzo" when presenting own card', targetPhrase: 'どうぞ' },
      { scenarioId: sIds[15], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Complete a full meishi exchange cycle politely', targetPhrase: null },
      // Scenario 17: Video Conference
      { scenarioId: sIds[16], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Greet remote team with "ohayou gozaimasu"', targetPhrase: 'おはようございます' },
      { scenarioId: sIds[16], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Handle screen share with "kore ga ___ desu"', targetPhrase: 'これが〜です' },
      { scenarioId: sIds[16], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Handle technical issues with "koe ga kikoemasu ka"', targetPhrase: 'こえがきこえますか' },
      { scenarioId: sIds[16], sequenceOrder: 4, goalType: 'phrase_production', goalText: 'Close the call with "otsukaresama deshita"', targetPhrase: 'おつかれさまでした' },
      { scenarioId: sIds[16], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Demonstrate proper video meeting etiquette (timing, mute, camera)', targetPhrase: null },
      // Scenario 18: Post Office
      { scenarioId: sIds[17], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Say "kore o okuritai desu" to start the transaction', targetPhrase: 'これを おくりたいです' },
      { scenarioId: sIds[17], sequenceOrder: 2, goalType: 'vocabulary', goalText: 'Distinguish funa-bin vs koukuu-bin shipping', targetPhrase: 'ふなびん' },
      { scenarioId: sIds[17], sequenceOrder: 3, goalType: 'comprehension', goalText: 'Understand weight and address confirmation questions', targetPhrase: null },
      { scenarioId: sIds[17], sequenceOrder: 4, goalType: 'vocabulary', goalText: 'Fill out customs form with basic information', targetPhrase: null },
      { scenarioId: sIds[17], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Complete a post office transaction politely', targetPhrase: null },
      // Scenario 19: Bank Account
      { scenarioId: sIds[18], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Request "kouza o hirakitai desu" at the bank', targetPhrase: 'こうざを ひらきたいです' },
      { scenarioId: sIds[18], sequenceOrder: 2, goalType: 'vocabulary', goalText: 'Present "zairyuu kaado" as identification', targetPhrase: 'ざいりゅうカード' },
      { scenarioId: sIds[18], sequenceOrder: 3, goalType: 'vocabulary', goalText: 'Understand basic banking terms: yokin, furikomi', targetPhrase: null },
      { scenarioId: sIds[18], sequenceOrder: 4, goalType: 'comprehension', goalText: 'Understand application form instructions', targetPhrase: null },
      { scenarioId: sIds[18], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Complete bank application with polite closing', targetPhrase: null },
      // Scenario 20: Farewell
      { scenarioId: sIds[19], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Express "osewa ni narimashita" with gratitude', targetPhrase: 'おせわになりました' },
      { scenarioId: sIds[19], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Use "sabishii desu ne" to empathize naturally', targetPhrase: 'さびしいですね' },
      { scenarioId: sIds[19], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Say "otagai ni genki de" as a warm closing', targetPhrase: 'おたがいにげんきで' },
      { scenarioId: sIds[19], sequenceOrder: 4, goalType: 'vocabulary', goalText: 'Use "itterasshai" / "ittekimasu" pair appropriately', targetPhrase: 'いってらっしゃい' },
      { scenarioId: sIds[19], sequenceOrder: 5, goalType: 'social_closing', goalText: 'Deliver a complete and heartfelt farewell speech', targetPhrase: null },
    ]);

    // ================================================================
    // 5. EXAMPLE SESSIONS with full data
    // ================================================================
    console.log('Inserting example sessions and conversation data...');

    // Session 1: Lynnette plays Scenario 1 (First Meeting)
const [s1Row] = await db.insert(sessions).values({
      userId: userMap['Lynnette'],
      scenarioId: sIds[0],
      sessionNumber: 1,
      status: 'completed',
      totalTurns: 3,
      vocabularyScore: 28,
      grammarScore: 22,
      fluencyScore: 19,
      culturalScore: 15,
      taskScore: 10,
      feedback: 'Lynnette demonstrated excellent self-introduction skills.',
      completedAt: new Date(),
    }).returning();

    const s1Turn1Ai = await db.insert(conversations).values({
      sessionId: s1Row.id, turnNo: 1, speaker: 'ai',
      messageTarget: 'はじめまして！私はハナです。日本へようこそ！お名前は何ですか？',
      messagePhonetic: 'Hajimemashite! Watashi wa Hana desu. Nihon e youkoso! O-namae wa nan desu ka?',
      messageNative: 'Nice to meet you! I am Hana. Welcome to Japan! What is your name?',
      emotionTone: 'warm-friendly', gestureHint: 'slight bow with a welcoming smile',
      isValidInContext: true,
    }).returning();

    const s1Turn1User = await db.insert(conversations).values({
      sessionId: s1Row.id, turnNo: 1, speaker: 'user',
      messageTarget: 'はじめまして。リネットです。ウガンダから来ました。よろしくおねがいします！',
      messagePhonetic: 'Hajimemashite. Rinetto desu. Uganda kara kimashita. Yoroshiku onegaishimasu!',
      messageNative: 'Nice to meet you. I\'m Lynnette. I came from Uganda. Pleased to meet you!',
      emotionTone: 'polite-enthusiastic', gestureHint: null,
      isEnglishWhenExpected: false, isValidInContext: true,
    }).returning();

    // Correction: user wrote "Rinetto" which is the correct katakana approximation
    await db.insert(corrections).values({
      conversationId: s1Turn1User[0].id,
      correctionType: 'romaji_spelling',
      originalText: 'Rinetto',
      correctedText: 'Rinetto (correct)',
      explanation: 'Your name in katakana is perfectly written. Rinetto follows the standard katakana pattern for Lynnette.',
      severity: 'minor',
    });

    const s1Turn2Ai = await db.insert(conversations).values({
      sessionId: s1Row.id, turnNo: 2, speaker: 'ai',
      messageTarget: 'リネットさん、はじめまして！ウガンダからなんですね。どんなことを勉強していますか？',
      messagePhonetic: 'Rinetto-san, hajimemashite! Uganda kara nan desu ne. Donna koto o benkyou shite imasu ka?',
      messageNative: 'Lynnette, nice to meet you! So you are from Uganda. What are you studying?',
      emotionTone: 'curious-engaged', gestureHint: 'tilts head slightly with interest',
      isValidInContext: true,
    }).returning();

    const s1Turn2User = await db.insert(conversations).values({
      sessionId: s1Row.id, turnNo: 2, speaker: 'user',
      messageTarget: 'にほんごを勉強しています。はなすことがすきです。',
      messagePhonetic: 'Nihongo o benkyou shite imasu. Hanasu koto ga suki desu.',
      messageNative: 'I am studying Japanese. I like speaking.',
      emotionTone: 'eager', gestureHint: null,
      isEnglishWhenExpected: false, isValidInContext: true,
    }).returning();

    await db.insert(corrections).values({
      conversationId: s1Turn2User[0].id,
      correctionType: 'particle_usage',
      originalText: 'はなすことがすきです',
      correctedText: '話すことが好きです',
      explanation: 'Your particle usage is correct! "Koto ga suki" is the right way to say you like doing something.',
      severity: 'minor',
    });

    const s1Turn3Ai = await db.insert(conversations).values({
      sessionId: s1Row.id, turnNo: 3, speaker: 'ai',
      messageTarget: '素晴らしいです！日本語で話すのはとても楽しいですね。今日は会えて本当に嬉しかったです。また会いましょう！',
      messagePhonetic: 'Subarashii desu! Nihongo de hanasu no wa totemo tanoshii desu ne. Kyou wa aete hontou ni ureshikatta desu. Mata aimashou!',
      messageNative: 'Wonderful! Speaking in Japanese is very fun, isn\'t it? I was truly happy to meet you today. Let\'s meet again!',
      emotionTone: 'warm-encouraging', gestureHint: 'small bow with both hands clasped',
      isValidInContext: true,
    }).returning();

    const s1Turn3User = await db.insert(conversations).values({
      sessionId: s1Row.id, turnNo: 3, speaker: 'user',
      messageTarget: 'ありがとうございました！またあいましょう。',
      messagePhonetic: 'Arigatou gozaimashita! Mata aimashou.',
      messageNative: 'Thank you very much! Let\'s meet again.',
      emotionTone: 'grateful', gestureHint: null,
      isEnglishWhenExpected: false, isValidInContext: true,
    }).returning();

    // Goal completions for Session 1
    const s1Goals = await db.select({ id: scenarioGoals.id, seq: scenarioGoals.sequenceOrder })
      .from(scenarioGoals).where(eq(scenarioGoals.scenarioId, sIds[0]));
    const s1GoalMap = new Map(s1Goals.map(g => [g.seq, g.id]));
    await db.insert(goalCompletions).values([
      { sessionId: s1Row.id, conversationId: s1Turn1User[0].id, scenarioGoalId: s1GoalMap.get(1)!, achieved: true, evidenceNote: 'Used hajimemashite correctly in turn 1' },
      { sessionId: s1Row.id, conversationId: s1Turn1User[0].id, scenarioGoalId: s1GoalMap.get(2)!, achieved: true, evidenceNote: 'Introduced herself as "Rinetto desu"' },
      { sessionId: s1Row.id, conversationId: s1Turn1User[0].id, scenarioGoalId: s1GoalMap.get(3)!, achieved: true, evidenceNote: 'Stated origin with "Uganda kara kimashita"' },
      { sessionId: s1Row.id, conversationId: s1Turn1User[0].id, scenarioGoalId: s1GoalMap.get(4)!, achieved: true, evidenceNote: 'Used "yoroshiku onegaishimasu" to close introduction' },
      { sessionId: s1Row.id, conversationId: s1Turn3User[0].id, scenarioGoalId: s1GoalMap.get(5)!, achieved: true, evidenceNote: 'Completed the conversation flow with "mata aimashou"' },
    ]);

    await db.insert(evaluations).values({
      sessionId: s1Row.id, vocabularyScore: 28, grammarScore: 22, fluencyScore: 19,
      culturalScore: 15, taskScore: 10,
      feedback: 'Lynnette passed with distinction! Her self-introduction was natural and culturally appropriate. The polite register was maintained throughout.',
    });

    // Session 2: Aaron plays Scenario 2 (Konbini)
    const [s2Row] = await db.insert(sessions).values({
      userId: userMap['Aaron'],
      scenarioId: sIds[1],
      sessionNumber: 1,
      status: 'completed',
      totalTurns: 2,
      vocabularyScore: 20,
      grammarScore: 18,
      fluencyScore: 14,
      culturalScore: 10,
      taskScore: 8,
      feedback: 'Aaron demonstrated basic konbini vocabulary. Needs to practice counter words and polite purchase completion.',
      completedAt: new Date(),
    }).returning();

    const s2Turn1Ai = await db.insert(conversations).values({
      sessionId: s2Row.id, turnNo: 1, speaker: 'ai',
      messageTarget: 'いらっしゃいませ！何をお探しですか？',
      messagePhonetic: 'Irasshaimase! Nani o osagashi desu ka?',
      messageNative: 'Welcome! What are you looking for?',
      emotionTone: 'cheerful-service', gestureHint: 'friendly nod from behind the counter',
      isValidInContext: true,
    }).returning();

    const s2Turn1User = await db.insert(conversations).values({
      sessionId: s2Row.id, turnNo: 1, speaker: 'user',
      messageTarget: 'おみずをください。',
      messagePhonetic: 'O-mizu o kudasai.',
      messageNative: 'Please give me water.',
      emotionTone: 'polite', gestureHint: null,
      isEnglishWhenExpected: false, isValidInContext: true,
    }).returning();

    const s2Turn2Ai = await db.insert(conversations).values({
      sessionId: s2Row.id, turnNo: 2, speaker: 'ai',
      messageTarget: 'かしこまりました。１本でよろしいですか？',
      messagePhonetic: 'Kashikomarimashita. Ippon de yoroshii desu ka?',
      messageNative: 'Certainly. Is one bottle okay?',
      emotionTone: 'polite-service', gestureHint: 'reaches toward the drink cooler',
      isValidInContext: true,
    }).returning();

    const s2Turn2User = await db.insert(conversations).values({
      sessionId: s2Row.id, turnNo: 2, speaker: 'user',
      messageTarget: 'はい、いっぽんください。',
      messagePhonetic: 'Hai, ippon kudasai.',
      messageNative: 'Yes, one bottle please.',
      emotionTone: 'certain', gestureHint: null,
      isEnglishWhenExpected: false, isValidInContext: true,
    }).returning();

    await db.insert(corrections).values({
      conversationId: s2Turn2User[0].id,
      correctionType: 'grammar',
      originalText: 'いっぽんください',
      correctedText: 'いっぽんください (correct)',
      explanation: 'Perfect use of the counter "ippon" for a bottle. Your confirmation was clear and polite.',
      severity: 'minor',
    });

    const s2Goals = await db.select({ id: scenarioGoals.id, seq: scenarioGoals.sequenceOrder })
      .from(scenarioGoals).where(eq(scenarioGoals.scenarioId, sIds[1]));
    const s2GoalMap = new Map(s2Goals.map(g => [g.seq, g.id]));
    await db.insert(goalCompletions).values([
      { sessionId: s2Row.id, conversationId: s2Turn1User[0].id, scenarioGoalId: s2GoalMap.get(1)!, achieved: true, evidenceNote: 'Understood irasshaimase greeting' },
      { sessionId: s2Row.id, conversationId: s2Turn1User[0].id, scenarioGoalId: s2GoalMap.get(2)!, achieved: true, evidenceNote: 'Used "o-mizu o kudasai" to request' },
      { sessionId: s2Row.id, conversationId: s2Turn2User[0].id, scenarioGoalId: s2GoalMap.get(3)!, achieved: true, evidenceNote: 'Used "ippon" as counter for bottle' },
    ]);

    await db.insert(evaluations).values({
      sessionId: s2Row.id, vocabularyScore: 20, grammarScore: 18, fluencyScore: 14,
      culturalScore: 10, taskScore: 8,
      feedback: 'Aaron completed the konbini transaction successfully. The request and confirmation were clear. More practice with polite closing would strengthen the interaction.',
    });

    // Session 3: Desire plays Scenario 13 (Job Interview) - intermediate
    const [s3Row] = await db.insert(sessions).values({
      userId: userMap['Desire'],
      scenarioId: sIds[12],
      sessionNumber: 1,
      status: 'completed',
      totalTurns: 4,
      vocabularyScore: 25,
      grammarScore: 20,
      fluencyScore: 16,
      culturalScore: 13,
      taskScore: 9,
      feedback: 'Desire demonstrated solid keigo usage during the interview. Good understanding of formal register, though some verb conjugations need refinement.',
      completedAt: new Date(),
    }).returning();

    const s3Turn1Ai = await db.insert(conversations).values({
      sessionId: s3Row.id, turnNo: 1, speaker: 'ai',
      messageTarget: 'どうぞお入りください。初めまして、採用担当の田中と申します。よろしくお願いいたします。',
      messagePhonetic: 'Douzo o-hairi kudasai. Hajimemashite, saiyou tantou no Tanaka to moushimasu. Yoroshiku onegai itashimasu.',
      messageNative: 'Please come in. Nice to meet you, I am Tanaka from recruitment. Pleased to meet you.',
      emotionTone: 'formal-respectful', gestureHint: 'gestures to the seat with open hand',
      isValidInContext: true,
    }).returning();

    const s3Turn1User = await db.insert(conversations).values({
      sessionId: s3Row.id, turnNo: 1, speaker: 'user',
      messageTarget: '失礼します。初めまして、デザイアと申します。本日はお時間をいただきありがとうございます。よろしくお願いいたします。',
      messagePhonetic: 'Shitsurei shimasu. Hajimemashite, Dezaia to moushimasu. Honjitsu wa o-jikan o itadaki arigatou gozaimasu. Yoroshiku onegai itashimasu.',
      messageNative: 'Excuse me. Nice to meet you, I am Desire. Thank you for giving me your time today. Pleased to meet you.',
      emotionTone: 'formal-humble', gestureHint: 'slight bow while standing',
      isEnglishWhenExpected: false, isValidInContext: true,
    }).returning();

    await db.insert(corrections).values({
      conversationId: s3Turn1User[0].id,
      correctionType: 'verb_conjugation',
      originalText: 'いただきありがとうございます',
      correctedText: 'いただきありがとうございます (correct in context)',
      explanation: 'Good use of humble form "itadaki"! For extra formality in interviews, "itadakimashite" works too.',
      severity: 'minor',
    });

    const s3Turn2Ai = await db.insert(conversations).values({
      sessionId: s3Row.id, turnNo: 2, speaker: 'ai',
      messageTarget: 'デザイアさん、これまでの職歴について教えていただけますか？',
      messagePhonetic: 'Dezaia-san, kore made no shokureki ni tsuite oshiete itadakemasu ka?',
      messageNative: 'Desire, could you tell me about your work experience so far?',
      emotionTone: 'polite-interview', gestureHint: 'sits forward with poised posture',
      isValidInContext: true,
    }).returning();

    const s3Turn2User = await db.insert(conversations).values({
      sessionId: s3Row.id, turnNo: 2, speaker: 'user',
      messageTarget: 'はい。ウガンダで３年間、日本語を使ったカスタマーサポートの仕事をしていました。',
      messagePhonetic: 'Hai. Uganda de san-nenkan, nihongo o tsukatta kasutamaa sapooto no shigoto o shite imashita.',
      messageNative: 'Yes. For three years in Uganda, I was doing customer support work using Japanese.',
      emotionTone: 'professional-confident', gestureHint: null,
      isEnglishWhenExpected: false, isValidInContext: true,
    }).returning();

    const s3Turn3Ai = await db.insert(conversations).values({
      sessionId: s3Row.id, turnNo: 3, speaker: 'ai',
      messageTarget: 'なるほど。では、日本語で仕事をする上で、一番大切だと思うことは何ですか？',
      messagePhonetic: 'Naruhodo. Dewa, nihongo de shigoto o suru ue de, ichiban taisetsu da to omou koto wa nan desu ka?',
      messageNative: 'I see. So, what do you think is the most important thing when working in Japanese?',
      emotionTone: 'thoughtful-probing', gestureHint: 'nods slowly while listening',
      isValidInContext: true,
    }).returning();

    const s3Turn3User = await db.insert(conversations).values({
      sessionId: s3Row.id, turnNo: 3, speaker: 'user',
      messageTarget: 'コミュニケーションだと思います。正しい敬語を使うことと、相手の気持ちを理解することが大事です。',
      messagePhonetic: 'Komyunikeeshon da to omoimasu. Tadashii keigo o tsukau koto to, aite no kimochi o rikai suru koto ga daiji desu.',
      messageNative: 'I think communication is. Using correct keigo and understanding the other person\'s feelings are important.',
      emotionTone: 'thoughtful-sincere', gestureHint: null,
      isEnglishWhenExpected: false, isValidInContext: true,
    }).returning();

    const s3Turn4Ai = await db.insert(conversations).values({
      sessionId: s3Row.id, turnNo: 4, speaker: 'ai',
      messageTarget: '素晴らしい考えですね。では、最後に—この会社でどんなことを実現したいですか？',
      messagePhonetic: 'Subarashii kangae desu ne. Dewa, saigo ni — kono kaisha de donna koto o jitsugen shitai desu ka?',
      messageNative: 'That\'s a wonderful perspective. Then, finally — what do you want to achieve at this company?',
      emotionTone: 'impressed-warm', gestureHint: 'smiles appreciatively',
      isValidInContext: true,
    }).returning();

    const s3Turn4User = await db.insert(conversations).values({
      sessionId: s3Row.id, turnNo: 4, speaker: 'user',
      messageTarget: 'はい。日本のIT技術を学んで、ウガンダと日本の架け橋になりたいです。がんばります！',
      messagePhonetic: 'Hai. Nihon no IT gijutsu o manande, Uganda to Nihon no kakehashi ni naritai desu. Ganbarimasu!',
      messageNative: 'Yes. I want to learn Japanese IT technology and become a bridge between Uganda and Japan. I will do my best!',
      emotionTone: 'determined-aspiring', gestureHint: 'small determined nod',
      isEnglishWhenExpected: false, isValidInContext: true,
    }).returning();

    await db.insert(corrections).values({
      conversationId: s3Turn4User[0].id,
      correctionType: 'vocabulary',
      originalText: 'か...け...は...し？',
      correctedText: '架け橋 (kakehashi) - bridge',
      explanation: '"Kakehashi" (bridge) is a beautiful metaphor here. Your pronunciation was clear — keep using this word!',
      severity: 'minor',
    });

    const s3Goals = await db.select({ id: scenarioGoals.id, seq: scenarioGoals.sequenceOrder })
      .from(scenarioGoals).where(eq(scenarioGoals.scenarioId, sIds[12]));
    const s3GoalMap = new Map(s3Goals.map(g => [g.seq, g.id]));
    await db.insert(goalCompletions).values([
      { sessionId: s3Row.id, conversationId: s3Turn1User[0].id, scenarioGoalId: s3GoalMap.get(1)!, achieved: true, evidenceNote: 'Said "shitsurei shimasu" upon entering' },
      { sessionId: s3Row.id, conversationId: s3Turn4User[0].id, scenarioGoalId: s3GoalMap.get(2)!, achieved: true, evidenceNote: 'Expressed "ganbarimasu" showing determination' },
      { sessionId: s3Row.id, conversationId: s3Turn2User[0].id, scenarioGoalId: s3GoalMap.get(3)!, achieved: true, evidenceNote: 'Answered work experience question clearly' },
      { sessionId: s3Row.id, conversationId: s3Turn4User[0].id, scenarioGoalId: s3GoalMap.get(4)!, achieved: true, evidenceNote: 'Closed interview with polite expression' },
      { sessionId: s3Row.id, conversationId: s3Turn1User[0].id, scenarioGoalId: s3GoalMap.get(5)!, achieved: true, evidenceNote: 'Demonstrated interview etiquette throughout' },
    ]);

    await db.insert(evaluations).values({
      sessionId: s3Row.id, vocabularyScore: 25, grammarScore: 20, fluencyScore: 16,
      culturalScore: 13, taskScore: 9,
      feedback: 'Desire demonstrated strong interview skills. The keigo usage was appropriate and natural. The bridge metaphor (kakehashi) was culturally resonant and showed advanced communication instinct.',
    });

    // Session 4: Derrick plays Scenario 5 (Restaurant) - beginner
    const [s4Row] = await db.insert(sessions).values({
      userId: userMap['Derrick'],
      scenarioId: sIds[4],
      sessionNumber: 1,
      status: 'completed',
      totalTurns: 2,
      vocabularyScore: 18,
      grammarScore: 15,
      fluencyScore: 12,
      culturalScore: 8,
      taskScore: 7,
      feedback: 'Derrick managed the basic ordering flow but should practice itadakimasu and gochisousama. The core vocabulary request was functional.',
      completedAt: new Date(),
    }).returning();

    const s4Turn1Ai = await db.insert(conversations).values({
      sessionId: s4Row.id, turnNo: 1, speaker: 'ai',
      messageTarget: 'いらっしゃいませ！何名様ですか？',
      messagePhonetic: 'Irasshaimase! Nan-mei-sama desu ka?',
      messageNative: 'Welcome! How many people?',
      emotionTone: 'cheerful', gestureHint: 'holds out menu with both hands',
      isValidInContext: true,
    }).returning();

    const s4Turn1User = await db.insert(conversations).values({
      sessionId: s4Row.id, turnNo: 1, speaker: 'user',
      messageTarget: 'ひとりです。メニューを見せてください。',
      messagePhonetic: 'Hitori desu. Menyuu o misete kudasai.',
      messageNative: 'I\'m alone. Please show me the menu.',
      emotionTone: 'polite', gestureHint: null,
      isEnglishWhenExpected: false, isValidInContext: true,
    }).returning();

    const s4Turn2Ai = await db.insert(conversations).values({
      sessionId: s4Row.id, turnNo: 2, speaker: 'ai',
      messageTarget: 'かしこまりました。こちらがメニューでございます。ご注文がお決まりになりましたらお呼びください。',
      messagePhonetic: 'Kashikomarimashita. Kochira ga menyuu de gozaimasu. Go-chuumon ga o-kimari ni narimashitara o-yobi kudasai.',
      messageNative: 'Certainly. Here is our menu. Please call me when you have decided your order.',
      emotionTone: 'polite-service', gestureHint: 'places menu on table with both hands',
      isValidInContext: true,
    }).returning();

    const s4Turn2User = await db.insert(conversations).values({
      sessionId: s4Row.id, turnNo: 2, speaker: 'user',
      messageTarget: 'すみません、注文してもいいですか？ラーメンをください。',
      messagePhonetic: 'Sumimasen, chuumon shite mo ii desu ka? Raamen o kudasai.',
      messageNative: 'Excuse me, may I order? Please give me ramen.',
      emotionTone: 'polite', gestureHint: null,
      isEnglishWhenExpected: false, isValidInContext: true,
    }).returning();

    await db.insert(corrections).values({
      conversationId: s4Turn2User[0].id,
      correctionType: 'politeness_level',
      originalText: '注文してもいいですか',
      correctedText: '注文してもよろしいですか',
      explanation: 'In a restaurant, "yoi desu ka" is slightly more polite than "ii desu ka". Both are fine, but "yoi" sounds more refined.',
      severity: 'minor',
    });

    const s4Goals = await db.select({ id: scenarioGoals.id, seq: scenarioGoals.sequenceOrder })
      .from(scenarioGoals).where(eq(scenarioGoals.scenarioId, sIds[4]));
    const s4GoalMap = new Map(s4Goals.map(g => [g.seq, g.id]));
    await db.insert(goalCompletions).values([
      { sessionId: s4Row.id, conversationId: s4Turn1User[0].id, scenarioGoalId: s4GoalMap.get(1)!, achieved: true, evidenceNote: 'Understood service greeting' },
      { sessionId: s4Row.id, conversationId: s4Turn2User[0].id, scenarioGoalId: s4GoalMap.get(2)!, achieved: true, evidenceNote: 'Ordered using "raamen o kudasai"' },
    ]);

    await db.insert(evaluations).values({
      sessionId: s4Row.id, vocabularyScore: 18, grammarScore: 15, fluencyScore: 12,
      culturalScore: 8, taskScore: 7,
      feedback: 'Derrick successfully completed the ordering process. The request structure was correct. Future focus: pre-meal and post-meal etiquette phrases (itadakimasu, gochisousama).',
    });

    // Vocabulary encounters for Session 1
    const s1Vocab = await db.select({ id: vocabulary.id })
      .from(vocabulary).where(eq(vocabulary.scenarioId, sIds[0])).limit(3);
    await db.insert(vocabularyEncounters).values([
      { sessionId: s1Row.id, conversationId: s1Turn1User[0].id, vocabularyId: s1Vocab[0].id, usedCorrectly: true },
      { sessionId: s1Row.id, conversationId: s1Turn1User[0].id, vocabularyId: s1Vocab[1].id, usedCorrectly: true },
      { sessionId: s1Row.id, conversationId: s1Turn1User[0].id, vocabularyId: s1Vocab[2].id, usedCorrectly: true },
    ]);

    // Vocabulary encounters for Session 2
    const s2Vocab = await db.select({ id: vocabulary.id })
      .from(vocabulary).where(eq(vocabulary.scenarioId, sIds[1])).limit(2);
    await db.insert(vocabularyEncounters).values([
      { sessionId: s2Row.id, conversationId: s2Turn1User[0].id, vocabularyId: s2Vocab[0].id, usedCorrectly: true },
      { sessionId: s2Row.id, conversationId: s2Turn1User[0].id, vocabularyId: s2Vocab[1].id, usedCorrectly: true },
    ]);

    console.log('Inserting localizations (English-first sample)...');
    await db.insert(scenarioLocalizations).values([{
      scenarioId: sIds[0],
      languageCode: 'lg',
      title: 'Okutegeeza ne Kuyogaanya okukubiri',
      context: 'Eno ye nteekateeka eya Luganda. Muyiga okwogera n Olujapani mu nteekateeka eno.',
      learningGoals: 'Yiga okutegeeza, okubuza amannya n okulangirira mu Luganda ne mu Olujapani.',
      aiCharacterName: 'Hana',
      aiCharacterRole: 'Omuyigiriza w Olulimi',
      userCharacterName: 'Omuweza',
      userCharacterRole: 'Omunyigirizi w Olulimi',
    }]).onConflictDoNothing();

    const lgLocalizedVocab = await db.select({ id: vocabulary.id })
      .from(vocabulary).where(eq(vocabulary.scenarioId, sIds[0])).limit(2);
    if (lgLocalizedVocab.length > 0) {
      await db.insert(vocabularyLocalizations).values([
        { vocabularyId: lgLocalizedVocab[0].id, languageCode: 'lg', translation: 'Nsanyuse okukutukirirako (okulabirirako okusooka)', usageTip: 'Ekigambo kino kikozesebwa ku mulundi gw okusooka okusisinkana omuntu.' },
      ]).onConflictDoNothing();
    }

    // ================================================================
    // 6. COUNTRIES (country-native layer)
    // ================================================================
    console.log('Inserting countries...');
    await db.insert(countries).values([
      {
        code: 'UG', name: 'Uganda', nativeName: 'Uganda', flagEmoji: '🇺🇬',
        currency: 'UGX', locale: 'en-UG', timezone: 'Africa/Kampala',
        defaultNativeLanguage: 'en', displayOrder: 1,
      },
      {
        code: 'JP', name: 'Japan', nativeName: '日本', flagEmoji: '🇯🇵',
        currency: 'JPY', locale: 'ja-JP', timezone: 'Asia/Tokyo',
        defaultNativeLanguage: 'ja', displayOrder: 2,
      },
      {
        code: 'CN', name: 'China', nativeName: '中国', flagEmoji: '🇨🇳',
        currency: 'CNY', locale: 'zh-CN', timezone: 'Asia/Shanghai',
        defaultNativeLanguage: 'zh', displayOrder: 3,
      },
      {
        code: 'KR', name: 'South Korea', nativeName: '대한민국', flagEmoji: '🇰🇷',
        currency: 'KRW', locale: 'ko-KR', timezone: 'Asia/Seoul',
        defaultNativeLanguage: 'ko', displayOrder: 4,
      },
      {
        code: 'TH', name: 'Thailand', nativeName: 'ไทย', flagEmoji: '🇹🇭',
        currency: 'THB', locale: 'th-TH', timezone: 'Asia/Bangkok',
        defaultNativeLanguage: 'th', displayOrder: 5,
      },
      {
        code: 'VN', name: 'Vietnam', nativeName: 'Việt Nam', flagEmoji: '🇻🇳',
        currency: 'VND', locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh',
        defaultNativeLanguage: 'vi', displayOrder: 6,
      },
      {
        code: 'PH', name: 'Philippines', nativeName: 'Pilipinas', flagEmoji: '🇵🇭',
        currency: 'PHP', locale: 'tl-PH', timezone: 'Asia/Manila',
        defaultNativeLanguage: 'tl', displayOrder: 7,
      },
      {
        code: 'KH', name: 'Cambodia', nativeName: 'កម្ពុជា', flagEmoji: '🇰🇭',
        currency: 'KHR', locale: 'km-KH', timezone: 'Asia/Phnom_Penh',
        defaultNativeLanguage: 'km', displayOrder: 8,
      },
      {
        code: 'MY', name: 'Malaysia', nativeName: 'Malaysia', flagEmoji: '🇲🇾',
        currency: 'MYR', locale: 'ms-MY', timezone: 'Asia/Kuala_Lumpur',
        defaultNativeLanguage: 'ms', displayOrder: 9,
      },
      {
        code: 'ID', name: 'Indonesia', nativeName: 'Indonesia', flagEmoji: '🇮🇩',
        currency: 'IDR', locale: 'id-ID', timezone: 'Asia/Jakarta',
        defaultNativeLanguage: 'id', displayOrder: 10,
      },
      {
        code: 'MM', name: 'Myanmar', nativeName: 'မြန်မာ', flagEmoji: '🇲🇲',
        currency: 'MMK', locale: 'my-MM', timezone: 'Asia/Yangon',
        defaultNativeLanguage: 'my', displayOrder: 11,
      },
      {
        code: 'LA', name: 'Laos', nativeName: 'ລາວ', flagEmoji: '🇱🇦',
        currency: 'LAK', locale: 'lo-LA', timezone: 'Asia/Vientiane',
        defaultNativeLanguage: 'lo', displayOrder: 12,
      },
      {
        code: 'IN', name: 'India', nativeName: 'भारत', flagEmoji: '🇮🇳',
        currency: 'INR', locale: 'hi-IN', timezone: 'Asia/Kolkata',
        defaultNativeLanguage: 'hi', displayOrder: 13,
      },
      {
        code: 'NP', name: 'Nepal', nativeName: 'नेपाल', flagEmoji: '🇳🇵',
        currency: 'NPR', locale: 'ne-NP', timezone: 'Asia/Kathmandu',
        defaultNativeLanguage: 'ne', displayOrder: 14,
      },
      {
        code: 'FR', name: 'France', nativeName: 'France', flagEmoji: '🇫🇷',
        currency: 'EUR', locale: 'fr-FR', timezone: 'Europe/Paris',
        defaultNativeLanguage: 'fr', displayOrder: 15,
      },
      {
        code: 'DE', name: 'Germany', nativeName: 'Deutschland', flagEmoji: '🇩🇪',
        currency: 'EUR', locale: 'de-DE', timezone: 'Europe/Berlin',
        defaultNativeLanguage: 'de', displayOrder: 16,
      },
      {
        code: 'ES', name: 'Spain', nativeName: 'España', flagEmoji: '🇪🇸',
        currency: 'EUR', locale: 'es-ES', timezone: 'Europe/Madrid',
        defaultNativeLanguage: 'es', displayOrder: 17,
      },
      {
        code: 'RU', name: 'Russia', nativeName: 'Россия', flagEmoji: '🇷🇺',
        currency: 'RUB', locale: 'ru-RU', timezone: 'Europe/Moscow',
        defaultNativeLanguage: 'ru', displayOrder: 18,
      },
      {
        code: 'EG', name: 'Egypt', nativeName: 'مصر', flagEmoji: '🇪🇬',
        currency: 'EGP', locale: 'ar-EG', timezone: 'Africa/Cairo',
        defaultNativeLanguage: 'ar', displayOrder: 19,
      },
      {
        code: 'KE', name: 'Kenya', nativeName: 'Kenya', flagEmoji: '🇰🇪',
        currency: 'KES', locale: 'sw-KE', timezone: 'Africa/Nairobi',
        defaultNativeLanguage: 'sw', displayOrder: 20,
      },
      {
        code: 'BR', name: 'Brazil', nativeName: 'Brasil', flagEmoji: '🇧🇷',
        currency: 'BRL', locale: 'pt-BR', timezone: 'America/Sao_Paulo',
        defaultNativeLanguage: 'pt', displayOrder: 21,
      },
      {
        code: 'IT', name: 'Italy', nativeName: 'Italia', flagEmoji: '🇮🇹',
        currency: 'EUR', locale: 'it-IT', timezone: 'Europe/Rome',
        defaultNativeLanguage: 'it', displayOrder: 22,
      },
      {
        code: 'NL', name: 'Netherlands', nativeName: 'Nederland', flagEmoji: '🇳🇱',
        currency: 'EUR', locale: 'nl-NL', timezone: 'Europe/Amsterdam',
        defaultNativeLanguage: 'nl', displayOrder: 23,
      },
      {
        code: 'TR', name: 'Turkey', nativeName: 'Türkiye', flagEmoji: '🇹🇷',
        currency: 'TRY', locale: 'tr-TR', timezone: 'Europe/Istanbul',
        defaultNativeLanguage: 'tr', displayOrder: 24,
      },
      {
        code: 'PL', name: 'Poland', nativeName: 'Polska', flagEmoji: '🇵🇱',
        currency: 'PLN', locale: 'pl-PL', timezone: 'Europe/Warsaw',
        defaultNativeLanguage: 'pl', displayOrder: 25,
      },
      {
        code: 'UA', name: 'Ukraine', nativeName: 'Україна', flagEmoji: '🇺🇦',
        currency: 'UAH', locale: 'uk-UA', timezone: 'Europe/Kyiv',
        defaultNativeLanguage: 'uk', displayOrder: 26,
      },
      {
        code: 'GR', name: 'Greece', nativeName: 'Ελλάδα', flagEmoji: '🇬🇷',
        currency: 'EUR', locale: 'el-GR', timezone: 'Europe/Athens',
        defaultNativeLanguage: 'el', displayOrder: 27,
      },
      {
        code: 'IL', name: 'Israel', nativeName: 'ישראל', flagEmoji: '🇮🇱',
        currency: 'ILS', locale: 'he-IL', timezone: 'Asia/Jerusalem',
        defaultNativeLanguage: 'he', displayOrder: 28,
      },
      {
        code: 'IR', name: 'Iran', nativeName: 'ایران', flagEmoji: '🇮🇷',
        currency: 'IRR', locale: 'fa-IR', timezone: 'Asia/Tehran',
        defaultNativeLanguage: 'fa', displayOrder: 29,
      },
      {
        code: 'BD', name: 'Bangladesh', nativeName: 'বাংলাদেশ', flagEmoji: '🇧🇩',
        currency: 'BDT', locale: 'bn-BD', timezone: 'Asia/Dhaka',
        defaultNativeLanguage: 'bn', displayOrder: 30,
      },
      {
        code: 'PK', name: 'Pakistan', nativeName: 'پاکستان', flagEmoji: '🇵🇰',
        currency: 'PKR', locale: 'ur-PK', timezone: 'Asia/Karachi',
        defaultNativeLanguage: 'ur', displayOrder: 31,
      },
    ]).onConflictDoNothing();

    // ================================================================
    // 7. SCENARIO SETTINGS (per-country availability/featured)
    // ================================================================
    console.log('Inserting scenario settings...');
    await db.insert(scenarioSettings).values([
      { scenarioId: sIds[0], countryCode: 'UG', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[1], countryCode: 'UG', isFeatured: true, isAvailable: true, displayOrder: 2 },
      { scenarioId: sIds[2], countryCode: 'UG', isFeatured: false, isAvailable: true, displayOrder: 3 },
      { scenarioId: sIds[0], countryCode: 'JP', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'CN', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'KR', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'TH', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'VN', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'PH', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'KH', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'MY', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'ID', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'MM', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'LA', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'IN', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'NP', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'FR', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'DE', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'ES', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'RU', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'EG', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'KE', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'BR', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'IT', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'NL', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'TR', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'PL', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'UA', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'GR', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'IL', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'IR', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'BD', isFeatured: true, isAvailable: true, displayOrder: 1 },
      { scenarioId: sIds[0], countryCode: 'PK', isFeatured: true, isAvailable: true, displayOrder: 1 },
    ]).onConflictDoNothing();

    // ================================================================
    // 8. CURRICULUM (single language-agnostic course template)
    //    A course is a template, not a language: the learner picks the
    //    target + native language when they enrol, so we seed ONE course.
    // ================================================================
    console.log('Inserting sample curriculum...');
    const [courseRow] = await db.insert(courses).values({
      slug: 'survival-uganda',
      title: 'Survival Course for Uganda',
      description: 'A guided path from first greetings to everyday conversations, built for Ugandan learners.',
      difficulty: 'beginner',
      icon: 'GraduationCap',
      displayOrder: 1,
    }).onConflictDoNothing().returning();

    const courseId = courseRow?.id ?? (await db.select({ id: courses.id }).from(courses).where(eq(courses.slug, 'survival-uganda')))[0].id;

    const levelStructure = [
      { seq: 1, title: 'Level 1 — Foundations', desc: 'Greetings, introductions and daily survival phrases.', reqXp: 0 },
      { seq: 2, title: 'Level 2 — Daily Life', desc: 'Shopping, transport and everyday services.', reqXp: 200 },
    ];

    const levelRows = await db.insert(courseLevels).values(
      levelStructure.map((l) => ({
        courseId,
        sequenceOrder: l.seq,
        title: l.title,
        description: l.desc,
        requiredXp: l.reqXp,
      })),
    ).onConflictDoNothing().returning();

    const levelIds = levelRows.length > 0
      ? levelRows.map((r) => r.id)
      : (await db.select({ id: courseLevels.id, seq: courseLevels.sequenceOrder }).from(courseLevels).where(eq(courseLevels.courseId, courseId)).orderBy(courseLevels.sequenceOrder)).map((r) => r.id);

    const unitRows = await db.insert(units).values([
      { levelId: levelIds[0], sequenceOrder: 1, title: 'First Meetings', description: 'Introduce yourself and connect with new people.' },
      { levelId: levelIds[0], sequenceOrder: 2, title: 'Around the Neighbourhood', description: 'Greet neighbours and navigate your area.' },
    ]).onConflictDoNothing().returning();

    const unitIds = unitRows.length > 0
      ? unitRows.map((r) => r.id)
      : (await db.select({ id: units.id, seq: units.sequenceOrder }).from(units).where(eq(units.levelId, levelIds[0])).orderBy(units.sequenceOrder)).map((r) => r.id);

    const lessonRows = await db.insert(lessons).values([
      { unitId: unitIds[0], sequenceOrder: 1, title: 'Hello, I am...', summary: 'Introduce yourself and start a conversation.', scenarioId: sIds[0], estimatedMinutes: 10 },
      { unitId: unitIds[0], sequenceOrder: 2, title: 'Where are you from?', summary: 'Talk about your background and where you are from.', scenarioId: sIds[11], estimatedMinutes: 8 },
      { unitId: unitIds[1], sequenceOrder: 1, title: 'Meeting your neighbour', summary: 'Greet a neighbour politely and exchange pleasantries.', scenarioId: sIds[8], estimatedMinutes: 8 },
    ]).onConflictDoNothing().returning();

    const lessonIds = lessonRows.length > 0
      ? lessonRows.map((r) => r.id)
      : (await db.select({ id: lessons.id, seq: lessons.sequenceOrder }).from(lessons).where(eq(lessons.unitId, unitIds[0])).orderBy(lessons.sequenceOrder)).map((r) => r.id);

    // ── Level 2 — Daily Life ──
    const level2UnitRows = await db.insert(units).values([
      { levelId: levelIds[1], sequenceOrder: 1, title: 'Eating & Shopping', description: 'Order food and shop for everyday needs.' },
      { levelId: levelIds[1], sequenceOrder: 2, title: 'Getting Around', description: 'Ask for directions and use public transport.' },
      { levelId: levelIds[1], sequenceOrder: 3, title: 'Health & Errands', description: 'Visit a clinic and run simple errands.' },
    ]).onConflictDoNothing().returning();

    const level2UnitIds = level2UnitRows.length > 0
      ? level2UnitRows.map((r) => r.id)
      : (await db.select({ id: units.id, seq: units.sequenceOrder }).from(units).where(eq(units.levelId, levelIds[1])).orderBy(units.sequenceOrder)).map((r) => r.id);

    const level2LessonRows = await db.insert(lessons).values([
      { unitId: level2UnitIds[0], sequenceOrder: 1, title: 'Ordering Food', summary: 'Order a meal politely and pay the bill.', scenarioId: sIds[4], estimatedMinutes: 10 },
      { unitId: level2UnitIds[0], sequenceOrder: 2, title: 'Buying a Snack', summary: 'Make a quick purchase at a convenience store.', scenarioId: sIds[1], estimatedMinutes: 8 },
      { unitId: level2UnitIds[0], sequenceOrder: 3, title: 'Shopping at a Supermarket', summary: 'Find items and pay at the register.', scenarioId: sIds[5], estimatedMinutes: 9 },
      { unitId: level2UnitIds[1], sequenceOrder: 1, title: 'Asking for Directions', summary: 'Ask and follow directions to a destination.', scenarioId: sIds[2], estimatedMinutes: 8 },
      { unitId: level2UnitIds[1], sequenceOrder: 2, title: 'Buying a Train Ticket', summary: 'Buy the right ticket and find your platform.', scenarioId: sIds[6], estimatedMinutes: 8 },
      { unitId: level2UnitIds[2], sequenceOrder: 1, title: 'Visiting a Clinic', summary: 'Describe symptoms and understand the response.', scenarioId: sIds[3], estimatedMinutes: 10 },
      { unitId: level2UnitIds[2], sequenceOrder: 2, title: 'Sending a Parcel', summary: 'Send a parcel and choose a shipping method.', scenarioId: sIds[17], estimatedMinutes: 8 },
    ]).onConflictDoNothing().returning();

    const level2LessonIds = level2LessonRows.length > 0
      ? level2LessonRows.map((r) => r.id)
      : (await db.select({ id: lessons.id, seq: lessons.sequenceOrder }).from(lessons).where(eq(lessons.unitId, level2UnitIds[0])).orderBy(lessons.sequenceOrder)).map((r) => r.id);

    const phaseDefs = [
      { key: 'learn', title: 'Learn', objective: 'Learn the key vocabulary and phrases for this lesson.' },
      { key: 'practice', title: 'Practice', objective: 'Drill the phrases with guided prompts and pronunciation.' },
      { key: 'apply', title: 'Apply', objective: 'Use the phrases in a live roleplay scenario.' },
      { key: 'review', title: 'Review', objective: 'Solidify what you learned with a short review.' },
    ];

    const lessonIdList = [...lessonIds, ...level2LessonIds];
    const phaseValues = phaseDefs.flatMap((p, i) =>
      lessonIdList.map((lid, li) => ({
        lessonId: lid,
        sequenceOrder: i + 1,
        phaseKey: p.key,
        title: `${p.title} — Lesson ${li + 1}`,
        objective: p.objective,
        durationMinutes: 3,
      })),
    );
    await db.insert(lessonPhases).values(phaseValues).onConflictDoNothing();

    console.log('🚀 AI DOJO seed completed successfully!');
  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  }
}
seed();
