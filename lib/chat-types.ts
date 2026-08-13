import { getTargetLangConfig } from '@/lib/language';

/* ── Shared types for the messaging UI ───────────────────── */

export interface ChatMemberLite {
  id: string;
  name: string;
  avatarSrc?: string | null;
  nativeLanguage?: string | null;
}

export interface ChatRoomLite {
  id: number;
  name: string;
  isGroup: boolean;
  members: ChatMemberLite[];
  lastMessage: {
    id: number;
    body: string;
    senderId: string | null;
    createdAt: string;
    audioUrl?: string | null;
  } | null;
  unreadCount: number;
  createdAt: string;
}

export interface ChatRoomDetailMember {
  id: string;
  name: string;
  avatarSrc: string | null;
  email: string | null;
  language: string;
}

export interface ChatRoomDetail {
  id: number;
  name: string | null;
  isGroup: boolean;
  createdAt: string;
  translationConfigured: boolean;
  members: ChatRoomDetailMember[];
}

export interface ChatMessage {
  id: number;
  senderId: string | null;
  senderName: string;
  senderAvatarSrc: string | null;
  body: string;                       // original text, as typed (or transcribed) by the sender
  sourceLanguage: string | null;
  translatedBody: string;             // shown to the reader by default
  translationProvider: 'ugajapa' | 'none';
  qualityScore?: number | null;
  audioUrl?: string | null;           // data: URL of a recorded voice clip (voice messages)
  audioMimeType?: string | null;
  audioDurationMs?: number | null;
  isMine: boolean;
  createdAt: string;
}

export interface SearchUser {
  id: string;
  name: string;
  email: string;
  avatarSrc: string | null;
  nativeLanguage: string | null;
}

/* ── Helpers ──────────────────────────────────────────────────────── */

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Flag + language name/code for a language code, e.g. "🇯🇵 JA" or "🇺🇬 LG". */
export function langFlag(code: string | null | undefined): { flag: string; label: string; nativeName: string } {
  if (!code) return { flag: '', label: 'Unknown', nativeName: 'Unknown' };
  const cfg = getTargetLangConfig(code);
  if (cfg && cfg.code === code) {
    return {
      flag: cfg.flag,
      label: `${cfg.name} (${code.toUpperCase()})`,
      nativeName: cfg.nativeName,
    };
  }
  return { flag: '', label: code.toUpperCase(), nativeName: code.toUpperCase() };
}