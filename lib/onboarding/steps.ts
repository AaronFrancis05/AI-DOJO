export interface StepConfig {
  key: string;
  title: string;
  subtitle: string;
  transition?: boolean;
  skippable?: boolean;
}

export const ONBOARDING_STEPS: StepConfig[] = [
  { key: 'level', title: 'What\'s your current level?', subtitle: 'This helps us match scenarios to your skill.' },
  { key: 'social-proof', title: 'You\'re in good company', subtitle: '', transition: true },
  { key: 'goal', title: 'What are you looking to achieve?', subtitle: 'We\'ll tailor your experience based on your goal.' },
  { key: 'transition-1', title: 'Great! Let\'s get you started!', subtitle: '', transition: true },
  { key: 'domain', title: 'What do you want to practice first?', subtitle: 'Pick a real-world scenario to start with.' },
  { key: 'mode', title: 'How do you want to practice?', subtitle: 'Choose your preferred way to interact.' },
  { key: 'transition-2', title: 'You\'re almost set up!', subtitle: '', transition: true },
  { key: 'age', title: 'How old are you?', subtitle: 'We\'ll adjust content difficulty accordingly.', skippable: true },
  { key: 'target-language', title: 'What language do you want to learn?', subtitle: 'This is the language you\'ll practise in every scenario.' },
  { key: 'native-language', title: 'What\'s your native language?', subtitle: 'This is the language you\'ll see translations in.' },
  { key: 'frequency', title: 'How often do you want to practice?', subtitle: 'Set your daily practice goal.' },
  { key: 'personalizing', title: 'Personalization in progress', subtitle: '', transition: true },
  { key: 'plan-ready', title: 'Your personalized plan is ready!', subtitle: '', transition: true },
  { key: 'account', title: 'Almost there!', subtitle: 'Create your account to save your progress.' },
];

/**
 * The tutor wizard.
 *
 * A tutor is not a learner: level, practice goal, domain and daily minutes
 * describe someone who practises, and asking a tutor for them (which is what
 * the `(app)` gate used to do) collects nothing anyone reads. What the
 * teaching surfaces actually need that the application form at `/auth/tutor`
 * does not already collect is the tutor's own language — rooms and the UI are
 * translated into it — and their bookable hours.
 *
 * Deliberately short. The teaching profile itself (headline, bio, languages
 * taught, timezone, rate) is collected once, at application time; re-asking
 * for it here would be a second way to write the same row.
 */
export const TUTOR_ONBOARDING_STEPS: StepConfig[] = [
  { key: 'welcome', title: 'Your application is in', subtitle: '', transition: true },
  { key: 'native-language', title: 'What language do you speak day to day?', subtitle: 'The app and your in-room translations appear in this language.' },
  { key: 'availability', title: 'When can learners book you?', subtitle: 'Set your weekly hours — you can change them any time from your console.', skippable: true },
  { key: 'ready', title: 'You\'re set up to teach', subtitle: '', transition: true },
];

export const TUTOR_STEP_KEYS = TUTOR_ONBOARDING_STEPS.map((s) => s.key);

export const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Beginner', description: 'I know a few basic words and phrases.' },
  { value: 'intermediate', label: 'Intermediate', description: 'I can hold simple conversations.' },
  { value: 'advanced', label: 'Advanced', description: 'I can discuss complex topics fluently.' },
];

export const GOAL_OPTIONS = [
  { value: 'basics', label: 'Learn the basics', description: 'Understand common phrases and expressions.' },
  { value: 'speaking', label: 'Improve speaking', description: 'Build confidence in real conversations.' },
  { value: 'fluent', label: 'Become fluent', description: 'Master natural, nuanced communication.' },
  { value: 'not-sure', label: 'Not sure yet', description: 'Explore and see what works for you.' },
];

export const MODE_OPTIONS = [
  { value: 'chat', label: 'Text Chat', description: 'Practice typing at your own pace, perfect for beginners.' },
  { value: 'voice', label: 'Voice', description: 'Speak naturally with real-time voice conversations.' },
  { value: 'avatar', label: '3D Avatar', description: 'Immerse yourself with a lifelike avatar companion.' },
  { value: '', label: 'No preference', description: 'Let me decide based on the situation.' },
];

export const AGE_OPTIONS = [
  { value: '18-24', label: '18–24' },
  { value: '25-34', label: '25–34' },
  { value: '35-44', label: '35–44' },
  { value: '45-54', label: '45–54' },
  { value: '55+', label: '55+' },
];

export const FREQUENCY_OPTIONS = [
  { value: 5, label: '5 min/day', description: 'Quick practice, easy to fit in.' },
  { value: 15, label: '15 min/day', description: 'Steady progress over time.' },
  { value: 30, label: '30 min/day', description: 'Balanced daily habit.' },
  { value: 60, label: '60 min/day', description: 'Deep immersion for fast results.' },
];
