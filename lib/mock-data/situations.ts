/* ───────────────────────────────────────────────
   Situation fixtures — maps domain slug → list of situations
   Each situation has a counterpartRole that determines
   what the AI character's displayed role is in-session.
   ─────────────────────────────────────────────── */

import type { SkillLevel, BehaviorMode } from '@/lib/design-tokens';

export interface SituationFixture {
  id: number;
  domainSlug: string;
  title: string;
  context: string;
  skillLevel: SkillLevel;
  behaviorMode: BehaviorMode;
  learningGoals: string;
  focusPills: string[];
  displayOrder: number;
  counterpartRole: string;  // role the AI character plays in this situation
}

export const situations: SituationFixture[] = [
  // ── Restaurant ──────────────────────────────
  { id: 1,  domainSlug: 'restaurant', title: 'Order at the Counter',   context: 'Walk into a casual ramen shop and order your meal at the counter.',   skillLevel: 'beginner',     behaviorMode: 'standard', learningGoals: 'Order food using basic polite phrases', focusPills: ['Ordering Food', 'Numbers & Prices', 'Polite Phrases', 'Menu Items'], displayOrder: 1, counterpartRole: 'Waitress' },
  { id: 2,  domainSlug: 'restaurant', title: 'Make a Reservation',     context: 'Call a high-end restaurant to book a table for a business dinner.',  skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Make phone reservations with proper keigo', focusPills: ['Phone Etiquette', 'Dates & Times', 'Politeness Levels', 'Special Requests'], displayOrder: 2, counterpartRole: 'Restaurant Manager' },
  { id: 3,  domainSlug: 'restaurant', title: 'Handle a Complaint',     context: 'Your steak is overcooked and the service is slow — talk to the manager.', skillLevel: 'advanced',   behaviorMode: 'trouble',   learningGoals: 'Express dissatisfaction politely without being rude', focusPills: ['Complaints', 'Apologies', 'Tone Management', 'Resolution'], displayOrder: 3, counterpartRole: 'Restaurant Manager' },
  // ── Hotel ────────────────────────────────────
  { id: 5,  domainSlug: 'hotel', title: 'Check In',                   context: 'Arrive at a hotel and complete the check-in process.',               skillLevel: 'beginner',     behaviorMode: 'standard', learningGoals: 'Check in using basic Japanese', focusPills: ['Check-in Phrases', 'Identification', 'Room Preferences', 'Payment'], displayOrder: 1, counterpartRole: 'Front Desk Clerk' },
  { id: 6,  domainSlug: 'hotel', title: 'Request Housekeeping',       context: 'Ask for extra towels and late-night room service.',                  skillLevel: 'beginner',     behaviorMode: 'standard', learningGoals: 'Request services politely', focusPills: ['Requests', 'Room Items', 'Time Expressions', 'Gratitude'], displayOrder: 2, counterpartRole: 'Hotel Staff' },
  { id: 7,  domainSlug: 'hotel', title: 'Handle a Billing Issue',     context: 'Your bill has charges you did not make — dispute them at the front desk.', skillLevel: 'advanced',   behaviorMode: 'trouble',   learningGoals: 'Dispute charges calmly and clearly', focusPills: ['Numbers & Prices', 'Clarification', 'Assertiveness', 'Resolution'], displayOrder: 3, counterpartRole: 'Hotel Manager' },
  // ── Airport ─────────────────────────────────
  { id: 8,  domainSlug: 'airport', title: 'Check In for a Flight',    context: 'Check in at the airline counter and drop your luggage.',              skillLevel: 'beginner',     behaviorMode: 'standard', learningGoals: 'Complete check-in formalities', focusPills: ['Check-in', 'Luggage', 'Boarding Pass', 'Gate Information'], displayOrder: 1, counterpartRole: 'Airline Agent' },
  { id: 9,  domainSlug: 'airport', title: 'Flight Delay Announced',   context: 'Your flight is delayed by 5 hours — ask for compensation.',           skillLevel: 'intermediate', behaviorMode: 'trouble',   learningGoals: 'Handle unexpected changes assertively', focusPills: ['Delays', 'Compensation', 'Alternative Options', 'Persistence'], displayOrder: 2, counterpartRole: 'Airline Supervisor' },
  { id: 10, domainSlug: 'airport', title: 'Customs & Immigration',    context: 'Go through immigration and answer questions about your stay.',          skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Answer immigration questions clearly', focusPills: ['Purpose of Visit', 'Duration', 'Customs Declarations', 'Hotel Info'], displayOrder: 3, counterpartRole: 'Immigration Officer' },
  // ── Hospital ────────────────────────────────
  { id: 11, domainSlug: 'hospital', title: 'Describe Symptoms',        context: 'Visit a doctor and explain what is wrong.',                            skillLevel: 'beginner',     behaviorMode: 'standard', learningGoals: 'Describe basic symptoms using body vocabulary', focusPills: ['Body Parts', 'Symptoms', 'Duration', 'Pain Level'], displayOrder: 1, counterpartRole: 'Doctor' },
  { id: 12, domainSlug: 'hospital', title: 'Schedule an Appointment', context: 'Call a clinic to book a check-up appointment.',                        skillLevel: 'beginner',     behaviorMode: 'standard', learningGoals: 'Schedule appointments using polite forms', focusPills: ['Phone Etiquette', 'Dates & Times', 'Availability', 'Confirmation'], displayOrder: 2, counterpartRole: 'Receptionist' },
  { id: 13, domainSlug: 'hospital', title: 'Emergency Room Visit',    context: 'You have been rushed to the ER — communicate with the on-call doctor.', skillLevel: 'advanced',   behaviorMode: 'trouble',   learningGoals: 'Communicate under stress with limited vocabulary', focusPills: ['Emergency Phrases', 'Severity', 'Urgency', 'Medical History'], displayOrder: 3, counterpartRole: 'ER Doctor' },
  // ── Shopping ────────────────────────────────
  { id: 14, domainSlug: 'shopping', title: 'Ask About a Product',     context: 'Ask a store clerk about the features of a camera.',                    skillLevel: 'beginner',     behaviorMode: 'standard', learningGoals: 'Ask about product features and prices', focusPills: ['Product Inquiries', 'Colors & Sizes', 'Prices', 'Comparisons'], displayOrder: 1, counterpartRole: 'Shop Assistant' },
  { id: 15, domainSlug: 'shopping', title: 'Bargain at a Market',     context: 'Negotiate prices at a local flea market.',                             skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Use negotiation phrases and numbers', focusPills: ['Numbers', 'Bargaining', 'Quantity', 'Payment'], displayOrder: 2, counterpartRole: 'Vendor' },
  { id: 16, domainSlug: 'shopping', title: 'Return a Defective Item', context: 'Return a phone that stopped working after two days.',                  skillLevel: 'intermediate', behaviorMode: 'trouble',   learningGoals: 'Explain a problem and request a refund', focusPills: ['Complaints', 'Refunds', 'Explanations', 'Receipts'], displayOrder: 3, counterpartRole: 'Store Manager' },
  // ── Workplace ────────────────────────────────
  { id: 17, domainSlug: 'business', title: 'Introduce Yourself',      context: 'First day at a new job — introduce yourself to the team.',             skillLevel: 'beginner',     behaviorMode: 'standard', learningGoals: 'Give a self-introduction', focusPills: ['Self-introduction', 'Job Title', 'Hobbies', 'Politeness'], displayOrder: 1, counterpartRole: 'Colleague' },
  { id: 18, domainSlug: 'business', title: 'Join a Meeting',          context: 'Participate in a team meeting and give your opinion.',                  skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Express opinions and agree/disagree politely', focusPills: ['Meeting Phrases', 'Opinions', 'Agreeing', 'Disagreeing'], displayOrder: 2, counterpartRole: 'Team Lead' },
  { id: 19, domainSlug: 'business', title: 'Handle a Mistake',       context: 'You made an error on a report — explain to your manager.',              skillLevel: 'advanced',   behaviorMode: 'trouble',   learningGoals: 'Apologize professionally and propose solutions', focusPills: ['Apologies', 'Responsibility', 'Solutions', 'Keigo'], displayOrder: 3, counterpartRole: 'Manager' },
  // ── Travel ──────────────────────────────────
  { id: 20, domainSlug: 'travel', title: 'Ask for Directions',         context: 'You are lost in Shinjuku station — ask a passerby for help.',          skillLevel: 'beginner',     behaviorMode: 'standard', learningGoals: 'Ask for and understand directions', focusPills: ['Directions', 'Landmarks', 'Transport', 'Gratitude'], displayOrder: 1, counterpartRole: 'Local Resident' },
  { id: 21, domainSlug: 'travel', title: 'Buy a Train Ticket',        context: 'Purchase a Shinkansen ticket at the station counter.',                  skillLevel: 'beginner',     behaviorMode: 'standard', learningGoals: 'Buy tickets using basic Japanese', focusPills: ['Destinations', 'Ticket Types', 'Times', 'Payment'], displayOrder: 2, counterpartRole: 'Ticket Agent' },
  { id: 22, domainSlug: 'travel', title: 'Lost Baggage Claim',        context: 'Your luggage did not arrive — file a claim at the airport desk.',       skillLevel: 'intermediate', behaviorMode: 'trouble',   learningGoals: 'File a lost item report clearly', focusPills: ['Descriptions', 'Lost Items', 'Forms', 'Follow-up'], displayOrder: 3, counterpartRole: 'Baggage Clerk' },
  // ── Daily Life ──────────────────────────────
  { id: 23, domainSlug: 'daily_life', title: 'Meet a Neighbour',       context: 'Introduce yourself to a new neighbour in your apartment building.',    skillLevel: 'beginner',     behaviorMode: 'standard', learningGoals: 'Make small talk and basic introductions', focusPills: ['Greetings', 'Self-introduction', 'Small Talk', 'Neighbourhood'], displayOrder: 1, counterpartRole: 'Neighbour' },
  { id: 24, domainSlug: 'daily_life', title: 'Visit the Post Office',  context: 'Send a package overseas at the post office counter.',                   skillLevel: 'beginner',     behaviorMode: 'standard', learningGoals: 'Complete postal transactions', focusPills: ['Parcel Types', 'Destinations', 'Shipping Options', 'Payment'], displayOrder: 2, counterpartRole: 'Postal Clerk' },
  { id: 25, domainSlug: 'daily_life', title: 'Attend a Local Event',   context: 'Join a community festival and chat with locals.',                       skillLevel: 'intermediate', behaviorMode: 'standard', learningGoals: 'Engage in casual conversation at events', focusPills: ['Festival Vocabulary', 'Exclamations', 'Compliments', 'Participation'], displayOrder: 3, counterpartRole: 'Festival Goer' },
];

export function getSituationsByDomain(domainSlug: string): SituationFixture[] {
  return situations.filter((s) => s.domainSlug === domainSlug);
}

export function getSituationById(id: number): SituationFixture | undefined {
  return situations.find((s) => s.id === id);
}
