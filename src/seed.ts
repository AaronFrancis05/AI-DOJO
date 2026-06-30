// import { db } from './db';
// import { users, scenarios, vocabulary } from './schema';
//
// async function seed() {
//     try {
//         console.log('🌱 Starting AI DOJO database seeding via HTTP...');
//
//         // 1. Seed sample learners
//         console.log('Inserting user profiles...');
//         const insertedUsers = await db.insert(users).values([
//             { name: 'Lynnette', email: 'nangonzilynnette775@gmail.com', level: 'beginner' },
//             { name: 'Aaron', email: 'aarontaremwa8@gmail.com', level: 'beginner' },
//             { name: 'Desire', email: 'desirehope82@gmail.com', level: 'beginner' },
//             { name: 'Derrick', email: 'alaxdero1@gmail.com', level: 'beginner' }
//         ]).returning();
//
//         // 2. Seed Interactive Scenarios
//         console.log('Inserting learning scenarios...');
//         const insertedScenarios = await db.insert(scenarios).values([
//             {
//                 title: 'First Meeting a Japanese AI Tutor',
//                 context: 'Amina launches the JapanBridge app for the first time and is greeted by Hana, an AI Japanese tutor. This introductory scenario teaches the absolute basics: saying hello, exchanging names, and using the most fundamental greetings. It is the entry point for all new Ugandan players.',
//                 businessType: 'Daily Life / Language Learning',
//                 difficulty: 'beginner',
//                 aiCharacterName: 'Hana',
//                 aiCharacterRole: 'AI Japanese Language Tutor on JapanBridge',
//                 userCharacterName: 'Amina',
//                 userCharacterRole: 'Ugandan beginner player starting their Japanese learning journey',
//                 learningGoals: 'Learn hajimemashite, yoroshiku onegaishimasu, name introduction with watashi wa...desu, and basic greeting responses'
//             },
//             {
//                 title: 'Asking for a Job',
//                 context: 'Amina is looking for part-time work in Japan and visits an employment agency. She must communicate what kind of work she is looking for, express her experience level, and respond to the recruiter\'s basic questions. This scenario reflects a realistic situation for Ugandans working in Japan.',
//                 businessType: 'Employment / Daily Life',
//                 difficulty: 'beginner',
//                 aiCharacterName: 'Recruiter Tanaka',
//                 aiCharacterRole: 'Staff Recruiter at Osaka Employment Agency',
//                 userCharacterName: 'Amina',
//                 userCharacterRole: 'Ugandan resident in Japan looking for part-time restaurant work',
//                 learningGoals: 'Ask and answer questions about job seeking, describe preferred work type, use oshigoto vocabulary, express encouragement phrases'
//             },
//             {
//                 title: 'Seeking Medical Attention',
//                 context: 'Amina feels unwell and visits a local clinic in Japan. She must describe her symptoms to the receptionist and doctor, respond to basic health questions, and understand key phrases about her wellbeing. Health vocabulary is critical for safety and daily survival in Japan.',
//                 businessType: 'Healthcare / Daily Life',
//                 difficulty: 'beginner',
//                 aiCharacterName: 'Nurse Yamada',
//                 aiCharacterRole: 'Receptionist and Nurse at Sakura Clinic',
//                 userCharacterName: 'Amina',
//                 userCharacterRole: 'Ugandan resident in Japan feeling unwell and visiting a clinic',
//                 learningGoals: 'Describe physical symptoms, respond to health questions, understand dou shimashita ka (what is wrong), use kibun and daijoubu vocabulary'
//             }
//         ]).returning();
//
//         // 3. Seed Targeted Vocabulary Setup Linked to Scenarios
//         console.log('Linking vocabulary metadata maps...');
//
//         // Scenario 1 Vocab Mapping
//         await db.insert(vocabulary).values([
//             {
//                 scenarioId: insertedScenarios[0].id,
//                 japanese: 'こんにちは',
//                 romaji: 'Konnichiwa',
//                 english: 'Hello / Good afternoon',
//                 category: 'greeting',
//                 usageTip: 'The most common Japanese greeting. Used any time from mid-morning to early evening.',
//                 formalityLevel: 'polite'
//             },
//             {
//                 scenarioId: insertedScenarios[0].id,
//                 japanese: 'はじめまして',
//                 romaji: 'Hajimemashite',
//                 english: 'Nice to meet you (first meeting only)',
//                 category: 'greeting',
//                 usageTip: 'Only used when meeting someone for the very first time. It signals a brand new introduction.',
//                 formalityLevel: 'polite'
//             },
//             {
//                 scenarioId: insertedScenarios[0].id,
//                 japanese: 'よろしくおねがいします',
//                 romaji: 'Yoroshiku onegaishimasu',
//                 english: 'Pleased to meet you / I look forward to working with you',
//                 category: 'greeting',
//                 usageTip: 'Said at the end of an introduction. It expresses goodwill and a desire for a good relationship.',
//                 formalityLevel: 'polite'
//             }
//         ]);
//
//         // Scenario 2 Vocab Mapping
//         await db.insert(vocabulary).values([
//             {
//                 scenarioId: insertedScenarios[1].id,
//                 japanese: 'おしごとをさがしています',
//                 romaji: 'Oshigoto wo sagashite imasu',
//                 english: 'I am looking for a job',
//                 category: 'employment',
//                 usageTip: 'The essential phrase to use at an employment agency or when job hunting in Japan.',
//                 formalityLevel: 'polite'
//             },
//             {
//                 scenarioId: insertedScenarios[1].id,
//                 japanese: 'がんばってください',
//                 romaji: 'Ganbatte kudasai',
//                 english: 'Please do your best / Good luck',
//                 category: 'encouragement',
//                 usageTip: 'A warm expression of encouragement given to someone who is trying hard or facing a challenge.',
//                 formalityLevel: 'polite'
//             }
//         ]);
//
//         console.log('🚀 AI DOJO Seed data processing completed successfully.');
//     } catch (error) {
//         console.error('❌ Error during database seeding process:', error);
//         process.exit(1);
//     }
// }
//
// seed();

