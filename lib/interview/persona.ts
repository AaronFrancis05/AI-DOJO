/**
 * Who the AI examiner is.
 *
 * The user's brief was "not avatar so basically a simple image can work", so
 * the interviewer is a still portrait, not the 3D rig — but the portrait and
 * the name come from `lib/avatar/catalog.ts`, the catalogue this app already
 * has, rather than from a second one invented for this feature. The catalogue
 * even ships the right character: `male_jp` / "Hikaru" is described there as
 * an AI Interview Agent who "conducts candidate assessments, fine-tuned
 * evaluations, and delivers structured feedback".
 *
 * Client-safe: no database, no server SDK. The room renders the portrait and
 * the token route builds the prompt from the same values.
 */

import {
  AVATAR_SOURCES,
  avatarRoleLine,
  getAvatar,
  isFemaleAvatarId,
} from '@/lib/avatar/catalog';

/** The catalogue entry used when a tutor never picked one. */
export const DEFAULT_INTERVIEWER_AVATAR_ID = 'male_jp';

/**
 * Gemini Live prebuilt voices. These are Google's own, unrelated to the Azure
 * voices in `lib/language.ts` — the Live model synthesises its own audio, so
 * `azureVoice` has nothing to say about it. Two, chosen to match the
 * portrait's presentation; verified working against this project's key.
 */
const VOICE_FEMININE = 'Aoede';
const VOICE_MASCULINE = 'Charon';

export interface InterviewerPersona {
  avatarId: string;
  name: string;
  /** One line of who they are, from the catalogue persona. */
  role: string;
  /** Still portrait — `/ai-avatars/thumbnails/<id>.webp`. */
  imageSrc: string;
  /** Gemini Live prebuilt voice name. */
  voiceName: string;
}

/**
 * Resolves a stored `assessment_sessions.ai_interviewer_avatar_id` to the
 * persona the room shows and the prompt speaks as.
 *
 * `getAvatar()` already falls back to the first catalogue entry for an
 * unknown id, so a row written before an avatar was retired still renders.
 */
export function interviewerPersona(avatarId: string | null | undefined): InterviewerPersona {
  const avatar = getAvatar(avatarId || DEFAULT_INTERVIEWER_AVATAR_ID);
  return {
    avatarId: avatar.id,
    name: avatar.name,
    role: avatarRoleLine(avatar),
    imageSrc: avatar.thumbnail,
    voiceName: isFemaleAvatarId(avatar.id) ? VOICE_FEMININE : VOICE_MASCULINE,
  };
}

/** Whether a tutor-supplied avatar id names a real catalogue entry. */
export function isKnownInterviewerAvatarId(avatarId: string): boolean {
  return AVATAR_SOURCES.some((a) => a.id === avatarId);
}

/**
 * The shortlist the tutor picks from when scheduling.
 *
 * Deliberately a handful rather than all 43: this is an examiner, and the
 * catalogue's costumed characters (the wizard, the cyborg, the racer) would
 * undercut the one thing an exam has to feel like. `male_jp` leads because it
 * is the catalogue's own interview persona.
 */
export const INTERVIEWER_CHOICE_IDS = [
  'male_jp',
  'female_jp',
  'business_white_lady',
  'formal_white_male',
  'female_ug',
  'male_ug',
] as const;

export function interviewerChoices(): InterviewerPersona[] {
  return INTERVIEWER_CHOICE_IDS.map((id) => interviewerPersona(id));
}
