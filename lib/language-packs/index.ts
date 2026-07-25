const GENERIC_TIER_DESCRIPTIONS: Record<string, string> = {
  beginner: 'Use only high-frequency, simple vocabulary and short sentences. Restate or simplify if the learner seems confused. Avoid complex grammar or register shifts.',
  intermediate: 'Use natural everyday vocabulary and standard register. Sentences can be of moderate length and complexity. Minimise hand-holding.',
  advanced: 'Use idiomatic, register-appropriate language with minimal simplification. Employ natural pacing, ellipsis, and culturally specific references as appropriate.',
};

function loadLanguagePack(langCode: string): Record<string, string> | null {
  try {
    switch (langCode) {
      case 'ja':
        return require('./ja/difficultyTiers').JA_DIFFICULTY_TIERS;
      case 'en':
        return require('./en/difficultyTiers').EN_DIFFICULTY_TIERS;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

const GENERIC_APPROPRIATENESS_RUBRIC = `Score expressionAppropriateness (0-15) based on how socially and situationally appropriate the user's expression was for the scene. This is NOT about grammatical correctness — it is about register, politeness level, and social fit. For example: using formal language with a superior vs casual speech with a peer; choosing a situationally fitting phrase rather than a technically correct but odd one; matching the formality expected by the scenario setting.`;

function loadAppropriatenessRubric(langCode: string): string | null {
  try {
    switch (langCode) {
      case 'ja':
        return require('./ja/appropriatenessRubric').JA_APPROPRIATENESS_RUBRIC;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function getAppropriatenessRubric(targetLanguage: string): string {
  const langSpecific = loadAppropriatenessRubric(targetLanguage);
  return langSpecific ?? GENERIC_APPROPRIATENESS_RUBRIC;
}

export function getDifficultyTierDescription(
  difficulty: string | undefined | null,
  targetLanguage: string,
): string {
  const tier = difficulty ?? 'beginner';
  const langPack = loadLanguagePack(targetLanguage);
  if (langPack && langPack[tier]) return langPack[tier];
  const generic = GENERIC_TIER_DESCRIPTIONS[tier] ?? GENERIC_TIER_DESCRIPTIONS.beginner;
  return generic;
}