import { db } from './db';
import { users, scenarios, vocabulary, conversations, evaluations, scenarioGoals } from './schema';

async function seed() {
    try {
        console.log('🌱 Starting comprehensive AI DOJO database seeding...');

        // Clear existing data safely (Ordered sequentially by constraints)
        console.log('Cleaning existing table data...');
        await db.delete(evaluations);
        await db.delete(conversations);
        await db.delete(vocabulary);
        await db.delete(scenarios);
        await db.delete(users);

        // ============================================================
        // 1. SEED USERS
        // ============================================================
        console.log('Inserting user profiles...');
        const insertedUsers = await db.insert(users).values([
            { name: 'Lynnette', email: 'nangonzilynnette775@gmail.com', level: 'beginner' },
            { name: 'Aaron', email: 'aarontaremwa8@gmail.com', level: 'beginner' },
            { name: 'Desire', email: 'desirehope82@gmail.com', level: 'beginner' },
            { name: 'Derrick', email: 'alaxdero1@gmail.com', level: 'beginner' }
        ]).returning();

        const userMap = Object.fromEntries(insertedUsers.map(u => [u.name, u.id]));

        // ============================================================
        // 2. SEED ALL 20 SCENARIOS
        // ============================================================
        console.log('Inserting 20 daily-life scenarios...');
        const insertedScenarios = await db.insert(scenarios).values([
            {
                title: 'First Meeting a Japanese AI Tutor',
                context: 'Amina launches the JapanBridge app for the first time and is greeted by Hana, an AI Japanese tutor. This introductory scenario teaches the absolute basics: saying hello, exchanging names, and using the most fundamental greetings. It is the entry point for all new Ugandan players.',
                businessType: 'Daily Life / Language Learning',
                difficulty: 'beginner',
                aiCharacterName: 'Hana',
                aiCharacterRole: 'AI Japanese Language Tutor on JapanBridge',
                userCharacterName: 'Amina',
                userCharacterRole: 'Ugandan beginner player starting their Japanese learning journey',
                learningGoals: 'Learn hajimemashite, yoroshiku onegaishimasu, name introduction with watashi wa...desu, and basic greeting responses'
            },
            {
                title: 'Asking for a Job',
                context: 'Amina is looking for part-time restaurant work in Japan and visits an employment agency. She must communicate that she wants restaurant work (e.g., dishwasher, waiter, kitchen assistant), express her experience level, and respond to the recruiter\'s basic questions. This scenario reflects a realistic situation for Ugandans working in Japan.',
                businessType: 'Employment / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Recruiter Tanaka',
                aiCharacterRole: 'Staff Recruiter at Osaka Employment Agency',
                userCharacterName: 'Amina',
                userCharacterRole: 'Ugandan resident in Japan looking for part-time restaurant work',
                learningGoals: 'Ask and answer questions about job seeking, describe preferred work type (restaurant/hospitality), use oshigoto vocabulary, express encouragement phrases'
            },
            {
                title: 'Seeking Medical Attention',
                context: 'Amina feels unwell and visits a local clinic in Japan. She must describe her symptoms to the receptionist and doctor, respond to basic health questions, and understand key phrases about her wellbeing. Health vocabulary is critical for safety and daily survival in Japan.',
                businessType: 'Healthcare / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Nurse Yamada',
                aiCharacterRole: 'Receptionist and Nurse at Sakura Clinic',
                userCharacterName: 'Amina',
                userCharacterRole: 'Ugandan resident in Japan feeling unwell and visiting a clinic',
                learningGoals: 'Describe physical symptoms, respond to health questions, understand dou shimashita ka (what is wrong), use kibun and daijoubu vocabulary'
            },
            {
                title: 'At the Bus Station',
                context: 'Joseph needs to get to school and approaches the bus information desk at a Japanese bus station. He must state his destination, ask about arrival times, and understand the response. Public transport navigation is an essential daily life skill for newcomers in Japan.',
                businessType: 'Transportation / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Station Staff Kimura',
                aiCharacterRole: 'Bus Information Desk Staff at Namba Bus Terminal',
                userCharacterName: 'Joseph',
                userCharacterRole: 'Ugandan student in Japan navigating public transport to school',
                learningGoals: 'State a destination using e ikimasu (going to), ask and understand arrival times, use nanji vocabulary, respond to basic transport questions'
            },
            {
                title: 'Buying Water at a Convenience Store',
                context: 'Amina enters a Japanese convenience store (konbini) to buy a bottle of water. She must respond to the standard shop greeting, request an item, confirm the quantity, and complete a polite purchase transaction. Konbini interactions happen daily in Japan.',
                businessType: 'Shopping / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Shop Clerk Sato',
                aiCharacterRole: 'Convenience Store Clerk at Lawson Convenience Store',
                userCharacterName: 'Amina',
                userCharacterRole: 'Ugandan resident making her first purchase at a Japanese convenience store',
                learningGoals: 'Understand irasshaimase (welcome), use kudasai to request items, confirm quantities with ippon, complete a polite purchase exchange'
            },
            {
                title: 'Looking for a Hotel',
                context: 'Joseph arrives in a new Japanese city and needs accommodation. He visits a hotel front desk to inquire about a room, confirm he is travelling alone, and complete the check-in process. Hotel interactions require polite language and understanding of basic accommodation terms.',
                businessType: 'Accommodation / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Hotel Receptionist Fujita',
                aiCharacterRole: 'Front Desk Receptionist at Kyoto Garden Hotel',
                userCharacterName: 'Joseph',
                userCharacterRole: 'Ugandan traveller checking into a hotel alone in Kyoto',
                learningGoals: 'Understand and respond to oheya ga hitsuyou desu ka (do you need a room), express hitori (alone), confirm with wakarimashita, use hotel check-in vocabulary'
            },
            {
                title: 'Ordering Food at a Restaurant',
                context: 'Amina visits a traditional Japanese restaurant for the first time. She must read the menu with help, order food using appropriate phrases, respond to the server\'s questions, and use dining etiquette expressions. Food vocabulary connects directly to daily survival and cultural participation.',
                businessType: 'Food & Dining / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Waiter Tanaka',
                aiCharacterRole: 'Server at Sakura Japanese Restaurant',
                userCharacterName: 'Amina',
                userCharacterRole: 'Ugandan resident dining at a Japanese restaurant for the first time',
                learningGoals: 'Use nan o tabemasu ka (what will you eat) structure, order food items, respond to server questions, use itadakimasu and oishii expressions'
            },
            {
                title: 'Meeting a Neighbour',
                context: 'Joseph meets his Japanese neighbour for the first time in the morning outside their apartment building. This scenario covers morning greetings, asking about wellbeing, and casual neighbourhood conversation. Building relationships with neighbours is important for newcomers in Japan.',
                businessType: 'Social Life / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Neighbour Suzuki',
                aiCharacterRole: 'Japanese Neighbour living in the same apartment building',
                userCharacterName: 'Joseph',
                userCharacterRole: 'Ugandan student who just moved into a Japanese apartment',
                learningGoals: 'Use ohayo gozaimasu (good morning), ask and respond to ogenki desu ka (how are you), express genki desu, use yokatta (great) socially'
            },
            {
                title: 'Shopping at the Market',
                context: 'Amina visits a local Japanese market to buy goods. She must ask the price of items, respond to price statements, and engage in light price conversation. Understanding market transactions and price vocabulary is an everyday skill for life in Japan.',
                businessType: 'Shopping / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Market Vendor Nakamura',
                aiCharacterRole: 'Fruit and Vegetable Vendor at Osaka Kuromon Market',
                userCharacterName: 'Amina',
                userCharacterRole: 'Ugandan resident shopping for groceries at a Japanese market',
                learningGoals: 'Use ikura desu ka (how much is this), understand price responses in yen, use takai (expensive) and chotto (a little), engage in polite market conversation'
            },
            {
                title: 'Asking for Directions',
                context: 'Joseph is lost and needs to find the train station. He approaches a passerby on the street to ask for directions to the eki (station). This scenario covers polite interruption with sumimasen, asking where something is, understanding directional responses, and expressing gratitude.',
                businessType: 'Navigation / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Passerby Watanabe',
                aiCharacterRole: 'Helpful Japanese Passerby on a street in Tokyo',
                userCharacterName: 'Joseph',
                userCharacterRole: 'Ugandan student who is lost and looking for the train station in Tokyo',
                learningGoals: 'Use sumimasen to politely interrupt, ask doko desu ka (where is it), understand asoko (over there), respond with arigatou gozaimasu and dou itashimashite'
            },
            {
                title: 'At School',
                context: 'Amina attends a Japanese language class and the teacher asks about her student status and study subject. This scenario covers educational vocabulary, answering questions about being a student, and naming one\'s subject of study. School is a major environment for Ugandan newcomers in Japan.',
                businessType: 'Education / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Teacher Hayashi',
                aiCharacterRole: 'Japanese Language Teacher at Osaka International School',
                userCharacterName: 'Amina',
                userCharacterRole: 'Ugandan student attending Japanese language classes in Osaka',
                learningGoals: 'Respond to gakusei desu ka (are you a student), use gakusei vocabulary, answer nani o benkyou shimasu ka (what do you study), name nihongo as a subject'
            },
            {
                title: 'Visiting a Friend',
                context: 'Joseph visits his Japanese classmate\'s home for the first time. The friend welcomes him at the door, offers tea, and engages in warm casual conversation. Home visit etiquette is deeply important in Japanese culture and involves specific phrases at the entrance and as a guest.',
                businessType: 'Social Life / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Friend Kenji',
                aiCharacterRole: 'Joseph\'s Japanese classmate who lives in Osaka',
                userCharacterName: 'Joseph',
                userCharacterRole: 'Ugandan student visiting a Japanese friend\'s home for the first time',
                learningGoals: 'Understand and use irasshai (welcome, visitor), respond to ocha wa ikaga desu ka (would you like tea), use onegaishimasu politely, practice casual home-visit conversation'
            },
            {
                title: 'Playing Football in the Park',
                context: 'Joseph and his friends play football at a local Japanese park. He meets a Japanese boy who wants to talk about football. This scenario covers sports vocabulary, expressing likes and dislikes, and naming locations — all in a fun and casual context that resonates with Ugandan players.',
                businessType: 'Sports & Recreation / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Yuta',
                aiCharacterRole: 'Japanese boy playing at the park in Osaka',
                userCharacterName: 'Joseph',
                userCharacterRole: 'Ugandan student who loves football and plays regularly at the local park',
                learningGoals: 'Respond to sakka ga suki desu ka (do you like football), express suki desu (I like it), answer doko de purei shimasu ka (where do you play), name kouen (park)'
            },
            {
                title: 'At the Airport',
                context: 'Amina arrives at a Japanese airport and goes through immigration control. The immigration officer asks to see her passport and completes the entry formalities. Understanding airport procedures in Japanese is essential for new arrivals and is often the very first Japanese conversation a newcomer has.',
                businessType: 'Travel / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Immigration Officer Kondo',
                aiCharacterRole: 'Immigration Control Officer at Kansai International Airport',
                userCharacterName: 'Amina',
                userCharacterRole: 'Ugandan national arriving in Japan for the first time at Kansai Airport',
                learningGoals: 'Understand pasupooto o misete kudasai (please show your passport), respond with douzo (here you are), complete a basic immigration exchange, use arigatou gozaimasu appropriately'
            },
            {
                title: 'Going Shoe Shopping',
                context: 'Amina visits a Japanese shoe shop to buy a pair of shoes. She must express what she wants, understand the sales assistant\'s guidance to the correct section, and complete a basic shopping transaction. Shopping vocabulary is immediately useful for daily life in Japan.',
                businessType: 'Shopping / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Shop Assistant Ono',
                aiCharacterRole: 'Sales Assistant at ABC Shoe Store in Osaka',
                userCharacterName: 'Amina',
                userCharacterRole: 'Ugandan resident buying shoes at a Japanese shoe shop for the first time',
                learningGoals: 'Use nani ga hoshii desu ka (what do you want), express kutsu ga hoshii desu (I want shoes), understand koko ni arimasu (they are here), complete a basic shopping interaction'
            },
            {
                title: 'At the Library',
                context: 'Joseph visits a public library in Japan to find a Japanese language book. The librarian helps him by asking what kind of book he needs. This scenario covers library vocabulary, expressing what you are looking for, and describing book types — practical for students studying in Japan.',
                businessType: 'Education / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Librarian Inoue',
                aiCharacterRole: 'Librarian at Osaka Municipal Library',
                userCharacterName: 'Joseph',
                userCharacterRole: 'Ugandan student looking for a Japanese language study book at the library',
                learningGoals: 'Respond to hon o sagashite imasu ka (are you looking for a book), describe the type of book using donna hon, name nihongo no hon, use library interaction vocabulary'
            },
            {
                title: 'At the Pharmacy',
                context: 'Amina has a headache and visits a Japanese pharmacy to get medicine. She must describe her symptom to the pharmacist, understand the response about available medicine, and complete a polite purchase. Health-related vocabulary is critical for safety and daily comfort in Japan.',
                businessType: 'Healthcare / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Pharmacist Kato',
                aiCharacterRole: 'Pharmacist at Matsumoto Kiyoshi Pharmacy',
                userCharacterName: 'Amina',
                userCharacterRole: 'Ugandan resident visiting a Japanese pharmacy with a headache',
                learningGoals: 'Describe symptoms using atama ga itai desu (my head hurts), understand kusuri ga arimasu (there is medicine), complete a pharmacy transaction, use arigatou gozaimasu to close'
            },
            {
                title: 'Asking the Time',
                context: 'Joseph is running late for class and realises he left his phone at home. He stops a passerby on the street to ask what time it is. This scenario covers one of the most basic and universally useful Japanese interactions: asking and telling the time politely.',
                businessType: 'Daily Life / Navigation',
                difficulty: 'beginner',
                aiCharacterName: 'Passerby Nishida',
                aiCharacterRole: 'Helpful Japanese Passerby on a street in Osaka',
                userCharacterName: 'Joseph',
                userCharacterRole: 'Ugandan student who needs to know the time urgently before class',
                learningGoals: 'Ask ima nanji desu ka (what time is it now), understand time responses using ku ji (9 o\'clock), use arigatou and dou itashimashite in a brief street exchange'
            },
            {
                title: 'At a Café',
                context: 'Amina visits a Japanese café for the first time and orders a coffee. The barista asks what she would like to drink, she orders, and the transaction is completed. Café vocabulary is immediately practical and is often one of the first real-world interactions for newcomers in Japan.',
                businessType: 'Food & Dining / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Barista Mori',
                aiCharacterRole: 'Barista at Hana Coffee Café in Osaka',
                userCharacterName: 'Amina',
                userCharacterRole: 'Ugandan resident ordering her first coffee at a Japanese café',
                learningGoals: 'Respond to nani o nomimasu ka (what will you drink), order koohii (coffee), confirm order, use arigatou to close a simple café transaction'
            },
            {
                title: 'Introducing Yourself Again',
                context: 'Amina attends a Japanese community welcome event and meets several new people in a row. She must introduce herself repeatedly using the correct first-meeting phrases and respond gracefully to others\' introductions. This scenario reinforces and consolidates self-introduction skills across multiple brief interactions.',
                businessType: 'Social Life / Daily Life',
                difficulty: 'beginner',
                aiCharacterName: 'Community Host Yuki',
                aiCharacterRole: 'Community Event Host at Osaka International Friendship Centre',
                userCharacterName: 'Amina',
                userCharacterRole: 'Ugandan resident attending a Japanese community welcome event in Osaka',
                learningGoals: 'Consolidate hajimemashite opening, use watashi wa Amina desu confidently, respond to yoroshiku onegaishimasu, practice smooth multi-person self-introduction flow'
            }
        ]).returning();

        // Mapping generated table database primary IDs sequentially
        const sIds = insertedScenarios.map(s => s.id);

        // ============================================================
        // 3. SEED CORE VOCABULARY METADATA
        // ============================================================
        console.log('Inserting contextual vocabulary items...');
        await db.insert(vocabulary).values([
            { scenarioId: sIds[0], japanese: 'こんにちは', romaji: 'Konnichiwa', english: 'Hello / Good afternoon', category: 'greeting', usageTip: 'The most common Japanese greeting.', formalityLevel: 'polite' },
            { scenarioId: sIds[0], japanese: 'はじめまして', romaji: 'Hajimemashite', english: 'Nice to meet you (first meeting only)', category: 'greeting', usageTip: 'Only used when meeting someone for the very first time.', formalityLevel: 'polite' },
            { scenarioId: sIds[0], japanese: 'おなまえはなんですか', 'romaji': 'Onamae wa nan desu ka', english: 'What is your name?', category: 'question', usageTip: 'A polite way to ask someone\'s name.', formalityLevel: 'polite' },
            { scenarioId: sIds[0], japanese: 'わたしは〇〇です', romaji: 'Watashi wa ___ desu', english: 'I am ___', category: 'self-introduction', usageTip: 'Replace ___ with your name.', formalityLevel: 'polite' },
            { scenarioId: sIds[0], japanese: 'よろしくおねがいします', romaji: 'Yoroshiku onegaishimasu', english: 'Pleased to meet you', category: 'greeting', usageTip: 'Said at the end of an introduction.', formalityLevel: 'polite' },

            { scenarioId: sIds[1], japanese: 'おしごとをさがしています', romaji: 'Oshigoto wo sagashite imasu', english: 'I am looking for a job', category: 'employment', usageTip: 'Essential phrase when job hunting.', formalityLevel: 'polite' },
            { scenarioId: sIds[1], japanese: 'がんばってください', romaji: 'Ganbatte kudasai', english: 'Please do your best / Good luck', category: 'encouragement', usageTip: 'Warm expression of encouragement.', formalityLevel: 'polite' },

            { scenarioId: sIds[2], japanese: 'どうしましたか', romaji: 'Dou shimashita ka', english: 'What is wrong?', category: 'medical', usageTip: 'The standard medical presentation question.', formalityLevel: 'polite' },
            { scenarioId: sIds[2], japanese: 'あたまがいたいです', romaji: 'Atama ga itai desu', english: 'My head hurts', category: 'medical', usageTip: 'Core physical symptom description template.', formalityLevel: 'polite' }
        ]);

        // ============================================================
        // 4. BACKFILL DISCRETE SCENARIO GOALS
        // ============================================================
        console.log('Inserting decomposed scenario goals...');
        await db.insert(scenarioGoals).values([
            // Scenario 1: First Meeting a Japanese AI Tutor
            { scenarioId: sIds[0], sequenceOrder: 1, goalType: 'vocabulary', goalText: 'Recognize and use "hajimemashite" as a first-meeting greeting', targetPhraseJp: 'はじめまして' },
            { scenarioId: sIds[0], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Introduce oneself using the "watashi wa ___ desu" pattern', targetPhraseJp: 'わたしは〇〇です' },
            { scenarioId: sIds[0], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Respond with "yoroshiku onegaishimasu" after an introduction', targetPhraseJp: 'よろしくおねがいします' },
            { scenarioId: sIds[0], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Exchange basic closing greeting responses naturally', targetPhraseJp: null },

            // Scenario 2: Asking for a Job
            { scenarioId: sIds[1], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Express that you are looking for a job using "oshigoto wo sagashite imasu"', targetPhraseJp: 'おしごとをさがしています' },
            { scenarioId: sIds[1], sequenceOrder: 2, goalType: 'vocabulary', goalText: 'Describe preferred work type (restaurant/hospitality) using appropriate vocabulary', targetPhraseJp: null },
            { scenarioId: sIds[1], sequenceOrder: 3, goalType: 'comprehension', goalText: 'Understand and respond to the recruiter\'s job-related questions', targetPhraseJp: null },
            { scenarioId: sIds[1], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Use and respond to encouragement phrases like "ganbatte kudasai"', targetPhraseJp: 'がんばってください' },

            // Scenario 3: Seeking Medical Attention
            { scenarioId: sIds[2], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Understand "dou shimashita ka" (what is wrong?) from medical staff', targetPhraseJp: 'どうしましたか' },
            { scenarioId: sIds[2], sequenceOrder: 2, goalType: 'vocabulary', goalText: 'Describe physical symptoms using body-part + "ga itai desu" pattern', targetPhraseJp: 'あたまがいたいです' },
            { scenarioId: sIds[2], sequenceOrder: 3, goalType: 'vocabulary', goalText: 'Respond to health questions using "kibun" and "daijoubu" vocabulary', targetPhraseJp: null },
            { scenarioId: sIds[2], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Complete a clinic visit with polite closing expressions', targetPhraseJp: null },

            // Scenario 4: At the Bus Station
            { scenarioId: sIds[3], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'State a destination using the "___ e ikimasu" pattern', targetPhraseJp: '〜へ行きます' },
            { scenarioId: sIds[3], sequenceOrder: 2, goalType: 'vocabulary', goalText: 'Ask and understand arrival times using "nanji" vocabulary', targetPhraseJp: 'なんじ' },
            { scenarioId: sIds[3], sequenceOrder: 3, goalType: 'comprehension', goalText: 'Respond to basic transport questions from station staff', targetPhraseJp: null },
            { scenarioId: sIds[3], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Complete the bus station interaction with a polite closing', targetPhraseJp: null },

            // Scenario 5: Buying Water at a Convenience Store
            { scenarioId: sIds[4], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Understand "irasshaimase" as a store welcome greeting', targetPhraseJp: 'いらっしゃいませ' },
            { scenarioId: sIds[4], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Use "kudasai" to request an item', targetPhraseJp: '〜をください' },
            { scenarioId: sIds[4], sequenceOrder: 3, goalType: 'vocabulary', goalText: 'Confirm quantity with the counter word "ippon" (one bottle)', targetPhraseJp: 'いっぽん' },
            { scenarioId: sIds[4], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Complete a polite konbini purchase exchange', targetPhraseJp: null },

            // Scenario 6: Looking for a Hotel
            { scenarioId: sIds[5], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Understand and respond to "oheya ga hitsuyou desu ka"', targetPhraseJp: 'おへやがひつようですか' },
            { scenarioId: sIds[5], sequenceOrder: 2, goalType: 'vocabulary', goalText: 'Express "hitori" (alone) when asked about party size', targetPhraseJp: 'ひとり' },
            { scenarioId: sIds[5], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Confirm understanding with "wakarimashita"', targetPhraseJp: 'わかりました' },
            { scenarioId: sIds[5], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Use hotel check-in vocabulary to complete the process', targetPhraseJp: null },

            // Scenario 7: Ordering Food at a Restaurant
            { scenarioId: sIds[6], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Understand "nan o tabemasu ka" (what will you eat?)', targetPhraseJp: 'なにをたべますか' },
            { scenarioId: sIds[6], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Order specific food items using appropriate phrases', targetPhraseJp: null },
            { scenarioId: sIds[6], sequenceOrder: 3, goalType: 'comprehension', goalText: 'Respond to the server\'s follow-up questions about food or drink', targetPhraseJp: null },
            { scenarioId: sIds[6], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Use "itadakimasu" before eating and "oishii" dining expressions', targetPhraseJp: 'いただきます' },

            // Scenario 8: Meeting a Neighbour
            { scenarioId: sIds[7], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Use "ohayo gozaimasu" as a morning greeting', targetPhraseJp: 'おはようございます' },
            { scenarioId: sIds[7], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Ask "ogenki desu ka" (how are you?)', targetPhraseJp: 'おげんきですか' },
            { scenarioId: sIds[7], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Respond with "genki desu" (I am fine)', targetPhraseJp: 'げんきです' },
            { scenarioId: sIds[7], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Use "yokatta" (great) as a positive social response', targetPhraseJp: 'よかった' },

            // Scenario 9: Shopping at the Market
            { scenarioId: sIds[8], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Ask about price using "ikura desu ka"', targetPhraseJp: 'いくらですか' },
            { scenarioId: sIds[8], sequenceOrder: 2, goalType: 'comprehension', goalText: 'Understand price responses quoted in yen', targetPhraseJp: null },
            { scenarioId: sIds[8], sequenceOrder: 3, goalType: 'vocabulary', goalText: 'Use "takai" (expensive) and "chotto" (a little) in price conversation', targetPhraseJp: 'たかい' },
            { scenarioId: sIds[8], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Complete a polite market purchase interaction', targetPhraseJp: null },

            // Scenario 10: Asking for Directions
            { scenarioId: sIds[9], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Use "sumimasen" to politely interrupt a passerby', targetPhraseJp: 'すみません' },
            { scenarioId: sIds[9], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Ask "doko desu ka" (where is it?) for a location', targetPhraseJp: 'どこですか' },
            { scenarioId: sIds[9], sequenceOrder: 3, goalType: 'comprehension', goalText: 'Understand the directional response "asoko" (over there)', targetPhraseJp: 'あそこ' },
            { scenarioId: sIds[9], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Respond with "arigatou gozaimasu" and "dou itashimashite"', targetPhraseJp: 'ありがとうございます' },

            // Scenario 11: At School
            { scenarioId: sIds[10], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Understand and respond to "gakusei desu ka" (are you a student?)', targetPhraseJp: 'がくせいですか' },
            { scenarioId: sIds[10], sequenceOrder: 2, goalType: 'vocabulary', goalText: 'Use "gakusei" (student) vocabulary in response', targetPhraseJp: 'がくせい' },
            { scenarioId: sIds[10], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Answer "nani o benkyou shimasu ka" (what do you study?)', targetPhraseJp: 'なにをべんきょうしますか' },
            { scenarioId: sIds[10], sequenceOrder: 4, goalType: 'vocabulary', goalText: 'Name "nihongo" (Japanese language) as the subject of study', targetPhraseJp: 'にほんご' },

            // Scenario 12: Visiting a Friend
            { scenarioId: sIds[11], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Understand "irasshai" (welcome, visitor) at the door', targetPhraseJp: 'いらっしゃい' },
            { scenarioId: sIds[11], sequenceOrder: 2, goalType: 'comprehension', goalText: 'Respond to "ocha wa ikaga desu ka" (would you like tea?)', targetPhraseJp: 'おちゃはいかがですか' },
            { scenarioId: sIds[11], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Use "onegaishimasu" politely when accepting an offer', targetPhraseJp: 'おねがいします' },
            { scenarioId: sIds[11], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Practice casual home-visit conversation and closing', targetPhraseJp: null },

            // Scenario 13: Playing Football in the Park
            { scenarioId: sIds[12], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Respond to "sakka ga suki desu ka" (do you like football?)', targetPhraseJp: 'サッカーがすきですか' },
            { scenarioId: sIds[12], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Express "suki desu" (I like it)', targetPhraseJp: 'すきです' },
            { scenarioId: sIds[12], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Answer "doko de purei shimasu ka" (where do you play?)', targetPhraseJp: 'どこでプレイしますか' },
            { scenarioId: sIds[12], sequenceOrder: 4, goalType: 'vocabulary', goalText: 'Name "kouen" (park) as the playing location', targetPhraseJp: 'こうえん' },

            // Scenario 14: At the Airport
            { scenarioId: sIds[13], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Understand "pasupooto o misete kudasai" (please show your passport)', targetPhraseJp: 'パスポートをみせてください' },
            { scenarioId: sIds[13], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Respond with "douzo" (here you are) when handing over passport', targetPhraseJp: 'どうぞ' },
            { scenarioId: sIds[13], sequenceOrder: 3, goalType: 'comprehension', goalText: 'Complete a basic immigration exchange with appropriate responses', targetPhraseJp: null },
            { scenarioId: sIds[13], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Use "arigatou gozaimasu" appropriately to close the exchange', targetPhraseJp: 'ありがとうございます' },

            // Scenario 15: Going Shoe Shopping
            { scenarioId: sIds[14], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Understand "nani ga hoshii desu ka" (what do you want?)', targetPhraseJp: 'なにがほしいですか' },
            { scenarioId: sIds[14], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Express "kutsu ga hoshii desu" (I want shoes)', targetPhraseJp: 'くつがほしいです' },
            { scenarioId: sIds[14], sequenceOrder: 3, goalType: 'comprehension', goalText: 'Understand "koko ni arimasu" (they are here) from the assistant', targetPhraseJp: 'ここにあります' },
            { scenarioId: sIds[14], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Complete a basic shopping interaction politely', targetPhraseJp: null },

            // Scenario 16: At the Library
            { scenarioId: sIds[15], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Respond to "hon o sagashite imasu ka" (looking for a book?)', targetPhraseJp: 'ほんをさがしていますか' },
            { scenarioId: sIds[15], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Describe the type of book using "donna hon" (what kind of book)', targetPhraseJp: 'どんなほん' },
            { scenarioId: sIds[15], sequenceOrder: 3, goalType: 'vocabulary', goalText: 'Name "nihongo no hon" (Japanese language book) as what you need', targetPhraseJp: 'にほんごのほん' },
            { scenarioId: sIds[15], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Use library interaction vocabulary and close the exchange politely', targetPhraseJp: null },

            // Scenario 17: At the Pharmacy
            { scenarioId: sIds[16], sequenceOrder: 1, goalType: 'vocabulary', goalText: 'Describe symptoms using "atama ga itai desu" (my head hurts)', targetPhraseJp: 'あたまがいたいです' },
            { scenarioId: sIds[16], sequenceOrder: 2, goalType: 'comprehension', goalText: 'Understand "kusuri ga arimasu" (there is medicine) from the pharmacist', targetPhraseJp: 'くすりがあります' },
            { scenarioId: sIds[16], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Complete a pharmacy transaction with appropriate phrases', targetPhraseJp: null },
            { scenarioId: sIds[16], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Use "arigatou gozaimasu" to close the pharmacy transaction', targetPhraseJp: 'ありがとうございます' },

            // Scenario 18: Asking the Time
            { scenarioId: sIds[17], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Ask "ima nanji desu ka" (what time is it now?)', targetPhraseJp: 'いまなんじですか' },
            { scenarioId: sIds[17], sequenceOrder: 2, goalType: 'comprehension', goalText: 'Understand time responses using counter words like "ku ji" (9 o\'clock)', targetPhraseJp: 'くじ' },
            { scenarioId: sIds[17], sequenceOrder: 3, goalType: 'social_closing', goalText: 'Use "arigatou" and "dou itashimashite" in a brief street exchange', targetPhraseJp: null },

            // Scenario 19: At a Café
            { scenarioId: sIds[18], sequenceOrder: 1, goalType: 'comprehension', goalText: 'Respond to "nani o nomimasu ka" (what will you drink?)', targetPhraseJp: 'なにをのみますか' },
            { scenarioId: sIds[18], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Order "koohii" (coffee) using an appropriate ordering phrase', targetPhraseJp: 'コーヒー' },
            { scenarioId: sIds[18], sequenceOrder: 3, goalType: 'comprehension', goalText: 'Confirm the order with the barista', targetPhraseJp: null },
            { scenarioId: sIds[18], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Use "arigatou" to close a simple café transaction', targetPhraseJp: 'ありがとう' },

            // Scenario 20: Introducing Yourself Again
            { scenarioId: sIds[19], sequenceOrder: 1, goalType: 'phrase_production', goalText: 'Consolidate "hajimemashite" as a confident first-meeting opening', targetPhraseJp: 'はじめまして' },
            { scenarioId: sIds[19], sequenceOrder: 2, goalType: 'phrase_production', goalText: 'Introduce oneself confidently using "watashi wa ___ desu"', targetPhraseJp: 'わたしは〜です' },
            { scenarioId: sIds[19], sequenceOrder: 3, goalType: 'phrase_production', goalText: 'Respond naturally to "yoroshiku onegaishimasu"', targetPhraseJp: 'よろしくおねがいします' },
            { scenarioId: sIds[19], sequenceOrder: 4, goalType: 'social_closing', goalText: 'Practice smooth multi-person self-introduction flow across brief interactions', targetPhraseJp: null },
        ]);

        // ============================================================
        // 5. SEED SAMPLE CONVERSATION TURNS
        // ============================================================
        console.log('Inserting chat logs into conversations table...');
        await db.insert(conversations).values([
            {
                scenarioId: sIds[0],
                userId: userMap['Lynnette'],
                turnNo: 1,
                speaker: 'ai',
                messageJp: 'はじめまして！私はハナです。日本へようこそ！お名前は何ですか？',
                messageRomaji: 'Hajimemashite! Watashi wa Hana desu. Nihon e youkoso! O-namae wa nan desu ka?',
                messageEn: 'Nice to meet you! I am Hana. Welcome to Japan! What is your name?',
                notes: 'AI character Hana initiates introduction.'
            },
            {
                scenarioId: sIds[0],
                userId: userMap['Lynnette'],
                turnNo: 2,
                speaker: 'user',
                messageJp: 'はじめまして。私はリネットです。ウガンダから来ました。よろしくおねがいします！',
                messageRomaji: 'Hajimemashite. Watashi wa Rinetto desu. Uganda kara kimashite. Yoroshiku onegaishimasu!',
                messageEn: 'Nice to meet you. I am Lynnette. I came from Uganda. Pleased to meet you!',
                notes: 'User responds with relational background parameters.'
            },
            {
                scenarioId: sIds[1],
                userId: userMap['Aaron'],
                turnNo: 1,
                speaker: 'ai',
                messageJp: 'こんにちは。どのようなお仕事を探していますか？',
                messageRomaji: 'Konnichiwa. Dono you na o-shigoto wo sagashite imasu ka?',
                messageEn: 'Hello. What kind of job are you looking for?',
                notes: 'Recruiter starts counseling desk interaction.'
            }
        ]);

        // ============================================================
        // 6. SEED HISTORICAL EVALUATIONS
        // ============================================================
        console.log('Inserting baseline user evaluations...');
        await db.insert(evaluations).values([
            {
                userId: userMap['Lynnette'],
                scenarioId: sIds[0],
                vocabularyScore: 28,
                grammarScore: 22,
                fluencyScore: 19,
                culturalScore: 15,
                taskScore: 10,
                feedback: 'Lynnette passed with an absolute distinction! Her response built natural cultural rapport with Hana.'
            },
            {
                userId: userMap['Aaron'],
                scenarioId: sIds[1],
                vocabularyScore: 24,
                grammarScore: 21,
                fluencyScore: 16,
                culturalScore: 13,
                taskScore: 9,
                feedback: 'Aaron demonstrated excellent vocabulary regarding employment structures.'
            }
        ]);

        console.log('🚀 AI DOJO complete seed configuration processed successfully!');
    } catch (error) {
        console.error('❌ Error executing automated seed arrays:', error);
        process.exit(1);
    }
}

seed();