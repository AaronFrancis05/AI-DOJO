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

