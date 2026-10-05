/**
 * Hardcoded first-meeting phrases for the guest preview icebreaker.
 *
 * Same set for every target language; the LLM produces the target form in
 * its reply. Mirrors src/seed.ts Scenario 1 (First Meeting) as complete
 * sentences rather than "___" templates.
 *
 * Onboarding reuses these only when a domain has no vocabulary rows yet.
 */
export const TRYOUT_ICEBREAKER_PHRASES: ReadonlyArray<{ gloss: string; hint: string }> = [
  { gloss: 'Nice to meet you', hint: 'first-meeting greeting' },
  { gloss: 'My name is Alex', hint: 'self-introduction with your name' },
  { gloss: 'What is your name?', hint: "asking the other person's name" },
  { gloss: 'I am from Uganda', hint: 'stating where you are from' },
  { gloss: 'I look forward to knowing you', hint: 'warm closing after introduction' },
];
