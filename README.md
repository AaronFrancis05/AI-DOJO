# 🥋 AI DOJO — Japanese Arena for Ugandan Engineers

AI DOJO is an interactive, virtual roleplay simulation platform built to help Ugandan software engineers rapidly learn practical Japanese for offshore IT business environments. 

Instead of focusing purely on generic casual phrases, the application drops developers directly into simulated offshore workflows (such as daily standups, code reviews, and project alignments) to learn Japanese business (*Keigo*), structural syntax, and cultural communication protocols dynamically.

---

## 🎯 The Core Mission
- **Target Audience:** Ugandan software engineers looking to accelerate their careers in the Japanese offshore market.
- **Learning Philosophy:** Fast, immersive, and practical feedback cycles powered by large language models.
- **Focus Areas:** Technical requirements gathering, standup progress reports, and professional client communication.

---

## 🏗️ Technical Architecture & Stack

The platform functions as a full-stack Next.js application bound to a secure real-time cloud data pipeline:

* **Frontend Client:** Next.js (App Router, built on React 16+) utilizing dynamic parameter rendering and fluid chat layouts.
* **Database Tier:** [Neon Serverless PostgreSQL](https://neon.tech) managed via **Drizzle ORM** for lightweight schema synchronization.
* **AI Orchestration Engine:** Google Gemini (`gemini-2.5-flash`) executing structural validation, grading scoring metrics, and hosting natural conversations simultaneously.

---

## 📂 Project Schema Blueprint

The Neon database coordinates information across three critical tracking tables to preserve structural history context seamlessly:
1.  **`scenarios`:** Stores the master blueprint rows for the dynamic roleplay contexts (e.g., target difficulty, AI character roles, and engineering learning goals).
2.  **`conversations`:** Manages chronological conversation log sequences back-to-back, linking both the learner (`user`) entries and Gemini's responses (`ai`).
3.  **`evaluations`:** Aggregates multi-dimensional performance scores (Vocabulary, Grammar, Fluency, Cultural Rapport, and Task Target fulfillment) along with language coaching string summaries at the conclusion of a session.

---

## 🚀 Quick Setup & Installation Guide

### 1. Prerequisites
Ensure you have **Node.js (v18+)** and an active **Neon PostgreSQL** database project ready.

### 2. Clone and Install Dependencies
```bash
git clone [https://github.com/AaronFrancis05/AI-DOJO.git](https://github.com/AaronFrancis05/AI-DOJO.git)
cd AI-DOJO
npm install

// AI PROPMT FOR NEON POSTGRESS DATABASE SETUP AND SEEDING
Role: You are an expert software agent responsible for configuring Drizzle ORM and generating the schema/seed scripts for an existing TypeScript/Node.js project.

Context: The user has already configured their .env file with a DATABASE_URL and installed the core dependencies for the Neon Serverless (HTTP) driver (drizzle-orm, @neondatabase/serverless, dotenv, drizzle-kit, typescript, tsx).

Purpose: Skip driver selection or basic setup, and focus exclusively on generating the configuration files, defining the database schema, creating the HTTP database client, assembling the database seed file, and updating execution scripts.

Scope:

Assumes the project uses ES Modules ("type": "module" in package.json).

Assumes the Neon Serverless (HTTP) configuration is the absolute target architecture.

✅ Read and understand the entire instruction set before executing.

🛠️ Instructions (for AI-enabled editors)
When this prompt is triggered, automatically detect the package manager used in this project (npm, yarn, pnpm, bun, etc.) and format execution scripts accordingly (the examples below use npm). Generate and modify files precisely matching the structured templates below:

1. Create Drizzle Configuration
   Create a drizzle.config.ts file in the project root:

TypeScript
import 'dotenv/config';
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
throw new Error('DATABASE_URL is not set in .env file');
}

export default defineConfig({
schema: "./src/schema.ts",
out: "./drizzle",
dialect: "postgresql",
dbCredentials: {
url: process.env.DATABASE_URL,
}
});
2. Define AI DOJO Database Schema
   Create a src/schema.ts file to define the relational tables. This maps out learners, learning scenarios, vocabulary metadata, contextual logs, and metrics:

TypeScript
import { pgTable, serial, varchar, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// 1. USERS TABLE
export const users = pgTable('users', {
id: serial('id').primaryKey(),
name: varchar('name', { length: 100 }).notNull(),
email: varchar('email', { length: 150 }).notNull().unique(),
level: varchar('level', { length: 20 }).default('beginner').notNull(), // beginner, intermediate, advanced
createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. SCENARIOS TABLE
export const scenarios = pgTable('scenarios', {
id: serial('id').primaryKey(),
title: varchar('title', { length: 100 }).notNull(),
context: text('context').notNull(),
businessType: varchar('business_type', { length: 80 }).notNull(),
difficulty: varchar('difficulty', { length: 20 }).default('beginner').notNull(),
aiCharacterName: varchar('ai_character_name', { length: 80 }).notNull(),
aiCharacterRole: varchar('ai_character_role', { length: 120 }).notNull(),
userCharacterName: varchar('user_character_name', { length: 80 }).notNull(),
userCharacterRole: varchar('user_character_role', { length: 120 }).notNull(),
learningGoals: text('learning_goals').notNull(),
createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. VOCABULARY TABLE
export const vocabulary = pgTable('vocabulary', {
id: serial('id').primaryKey(),
scenarioId: integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }),
japanese: varchar('japanese', { length: 200 }).notNull(),
romaji: varchar('romaji', { length: 200 }).notNull(),
english: varchar('english', { length: 300 }).notNull(),
category: varchar('category', { length: 60 }).notNull(),
usageTip: text('usage_tip'),
formalityLevel: varchar('formality_level', { length: 20 }).default('formal').notNull(),
createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. CONVERSATIONS TABLE
export const conversations = pgTable('conversations', {
id: serial('id').primaryKey(),
scenarioId: integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }),
userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
turnNo: integer('turn_no').notNull(),
speaker: varchar('speaker', { length: 20 }).notNull(), // ai, user
messageJp: text('message_jp').notNull(),
messageRomaji: text('message_romaji'),
messageEn: text('message_en').notNull(),
notes: text('notes'),
createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. EVALUATIONS TABLE
export const evaluations = pgTable('evaluations', {
id: serial('id').primaryKey(),
userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
scenarioId: integer('scenario_id').references(() => scenarios.id, { onDelete: 'cascade' }),
vocabularyScore: integer('vocabulary_score').default(0).notNull(),
grammarScore: integer('grammar_score').default(0).notNull(),
fluencyScore: integer('fluency_score').default(0).notNull(),
culturalScore: integer('cultural_score').default(0).notNull(),
taskScore: integer('task_score').default(0).notNull(),
feedback: text('feedback'),
createdAt: timestamp('created_at').defaultNow().notNull(),
});

// RELATIONSHIPS
export const usersRelations = relations(users, ({ many }) => ({
conversations: many(conversations),
evaluations: many(evaluations),
}));

export const scenariosRelations = relations(scenarios, ({ many }) => ({
vocabularies: many(vocabulary),
conversations: many(conversations),
evaluations: many(evaluations),
}));

export const vocabularyRelations = relations(vocabulary, ({ one }) => ({
scenario: one(scenarios, { fields: [vocabulary.scenarioId], references: [scenarios.id] }),
}));

export const conversationsRelations = relations(conversations, ({ one }) => ({
scenario: one(scenarios, { fields: [conversations.scenarioId], references: [scenarios.id] }),
user: one(users, { fields: [conversations.userId], references: [users.id] }),
}));

export const evaluationsRelations = relations(evaluations, ({ one }) => ({
user: one(users, { fields: [evaluations.userId], references: [users.id] }),
scenario: one(scenarios, { fields: [evaluations.scenarioId], references: [scenarios.id] }),
}));
3. Create the Database Client (src/db.ts)
   Create a src/db.ts file optimized for stateless HTTP queries via the Neon Serverless driver:

TypeScript
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
throw new Error('DATABASE_URL is not defined in the environment variables');
}

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
4. Create the AI DOJO Seed Script
   Create a seed runner file src/seed.ts. Since this leverages Neon's HTTP client (neon-http), there are no long-lived connection pools to persist or manually terminate at completion:

TypeScript
import { db } from './db';
import { users, scenarios, vocabulary } from './schema';

async function seed() {
try {
console.log('🌱 Starting AI DOJO database seeding via HTTP...');

    // 1. Seed sample learners
    console.log('Inserting user profiles...');
    const insertedUsers = await db.insert(users).values([
      { name: 'Lynnette', email: 'nangonzilynnette775@gmail.com', level: 'beginner' },
      { name: 'Aaron', email: 'aarontaremwa8@gmail.com', level: 'beginner' },
      { name: 'Desire', email: 'desirehope82@gmail.com', level: 'beginner' },
      { name: 'Derrick', email: 'alaxdero1@gmail.com', level: 'beginner' }
    ]).returning();

    // 2. Seed Interactive Scenarios
    console.log('Inserting learning scenarios...');
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
        context: 'Amina is looking for part-time work in Japan and visits an employment agency. She must communicate what kind of work she is looking for, express her experience level, and respond to the recruiter\'s basic questions. This scenario reflects a realistic situation for Ugandans working in Japan.',
        businessType: 'Employment / Daily Life',
        difficulty: 'beginner',
        aiCharacterName: 'Recruiter Tanaka',
        aiCharacterRole: 'Staff Recruiter at Osaka Employment Agency',
        userCharacterName: 'Amina',
        userCharacterRole: 'Ugandan resident in Japan looking for part-time restaurant work',
        learningGoals: 'Ask and answer questions about job seeking, describe preferred work type, use oshigoto vocabulary, express encouragement phrases'
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
      }
    ]).returning();

    // 3. Seed Targeted Vocabulary Setup Linked to Scenarios
    console.log('Linking vocabulary metadata maps...');
    
    // Scenario 1 Vocab Mapping
    await db.insert(vocabulary).values([
      {
        scenarioId: insertedScenarios[0].id,
        japanese: 'こんにちは',
        romaji: 'Konnichiwa',
        english: 'Hello / Good afternoon',
        category: 'greeting',
        usageTip: 'The most common Japanese greeting. Used any time from mid-morning to early evening.',
        formalityLevel: 'polite'
      },
      {
        scenarioId: insertedScenarios[0].id,
        japanese: 'はじめまして',
        romaji: 'Hajimemashite',
        english: 'Nice to meet you (first meeting only)',
        category: 'greeting',
        usageTip: 'Only used when meeting someone for the very first time. It signals a brand new introduction.',
        formalityLevel: 'polite'
      },
      {
        scenarioId: insertedScenarios[0].id,
        japanese: 'よろしくおねがいします',
        romaji: 'Yoroshiku onegaishimasu',
        english: 'Pleased to meet you / I look forward to working with you',
        category: 'greeting',
        usageTip: 'Said at the end of an introduction. It expresses goodwill and a desire for a good relationship.',
        formalityLevel: 'polite'
      }
    ]);

    // Scenario 2 Vocab Mapping
    await db.insert(vocabulary).values([
      {
        scenarioId: insertedScenarios[1].id,
        japanese: 'おしごとをさがしています',
        romaji: 'Oshigoto wo sagashite imasu',
        english: 'I am looking for a job',
        category: 'employment',
        usageTip: 'The essential phrase to use at an employment agency or when job hunting in Japan.',
        formalityLevel: 'polite'
      },
      {
        scenarioId: insertedScenarios[1].id,
        japanese: 'がんばってください',
        romaji: 'Ganbatte kudasai',
        english: 'Please do your best / Good luck',
        category: 'encouragement',
        usageTip: 'A warm expression of encouragement given to someone who is trying hard or facing a challenge.',
        formalityLevel: 'polite'
      }
    ]);

    console.log('🚀 AI DOJO Seed data processing completed successfully.');
} catch (error) {
console.error('❌ Error during database seeding process:', error);
process.exit(1);
}
}

seed();
5. Append Scripts to package.json
   Append the following ecosystem management keys to the existing scripts node inside package.json:

JSON
{
"scripts": {
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"db:seed": "tsx src/seed.ts"
}
}
🚀 Migration & Execution Workflow
Once the configurations have been generated, immediately execute these tasks in your workspace runner:

Generate Migration Files: Automatically map the TypeScript model definitions down into standard SQL scripts:

Bash
npm run db:generate
Apply Database Schema Changes: Push generated schemas directly onto your live remote Neon database over HTTP:

Bash
npm run db:migrate
Execute Core Seed Pipeline: Run your seeding runner to load foundational cohorts, scenarios, and metadata entries into the initialized structure:

Bash
npm run db:seed
✅ Technical Validation Rules
Strict Driver Matching: Ensure all file paths reference @neondatabase/serverless using the HTTP sub-module client wrapper (drizzle-orm/neon-http). Do not use connection pools or WebSocket constructs.

Relational Map Accuracy: Table configurations must map clean application-layer properties (camelCase) directly to target table schema attributes (snake_case) using correct data typing parameters (varchar, text, etc.).

Credentials Isolation: Do not hardcode secret tokens, connection keys, or absolute URI parameters directly inside generated source configurations. Always source values dynamically out of process.env.
